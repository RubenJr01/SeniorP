import logging
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Dict, Tuple, Optional

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from google.auth.transport.requests import Request
from google.oauth2 import id_token
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google_auth_oauthlib.flow import Flow

from .models import Event, GoogleAccount

UTC = dt_timezone.utc

logger = logging.getLogger(__name__)

User = get_user_model()

AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"
STATE_SALT = "api.google.state"


class StateError(Exception):
  """Raised when the OAuth state cannot be verified."""


class GoogleSyncError(Exception):
  """Raised when a Google API call fails in a non-recoverable way."""


def _client_config() -> Dict:
  return {
    "web": {
      "client_id": settings.GOOGLE_CLIENT_ID,
      "client_secret": settings.GOOGLE_CLIENT_SECRET,
      "auth_uri": AUTH_URI,
      "token_uri": TOKEN_URI,
      "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
    }
  }


def _build_flow(state: Optional[str] = None) -> Flow:
  if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
    raise GoogleSyncError("Google OAuth client is not configured.")
  flow = Flow.from_client_config(
    _client_config(),
    scopes=settings.GOOGLE_SCOPES,
    state=state,
  )
  flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
  return flow


def build_oauth_state(user: User) -> str:
  payload = {
    "user_id": user.pk,
    "ts": int(timezone.now().timestamp()),
  }
  return signing.dumps(payload, salt=STATE_SALT)


def parse_oauth_state(state: str) -> Dict:
  try:
    data = signing.loads(state, salt=STATE_SALT, max_age=600)
  except signing.BadSignature as exc:
    raise StateError("OAuth state is invalid or expired.") from exc
  return data


def build_authorization_url(user: User) -> Tuple[str, str]:
  state = build_oauth_state(user)
  flow = _build_flow(state)
  auth_url, _ = flow.authorization_url(
    access_type="offline",
    include_granted_scopes="true",
    prompt=settings.GOOGLE_OAUTH_PROMPT,
  )
  return auth_url, state


def exchange_code_for_tokens(state: str, code: str) -> Tuple[Credentials, Dict]:
  flow = _build_flow(state)
  flow.fetch_token(code=code)
  credentials: Credentials = flow.credentials
  request = Request()
  idinfo = id_token.verify_oauth2_token(
    credentials.id_token,
    request,
    settings.GOOGLE_CLIENT_ID,
  )
  return credentials, idinfo


def upsert_google_account(user: User, creds: Credentials, idinfo: Dict) -> GoogleAccount:
  defaults = {
    "google_user_id": idinfo.get("sub", ""),
    "email": idinfo.get("email", ""),
    "access_token": creds.token,
    "refresh_token": creds.refresh_token or "",
    "token_expiry": creds.expiry,
    "scopes": " ".join(sorted(creds.scopes or settings.GOOGLE_SCOPES)),
  }
  account, _ = GoogleAccount.objects.update_or_create(
    user=user,
    defaults=defaults,
  )
  return account


def refresh_credentials(account: GoogleAccount) -> Credentials:
  creds = Credentials(
    token=account.access_token,
    refresh_token=account.refresh_token or None,
    token_uri=TOKEN_URI,
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    scopes=account.scopes.split(),
  )
  if not creds.valid:
    if not creds.refresh_token:
      raise GoogleSyncError("Google refresh token is missing.")
    creds.refresh(Request())
    account.access_token = creds.token
    account.token_expiry = creds.expiry
    account.scopes = " ".join(sorted(creds.scopes or account.scopes.split()))
    account.save(update_fields=["access_token", "token_expiry", "scopes", "updated_at"])
  return creds


def build_service(account: GoogleAccount):
  creds = refresh_credentials(account)
  return build("calendar", "v3", credentials=creds, cache_discovery=False)


def _normalize_title(title: str) -> str:
  return (title or "").strip().lower()


def _parse_google_datetime(data: Dict) -> Tuple[datetime, bool]:
  if "dateTime" in data:
    dt = parse_datetime(data["dateTime"])
    if dt is None:
      raise GoogleSyncError("Unable to parse Google dateTime field.")
    if timezone.is_naive(dt):
      dt = timezone.make_aware(dt, UTC)
    return dt.astimezone(UTC), False
  if "date" in data:
    date_value = data["date"]
    dt = datetime.fromisoformat(f"{date_value}T00:00:00+00:00")
    return dt, True
  raise GoogleSyncError("Unknown Google event time format.")


def _render_google_datetime(dt: datetime, all_day: bool) -> Dict:
  if timezone.is_naive(dt):
    dt = timezone.make_aware(dt, UTC)
  if all_day:
    return {"date": dt.date().isoformat()}
  return {
    "dateTime": dt.astimezone(UTC).isoformat(),
    "timeZone": "UTC",
  }


def _event_defaults_from_google(google_event: Dict) -> Dict:
  start, all_day = _parse_google_datetime(google_event["start"])
  end, end_all_day = _parse_google_datetime(google_event["end"])
  if all_day != end_all_day:
    all_day = False
  if all_day:
    end = end - timedelta(seconds=1)
  description = google_event.get("description") or ""
  return {
    "title": google_event.get("summary") or "Untitled event",
    "description": description,
    "start": start,
    "end": end,
    "all_day": all_day,
    "google_event_id": google_event.get("id", ""),
    "google_etag": google_event.get("etag", ""),
    "google_ical_uid": google_event.get("iCalUID", ""),
    "google_updated": parse_datetime(google_event.get("updated"))
    if google_event.get("updated")
    else None,
    "google_raw": google_event,
  }


@transaction.atomic
def apply_google_event(account: GoogleAccount, google_event: Dict) -> Tuple[str, Optional[Event]]:
  user = account.user
  event_id = google_event.get("id", "")
  ical_uid = google_event.get("iCalUID", "")
  status = google_event.get("status")

  lookup = Event.objects.filter(pilot=user).filter(
    Q(google_event_id=event_id) | Q(google_ical_uid=ical_uid)
  )

  app_event_id = google_event.get("extendedProperties", {}).get("private", {}).get("app_event_id")
  if app_event_id:
    lookup = Event.objects.filter(pilot=user, pk=app_event_id) | lookup

  event = lookup.order_by("-updated_at").first()

  if status == "cancelled":
    if event:
      event.delete()
      return "deleted", None
    return "ignored", None

  defaults = _event_defaults_from_google(google_event)

  if event:
    for field, value in defaults.items():
      setattr(event, field, value)
    event.source = Event.Source.SYNCED
    event.save()
    return "updated", event

  event = Event.objects.create(
    pilot=user,
    source=Event.Source.GOOGLE,
    **defaults,
  )
  return "created", event


def pull_events_from_google(account: GoogleAccount) -> Dict[str, int]:
  service = build_service(account)
  stats = {"created": 0, "updated": 0, "deleted": 0, "ignored": 0}
  params = {
    "calendarId": "primary",
    "showDeleted": True,
    "singleEvents": True,
    "maxResults": 2500,
  }
  if account.sync_token:
    params["syncToken"] = account.sync_token
  else:
    window_start = timezone.now() - timedelta(days=90)
    window_start = window_start.astimezone(UTC)
    params["timeMin"] = window_start.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

  try:
    while True:
      response = service.events().list(**params).execute()
      for item in response.get("items", []):
        status, _ = apply_google_event(account, item)
        stats[status] = stats.get(status, 0) + 1

      page_token = response.get("nextPageToken")
      if not page_token:
        account.sync_token = response.get("nextSyncToken") or account.sync_token
        break
      params["pageToken"] = page_token
      params.pop("timeMin", None)
  except HttpError as exc:
    if exc.resp.status == 410:
      logger.info("Google sync token expired for user %s; resetting.", account.user_id)
      account.sync_token = ""
      account.save(update_fields=["sync_token", "updated_at"])
      return pull_events_from_google(account)
    raise GoogleSyncError(f"Google API error: {exc}") from exc

  account.last_synced_at = timezone.now()
  account.save(update_fields=["sync_token", "last_synced_at", "updated_at"])
  return stats
 
 
def _event_body_for_google(event: Event) -> Dict:
  body = {
    "summary": event.title,
    "description": event.description or "",
    "extendedProperties": {
      "private": {
        "app_event_id": str(event.pk),
      }
    },
  }
  if event.all_day:
    start_date = event.start.date()
    end_date = event.end.date() + timedelta(days=1)
    body["start"] = {"date": start_date.isoformat()}
    body["end"] = {"date": end_date.isoformat()}
  else:
    body["start"] = _render_google_datetime(event.start, False)
    body["end"] = _render_google_datetime(event.end, False)
  return body


def push_event_to_google(account: GoogleAccount, event: Event) -> Event:
  service = build_service(account)
  body = _event_body_for_google(event)

  if event.google_event_id:
    updated = service.events().patch(
      calendarId="primary",
      eventId=event.google_event_id,
      body=body,
      sendUpdates="all",
    ).execute()
  else:
    updated = service.events().insert(
      calendarId="primary",
      body=body,
      sendUpdates="all",
    ).execute()

  defaults = _event_defaults_from_google(updated)
  for field, value in defaults.items():
    setattr(event, field, value)
  event.source = Event.Source.SYNCED
  event.save()
  return event


def delete_event_on_google(account: GoogleAccount, event: Event):
  if not event.google_event_id:
    return
  service = build_service(account)
  try:
    service.events().delete(
      calendarId="primary",
      eventId=event.google_event_id,
      sendUpdates="all",
    ).execute()
  except HttpError as exc:
    if exc.resp.status in (404, 410):
      logger.info("Google event already removed for user %s.", account.user_id)
    else:
      raise GoogleSyncError(f"Failed to delete Google event: {exc}") from exc


def merge_existing_events(account: GoogleAccount) -> Dict[str, int]:
  stats = {"linked_existing": 0, "deduped": 0, "google_deleted": 0}
  user = account.user

  def key_for(event: Event) -> tuple:
    return (_normalize_title(event.title), event.start, event.end, event.all_day)

  google_events = list(Event.objects.filter(pilot=user, source=Event.Source.GOOGLE))
  if not google_events:
    return stats

  index: Dict[tuple, list[Event]] = {}
  for g_event in google_events:
    index.setdefault(key_for(g_event), []).append(g_event)

  # First pass: link pre-existing local events (no Google ID) with matching Google events.
  local_candidates = list(
    Event.objects.filter(pilot=user, source=Event.Source.LOCAL, google_event_id="")
  )
  for local in local_candidates:
    matches = index.get(key_for(local), [])
    matches = [m for m in matches if m.pk]
    if len(matches) != 1:
      continue
    g_event = matches.pop()
    index[key_for(local)] = matches
    transferred = {
      "google_event_id": g_event.google_event_id,
      "google_etag": g_event.google_etag,
      "google_ical_uid": g_event.google_ical_uid,
      "google_updated": g_event.google_updated,
      "google_raw": g_event.google_raw,
    }
    g_event.delete()
    local.source = Event.Source.SYNCED
    for field, value in transferred.items():
      setattr(local, field, value)
    local.save()
    stats["linked_existing"] += 1

  # Second pass: dedupe entries where both a synced event (with our private property)
  # and a Google-only event share the same details.
  service = None

  def ensure_service():
    nonlocal service
    if service is None:
      service = build_service(account)
    return service

  remaining_google_events = Event.objects.filter(pilot=user, source=Event.Source.GOOGLE)
  for g_event in remaining_google_events:
    private = g_event.google_raw.get("extendedProperties", {}).get("private", {})
    if private.get("app_event_id"):
      continue
    duplicates = Event.objects.filter(
      pilot=user,
      source=Event.Source.SYNCED,
      title__iexact=g_event.title,
      start=g_event.start,
      end=g_event.end,
      all_day=g_event.all_day,
    ).exclude(google_event_id=g_event.google_event_id)
    if duplicates.count() != 1:
      continue
    local = duplicates.first()
    old_google_id = local.google_event_id
    old_raw = local.google_raw
    transferred = {
      "google_event_id": g_event.google_event_id,
      "google_etag": g_event.google_etag,
      "google_ical_uid": g_event.google_ical_uid,
      "google_updated": g_event.google_updated,
      "google_raw": g_event.google_raw,
    }
    g_event.delete()
    for field, value in transferred.items():
      setattr(local, field, value)
    local.source = Event.Source.SYNCED
    local.save()
    stats["deduped"] += 1

    private_before = old_raw.get("extendedProperties", {}).get("private", {})
    if old_google_id and private_before.get("app_event_id"):
      try:
        ensure_service().events().delete(
          calendarId="primary",
          eventId=old_google_id,
          sendUpdates="none",
        ).execute()
        stats["google_deleted"] += 1
      except HttpError as exc:
        if exc.resp.status not in (404, 410):
          raise GoogleSyncError(f"Failed to delete duplicate Google event: {exc}") from exc

  return stats


def push_unsynced_events(account: GoogleAccount) -> int:
  count = 0
  unsynced = Event.objects.filter(
    pilot=account.user,
    source__in=[Event.Source.LOCAL, Event.Source.SYNCED],
  ).filter(Q(google_event_id="") | Q(google_event_id__isnull=True))
  for event in unsynced:
    push_event_to_google(account, event)
    count += 1
  return count


def run_two_way_sync(account: GoogleAccount) -> Dict[str, int]:
  stats = pull_events_from_google(account)
  merge_stats = merge_existing_events(account)
  stats.update(merge_stats)
  stats["pushed"] = push_unsynced_events(account)
  return stats


def revoke_google_account(account: GoogleAccount):
  account.delete()
  Event.objects.filter(
    pilot=account.user,
    source__in=[Event.Source.GOOGLE, Event.Source.SYNCED],
  ).update(
    google_event_id="",
    google_etag="",
    google_ical_uid="",
    google_updated=None,
    google_raw={},
    source=Event.Source.LOCAL,
  )


def complete_oauth_flow(state: str, code: str) -> Tuple[GoogleAccount, Dict[str, int]]:
  payload = parse_oauth_state(state)
  user = User.objects.get(pk=payload["user_id"])
  credentials, idinfo = exchange_code_for_tokens(state, code)
  account = upsert_google_account(user, credentials, idinfo)
  stats = run_two_way_sync(account)
  return account, stats
