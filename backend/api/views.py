from urllib.parse import urlencode, urlparse, urljoin
from datetime import datetime, timedelta, time, date
import logging
import re
import ipaddress
import socket

from dateutil import parser as date_parser
from dateutil import rrule
import requests
from icalendar import Calendar
from django.conf import settings
from django.contrib.auth.models import User
from django.http import HttpResponseRedirect
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .google_calendar import (
    GoogleSyncError,
    StateError,
    build_authorization_url,
    delete_event_on_google,
    complete_oauth_flow,
    revoke_google_account,
    run_two_way_sync,
    update_attendee_response,
    push_event_to_google,
)
from .models import (
    Event,
    EventAttendee,
    GoogleAccount,
    BrightspaceFeed,
    Invitation,
    Notification,
    ParsedEmail,
)
from .serializers import (
    UserSerializer,
    EventSerializer,
    EventOccurrenceSerializer,
    BrightspaceImportSerializer,
    NotificationSerializer,
    InvitationSerializer,
    ParsedEmailSerializer,
)
from .notifications import create_notification
from .invitations import send_invitation_email

logger = logging.getLogger(__name__)
BRIGHTSPACE_MAX_BYTES = getattr(settings, "BRIGHTSPACE_MAX_ICS_BYTES", 5 * 1024 * 1024)
BRIGHTSPACE_REDIRECT_LIMIT = 3

class CreateUserView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]


class EventViewSet(viewsets.ModelViewSet):
    # /api/events/      GET, POST
    #
    # /api/events/{id}      GET, PUT, PATCH, DELETE
    queryset = Event.objects.select_related("pilot").prefetch_related("attendees").order_by("start")
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return self.queryset.filter(pilot=self.request.user)

    def perform_create(self, serializer):
        event = serializer.save(pilot=self.request.user)
        create_notification(
            user=self.request.user,
            type=Notification.Type.EVENT_CREATED,
            title=f"Mission scheduled: {event.title}",
            message=f"Mission starts {event.start.isoformat()}.",
            data={
                "event_id": event.pk,
                "action": "created",
                "start": event.start.isoformat(),
            },
            event=event,
        )
        self._sync_event_to_google(event)

    def perform_update(self, serializer):
        event = serializer.save()
        create_notification(
            user=self.request.user,
            type=Notification.Type.EVENT_UPDATED,
            title=f"Mission updated: {event.title}",
            message=f"Latest schedule {event.start.isoformat()} - {event.end.isoformat()}.",
            data={
                "event_id": event.pk,
                "action": "updated",
                "start": event.start.isoformat(),
                "end": event.end.isoformat(),
            },
            event=event,
        )
        self._sync_event_to_google(event)

    @action(detail=True, methods=["post"])
    def rsvp(self, request, pk=None):
        event = self.get_object()
        response_value = (request.data.get("response") or "").strip()
        valid_responses = set(EventAttendee.ResponseStatus.values)
        if response_value not in valid_responses:
            return Response(
                {"detail": "Invalid response choice."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            account = request.user.google_account
        except GoogleAccount.DoesNotExist:
            account = None

        attendee_email = None
        if account and account.email:
            attendee_email = account.email.strip().lower()
        elif request.user.email:
            attendee_email = request.user.email.strip().lower()

        if event.google_event_id:
            if not account:
                return Response(
                    {"detail": "Connect Google Calendar to respond to this invitation."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                update_attendee_response(account, event, response_value)
            except GoogleSyncError as exc:
                return Response(
                    {"detail": str(exc) or "Failed to update response on Google."},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            event.refresh_from_db()
        else:
            if attendee_email:
                attendee, _ = EventAttendee.objects.update_or_create(
                    event=event,
                    email=attendee_email,
                    defaults={
                        "response_status": response_value,
                        "is_self": True,
                        "raw": {},
                    },
                )
            else:
                attendee = EventAttendee.objects.filter(event=event, is_self=True).first()
                if attendee:
                    attendee.response_status = response_value
                    attendee.save(update_fields=["response_status", "updated_at"])

        if attendee_email:
            attendee = EventAttendee.objects.filter(
                event=event,
                email=attendee_email,
            ).first()
            if attendee and not attendee.is_self:
                attendee.is_self = True
                attendee.save(update_fields=["is_self", "updated_at"])

        hydrated = (
            Event.objects.select_related("pilot")
            .prefetch_related("attendees")
            .get(pk=event.pk)
        )
        serializer = EventSerializer(hydrated, context=self.get_serializer_context())
        return Response(serializer.data)

    def _sync_event_to_google(self, event):
        try:
            account = event.pilot.google_account
        except GoogleAccount.DoesNotExist:
            return event

        try:
            return push_event_to_google(account, event)
        except GoogleSyncError as exc:
            logger.warning("Failed to push event %s to Google: %s", event.pk, exc)
            return event

    def perform_destroy(self, instance):
        account = None
        try:
            account = instance.pilot.google_account
        except GoogleAccount.DoesNotExist:
            account = None

        if account and instance.google_event_id:
            try:
                delete_event_on_google(account, instance)
            except GoogleSyncError:
                # If Google deletion fails, fall back to local delete so the app stays responsive.
                pass

        payload = {
            "event_id": instance.pk,
            "action": "deleted",
            "start": instance.start.isoformat() if instance.start else None,
            "end": instance.end.isoformat() if instance.end else None,
            "source": instance.source,
        }
        title = instance.title
        instance.delete()
        create_notification(
            user=self.request.user,
            type=Notification.Type.EVENT_DELETED,
            title=f"Mission removed: {title}",
            message="Mission has been removed from the board.",
            data=payload,
        )


class EventOccurrencesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        default_start = now - timedelta(days=1)
        default_end = now + timedelta(days=90)

        start_param = request.query_params.get("start")
        end_param = request.query_params.get("end")

        try:
            window_start = date_parser.isoparse(start_param) if start_param else default_start
            window_end = date_parser.isoparse(end_param) if end_param else default_end
        except (ValueError, TypeError):
            return Response(
                {"detail": "Invalid start or end parameter. Use ISO 8601 format."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if timezone.is_naive(window_start):
            window_start = timezone.make_aware(window_start, timezone.get_current_timezone())
        if timezone.is_naive(window_end):
            window_end = timezone.make_aware(window_end, timezone.get_current_timezone())

        if window_end <= window_start:
            return Response(
                {"detail": "End must be after start."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        max_span = now + timedelta(days=365)
        if window_end > max_span:
            window_end = max_span

        events = (
            Event.objects.filter(pilot=request.user)
            .prefetch_related("attendees")
            .order_by("start")
        )
        occurrences = []

        freq_map = {
            Event.RecurrenceFrequency.DAILY: rrule.DAILY,
            Event.RecurrenceFrequency.WEEKLY: rrule.WEEKLY,
            Event.RecurrenceFrequency.MONTHLY: rrule.MONTHLY,
            Event.RecurrenceFrequency.YEARLY: rrule.YEARLY,
        }

        for event in events:
            attendee_objects = list(event.attendees.all())
            attendees_payload = [
                {
                    "email": attendee.email,
                    "display_name": attendee.display_name,
                    "response_status": attendee.response_status,
                    "is_self": attendee.is_self,
                    "is_organizer": attendee.is_organizer,
                    "optional": attendee.optional,
                }
                for attendee in attendee_objects
            ]
            self_attendee = next((a for a in attendee_objects if a.is_self), None)
            self_response_status = (
                self_attendee.response_status if self_attendee else None
            )
            can_rsvp = bool(self_attendee and event.google_event_id)
            event_duration = event.end - event.start
            if event_duration.total_seconds() <= 0:
                event_duration = timedelta(minutes=1)

            if event.recurrence_frequency == Event.RecurrenceFrequency.NONE:
                if event.end >= window_start and event.start <= window_end:
                    occurrences.append(
                        {
                            "event_id": event.id,
                            "occurrence_id": f"{event.id}:{event.start.isoformat()}",
                            "title": event.title,
                            "description": event.description,
                            "start": event.start,
                            "end": event.end,
                            "all_day": event.all_day,
                            "emoji": event.emoji,
                            "location": event.location,
                            "source": event.source,
                            "is_recurring": False,
                            "recurrence_frequency": event.recurrence_frequency,
                            "recurrence_interval": event.recurrence_interval,
                            "attendees": attendees_payload,
                            "self_response_status": self_response_status,
                            "can_rsvp": can_rsvp,
                            "urgency_color": event.urgency_color,
                        }
                    )
                continue

            rule_kwargs = {
                "dtstart": event.start,
                "interval": event.recurrence_interval,
            }

            if event.recurrence_count:
                rule_kwargs["count"] = event.recurrence_count
            if event.recurrence_end_date:
                if event.all_day:
                    end_time = datetime.combine(
                        event.recurrence_end_date,
                        datetime.max.time(),
                        tzinfo=event.start.tzinfo,
                    )
                else:
                    end_time = datetime.combine(
                        event.recurrence_end_date,
                        event.start.timetz(),
                    )
                rule_kwargs["until"] = end_time

            rule = rrule.rrule(freq_map[event.recurrence_frequency], **rule_kwargs)
            generated = 0
            for occurrence_start in rule.between(window_start, window_end, inc=True):
                occurrence_end = occurrence_start + event_duration
                # Calculate urgency color for this specific occurrence
                time_diff = occurrence_start - now
                if time_diff.total_seconds() > 2 * 24 * 3600:
                    urgency = "green"
                elif time_diff.total_seconds() > 24 * 3600:
                    urgency = "yellow"
                else:
                    urgency = "red"

                occurrences.append(
                    {
                        "event_id": event.id,
                        "occurrence_id": f"{event.id}:{occurrence_start.isoformat()}",
                        "title": event.title,
                        "description": event.description,
                        "start": occurrence_start,
                        "end": occurrence_end,
                        "all_day": event.all_day,
                        "emoji": event.emoji,
                        "location": event.location,
                        "source": event.source,
                        "is_recurring": True,
                        "recurrence_frequency": event.recurrence_frequency,
                        "recurrence_interval": event.recurrence_interval,
                        "attendees": attendees_payload,
                        "self_response_status": self_response_status,
                        "can_rsvp": can_rsvp,
                        "urgency_color": urgency,
                    }
                )
                generated += 1
                if generated >= 200:
                    break

        occurrences.sort(key=lambda item: item["start"])
        serializer = EventOccurrenceSerializer(occurrences, many=True)
        return Response(serializer.data)


class BrightspaceImportView(APIView):
  permission_classes = [IsAuthenticated]

  @staticmethod
  def _validate_ics_url(raw_url: str) -> str:
    parsed = urlparse(raw_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
      raise ValueError("ICS URL must be an absolute http(s) URL.")

    hostname = parsed.hostname
    if hostname is None:
      raise ValueError("ICS URL is missing a hostname.")

    try:
      addr_info = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
      raise ValueError(f"Could not resolve host {hostname}.") from exc

    for _, _, _, _, sockaddr in addr_info:
      ip_str = sockaddr[0]
      ip = ipaddress.ip_address(ip_str)
      if any(
        (
          ip.is_loopback,
          ip.is_link_local,
          ip.is_private,
          ip.is_reserved,
          ip.is_multicast,
        )
      ):
        raise ValueError("ICS URL resolves to a non-public address.")

    return parsed.geturl()

  @staticmethod
  def _resolve_redirect(current_url: str, location: str) -> str:
    next_url = urljoin(current_url, location)
    return BrightspaceImportView._validate_ics_url(next_url)

  def _download_ics(self, initial_url: str) -> bytes:
    session = requests.Session()
    current_url = initial_url

    for _ in range(BRIGHTSPACE_REDIRECT_LIMIT + 1):
      try:
        with session.get(
          current_url,
          timeout=15,
          stream=True,
          allow_redirects=False,
        ) as response:
          if response.is_redirect or response.status_code in (301, 302, 303, 307, 308):
            location = response.headers.get("Location")
            if not location:
              raise ValueError("Redirect response missing Location header.")
            current_url = self._resolve_redirect(current_url, location)
            continue

          response.raise_for_status()

          content_length = response.headers.get("Content-Length")
          if content_length:
            try:
              declared_size = int(content_length)
            except ValueError:
              declared_size = None
            else:
              if declared_size > BRIGHTSPACE_MAX_BYTES:
                raise ValueError("ICS feed exceeds allowed size.")

          buffer = bytearray()
          for chunk in response.iter_content(chunk_size=65536):
            buffer.extend(chunk)
            if len(buffer) > BRIGHTSPACE_MAX_BYTES:
              raise ValueError("ICS feed exceeds allowed size.")
          return bytes(buffer)
      except requests.RequestException as exc:
        raise ValueError(f"Failed to download ICS feed: {exc}") from exc

    raise ValueError("ICS feed exceeded redirect limit.")

  def get(self, request):
    try:
      feed = request.user.brightspace_feed
    except BrightspaceFeed.DoesNotExist:
      return Response({"connected": False})

    data = {
      "connected": True,
      "ics_url": feed.ics_url,
      "last_imported_at": feed.last_imported_at,
    }
    return Response(data)

  @staticmethod
  def _normalize_datetime(value):
    if isinstance(value, datetime):
      if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.get_current_timezone())
      return value
    if isinstance(value, date):
      naive = datetime.combine(value, time.min)
      return timezone.make_aware(naive, timezone.get_current_timezone())
    return None

  def post(self, request):
    serializer = BrightspaceImportSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    provided_url = serializer.validated_data.get("ics_url", "").strip()

    feed_instance = None
    safe_ics_url = None
    if provided_url:
      try:
        safe_ics_url = self._validate_ics_url(provided_url)
      except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
      feed_instance, _ = BrightspaceFeed.objects.update_or_create(
        user=request.user,
        defaults={"ics_url": safe_ics_url},
      )
      ics_url = safe_ics_url
    else:
      try:
        feed_instance = request.user.brightspace_feed
      except BrightspaceFeed.DoesNotExist:
        feed_instance = None
      if not feed_instance or not feed_instance.ics_url:
        return Response(
          {"detail": "No saved Brightspace feed found. Please paste your iCal URL."},
          status=status.HTTP_400_BAD_REQUEST,
        )
      ics_url = feed_instance.ics_url

      try:
        safe_ics_url = self._validate_ics_url(ics_url)
      except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
      ics_url = safe_ics_url

    try:
      ics_payload = self._download_ics(ics_url)
    except ValueError as exc:
      return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    try:
      calendar = Calendar.from_ical(ics_payload)
    except ValueError:
      return Response(
        {"detail": "The provided ICS feed is not valid."},
        status=status.HTTP_400_BAD_REQUEST,
      )

    created = 0
    updated = 0
    skipped = 0

    for component in calendar.walk("vevent"):
      dtstart_prop = component.get("dtstart")
      if dtstart_prop is None:
        skipped += 1
        continue

      uid = str(component.get("uid", "")).strip()
      if not uid:
        skipped += 1
        continue

      summary = component.get("summary")
      description = component.get("description")
      location = component.get("location")
      dtend_prop = component.get("dtend")
      duration_prop = component.get("duration")

      dtstart_raw = dtstart_prop.dt
      dtend_raw = dtend_prop.dt if dtend_prop else None
      duration_value = duration_prop.dt if duration_prop else None

      is_all_day = isinstance(dtstart_raw, date) and not isinstance(dtstart_raw, datetime)

      start_dt = self._normalize_datetime(dtstart_raw)
      if start_dt is None:
        skipped += 1
        continue

      if dtend_raw is not None:
        end_dt = self._normalize_datetime(dtend_raw)
        if end_dt is not None and is_all_day:
          end_dt = end_dt - timedelta(seconds=1)
      elif isinstance(duration_value, timedelta):
        end_dt = start_dt + duration_value
      else:
        end_dt = start_dt + (timedelta(days=1) if is_all_day else timedelta(hours=1))

      if end_dt <= start_dt:
        end_dt = start_dt + (timedelta(days=1) if is_all_day else timedelta(hours=1))

      description_text = ""
      if summary:
        title = str(summary)
      else:
        title = "Brightspace event"
      if description:
        raw_description = str(description)
        description_clean = re.sub(r"https?://\S+", "", raw_description, flags=re.IGNORECASE)
        description_text = description_clean.strip()
      if location:
        location_text = str(location)
        if description_text:
          description_text = f"{description_text}\nLocation: {location_text}"
        else:
          description_text = f"Location: {location_text}"

      defaults = {
        "title": title,
        "description": description_text,
        "start": start_dt,
        "end": end_dt,
        "all_day": is_all_day,
        "source": Event.Source.BRIGHTSPACE,
        "recurrence_frequency": Event.RecurrenceFrequency.NONE,
        "recurrence_interval": 1,
        "recurrence_count": None,
        "recurrence_end_date": None,
        "google_event_id": "",
        "google_etag": "",
        "google_ical_uid": uid,
        "google_raw": {
          "source": "brightspace",
          "ics_url": ics_url,
        },
      }

      event, event_created = Event.objects.update_or_create(
        pilot=request.user,
        google_ical_uid=uid,
        defaults=defaults,
      )
      if event_created:
        created += 1
      else:
        updated += 1

    if feed_instance:
      feed_instance.last_imported_at = timezone.now()
      feed_instance.save(update_fields=["last_imported_at", "updated_at"])

    summary = {
      "created": created,
      "updated": updated,
      "skipped": skipped,
      "saved_url": True,
      "used_saved_url": not bool(provided_url),
    }

    create_notification(
      user=request.user,
      type=Notification.Type.BRIGHTSPACE_IMPORT,
      title="Brightspace calendar import completed",
      message=f"Imported {created} new and updated {updated} missions.",
      data=summary,
    )

    return Response(summary, status=status.HTTP_200_OK)


class GoogleStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            account = request.user.google_account
        except GoogleAccount.DoesNotExist:
            return Response({"connected": False})

        data = {
            "connected": True,
            "email": account.email,
            "last_synced_at": account.last_synced_at,
            "scopes": account.scopes.split() if account.scopes else [],
        }
        return Response(data)


class GoogleOAuthStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            auth_url, _ = build_authorization_url(request.user)
        except GoogleSyncError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"auth_url": auth_url})


class GoogleSyncView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            account = request.user.google_account
        except GoogleAccount.DoesNotExist:
            return Response(
                {"detail": "Google account not connected."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            stats = run_two_way_sync(account)
        except GoogleSyncError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({"stats": stats})


class GoogleDisconnectView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        try:
            account = request.user.google_account
        except GoogleAccount.DoesNotExist:
            return Response(status=status.HTTP_204_NO_CONTENT)

        revoke_google_account(account)
        return Response(status=status.HTTP_204_NO_CONTENT)


class GoogleOAuthCallbackView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        frontend_base = settings.FRONTEND_APP_URL.rstrip("/") or "http://localhost:5173"
        redirect_path = getattr(settings, "GOOGLE_OAUTH_REDIRECT_PATH", "/dashboard")
        if not redirect_path.startswith("/"):
            redirect_path = f"/{redirect_path}"
        redirect_base = f"{frontend_base}{redirect_path}"

        error = request.query_params.get("error")
        if error:
            params = {"google_status": "error", "message": error}
            return HttpResponseRedirect(f"{redirect_base}?{urlencode(params)}")

        state = request.query_params.get("state")
        code = request.query_params.get("code")
        if not state or not code:
            params = {"google_status": "error", "message": "missing_state_or_code"}
            return HttpResponseRedirect(f"{redirect_base}?{urlencode(params)}")

        try:
            account, stats = complete_oauth_flow(state, code)
        except (StateError, GoogleSyncError) as exc:
            params = {"google_status": "error", "message": str(exc) or "oauth_failed"}
            return HttpResponseRedirect(f"{redirect_base}?{urlencode(params)}")

        # Automatically start Gmail watch if user has Gmail scope
        if "gmail" in account.scopes.lower():
            try:
                from .gmail_integration import start_gmail_watch
                start_gmail_watch(account)
                logger.info(f"Auto-started Gmail watch for user {account.user_id}")
            except Exception as exc:
                logger.warning(f"Failed to auto-start Gmail watch for user {account.user_id}: {exc}")
                # Don't break OAuth flow if Gmail watch fails

        summary = {
            "google_status": "success",
            "imported": stats.get("created", 0),
            "linked": stats.get("linked_existing", 0),
            "deduped": stats.get("deduped", 0),
        }
        encoded = urlencode({k: v for k, v in summary.items() if k == "google_status" or v})
        return HttpResponseRedirect(f"{redirect_base}?{encoded}")


class InvitationViewSet(viewsets.ModelViewSet):
    serializer_class = InvitationSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "delete", "head"]

    def get_queryset(self):
        return (
            Invitation.objects.filter(invited_by=self.request.user)
            .select_related("invited_by", "accepted_by")
            .order_by("-created_at")
        )

    def perform_create(self, serializer):
        expiry_days = getattr(settings, "INVITATION_EXPIRY_DAYS", 14)
        extra_kwargs = {"invited_by": self.request.user}
        if expiry_days:
            extra_kwargs["expires_at"] = timezone.now() + timedelta(days=expiry_days)
        invitation = serializer.save(**extra_kwargs)
        send_invitation_email(invitation)
        invitation.last_sent_at = timezone.now()
        invitation.save(update_fields=["last_sent_at", "updated_at"])

    @action(detail=True, methods=["post"])
    def resend(self, request, pk=None):
        invitation = self.get_object()
        if invitation.status == Invitation.Status.ACCEPTED:
            return Response(
                {"detail": "Invitation already accepted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if invitation.status == Invitation.Status.EXPIRED:
            return Response(
                {"detail": "Invitation expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        send_invitation_email(invitation)
        invitation.last_sent_at = timezone.now()
        invitation.save(update_fields=["last_sent_at", "updated_at"])
        serializer = self.get_serializer(invitation)
        return Response(serializer.data)


class InvitationLookupView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            invitation = Invitation.objects.select_related("invited_by", "accepted_by").get(token=token)
        except Invitation.DoesNotExist:
            return Response(
                {"detail": "Invitation not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = {
            "email": invitation.email,
            "status": invitation.status,
            "invited_by": invitation.invited_by.username,
            "accepted_at": invitation.accepted_at.isoformat() if invitation.accepted_at else None,
            "accepted_by": invitation.accepted_by.username if invitation.accepted_by else None,
            "expires_at": invitation.expires_at.isoformat() if invitation.expires_at else None,
        }
        return Response(data)


class ParsedEmailViewSet(viewsets.ModelViewSet):
    """ViewSet for managing AI-parsed email events awaiting user review."""
    serializer_class = ParsedEmailSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "patch", "delete", "head"]  # Added "post" for approve/reject actions

    def get_queryset(self):
        """Return parsed emails for current user, optionally filtered by status."""
        queryset = ParsedEmail.objects.filter(user=self.request.user).order_by("-parsed_at")

        # Filter by status if provided
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        return queryset

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """
        Approve a parsed email and create an event from it.
        Optionally accepts updated parsed_data in request body.
        """
        parsed_email = self.get_object()

        if parsed_email.status != ParsedEmail.Status.PENDING:
            return Response(
                {"detail": "This email has already been reviewed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Allow updating parsed_data before approval
        updated_data = request.data.get("parsed_data")
        if updated_data:
            parsed_email.parsed_data = updated_data

        try:
            from datetime import datetime as dt
            event_data = parsed_email.parsed_data

            # Convert ISO string datetimes back to datetime objects
            start_dt = event_data.get("start")
            if isinstance(start_dt, str):
                start_dt = dt.fromisoformat(start_dt.replace('Z', '+00:00'))

            end_dt = event_data.get("end")
            if isinstance(end_dt, str):
                end_dt = dt.fromisoformat(end_dt.replace('Z', '+00:00'))

            recurrence_end_dt = event_data.get("recurrence_end_date")
            if recurrence_end_dt and isinstance(recurrence_end_dt, str):
                recurrence_end_dt = dt.fromisoformat(recurrence_end_dt.replace('Z', '+00:00')).date()

            # Create event from parsed data
            event = Event.objects.create(
                pilot=request.user,
                source=Event.Source.LOCAL,
                title=event_data.get("title", "Untitled Event"),
                description=event_data.get("description", ""),
                start=start_dt,
                end=end_dt,
                all_day=event_data.get("all_day", False),
                location=event_data.get("location", ""),
                emoji=event_data.get("emoji", ""),
                recurrence_frequency=event_data.get("recurrence_frequency", "none"),
                recurrence_interval=event_data.get("recurrence_interval", 1),
                recurrence_count=event_data.get("recurrence_count"),
                recurrence_end_date=recurrence_end_dt,
            )

            # Create attendees if provided
            attendees_data = event_data.get("attendees", [])
            for attendee in attendees_data:
                if isinstance(attendee, str):
                    # Simple email string
                    EventAttendee.objects.create(
                        event=event,
                        email=attendee.strip().lower(),
                        display_name="",
                        response_status=EventAttendee.ResponseStatus.NEEDS_ACTION,
                    )
                elif isinstance(attendee, dict):
                    # Full attendee object
                    EventAttendee.objects.create(
                        event=event,
                        email=attendee.get("email", "").strip().lower(),
                        display_name=attendee.get("display_name", ""),
                        response_status=attendee.get("response_status", EventAttendee.ResponseStatus.NEEDS_ACTION),
                        optional=attendee.get("optional", False),
                    )

            # Update parsed email status
            parsed_email.status = ParsedEmail.Status.APPROVED
            parsed_email.created_event = event
            parsed_email.reviewed_at = timezone.now()
            parsed_email.save(update_fields=["status", "created_event", "reviewed_at", "parsed_data"])

            # Create notification
            create_notification(
                user=request.user,
                type=Notification.Type.EVENT_CREATED,
                title=f"Event created: {event.title}",
                message=f"You approved an email suggestion and created a new event",
                data={
                    "event_id": event.pk,
                    "parsed_email_id": parsed_email.pk,
                    "action": "approved_parsed_email",
                },
                event=event,
            )

            # Return created event
            event_serializer = EventSerializer(event, context={"request": request})
            return Response({
                "message": "Event created successfully",
                "event": event_serializer.data,
                "parsed_email": ParsedEmailSerializer(parsed_email).data,
            })

        except Exception as e:
            logger.error(f"Failed to create event from parsed email {pk}: {e}", exc_info=True)
            return Response(
                {"detail": f"Failed to create event: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """Reject a parsed email suggestion."""
        try:
            parsed_email = self.get_object()

            if parsed_email.status != ParsedEmail.Status.PENDING:
                return Response(
                    {"detail": "This email has already been reviewed."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            parsed_email.status = ParsedEmail.Status.REJECTED
            parsed_email.reviewed_at = timezone.now()
            parsed_email.save(update_fields=["status", "reviewed_at"])

            return Response({
                "message": "Email suggestion rejected",
                "parsed_email": ParsedEmailSerializer(parsed_email).data,
            })

        except Exception as e:
            logger.error(f"Failed to reject parsed email {pk}: {e}", exc_info=True)
            return Response(
                {"detail": f"Failed to reject: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        limit_param = request.query_params.get("limit")
        try:
            limit = int(limit_param) if limit_param is not None else 20
        except (TypeError, ValueError):
            limit = 20
        limit = max(1, min(limit, 100))

        base_queryset = Notification.objects.filter(user=request.user).exclude(
            type=Notification.Type.GOOGLE_SYNC
        )
        notifications = base_queryset.order_by("-created_at")[:limit]
        serializer = NotificationSerializer(notifications, many=True)
        unread_count = base_queryset.filter(read_at__isnull=True).count()
        return Response({
            "results": serializer.data,
            "unread_count": unread_count,
        })

    def post(self, request):
        ids = request.data.get("ids") or []
        mark_all = bool(request.data.get("all"))
        queryset = Notification.objects.filter(user=request.user, read_at__isnull=True)
        if not mark_all:
            if not isinstance(ids, list):
                return Response({"detail": "ids must be a list."}, status=status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(pk__in=ids)

        updated = queryset.update(read_at=timezone.now())
        return Response({"updated": updated})


class ParseEmailView(APIView):
    """
    API endpoint to parse email text and create a calendar event using AI.

    POST /api/events/parse-email/
    Body: {"email_text": "raw email content..."}
    Returns: Created event details
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        email_text = request.data.get("email_text", "").strip()

        if not email_text:
            return Response(
                {"error": "email_text is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from .email_parser import parse_email_to_event

            # Parse email using Groq AI
            logger.info(f"User {request.user.username} parsing email with Groq AI")
            event_data = parse_email_to_event(email_text)

            # Create the event
            event = Event.objects.create(
                pilot=request.user,
                source=Event.Source.LOCAL,
                title=event_data["title"],
                start=event_data["start"],
                end=event_data["end"],
                description=event_data.get("description", ""),
                all_day=event_data.get("all_day", False),
            )

            # Create notification
            create_notification(
                user=request.user,
                type=Notification.Type.EVENT_CREATED,
                title=f"Event created from email: {event.title}",
                message=f"AI parsed your email and created an event for {event.start.strftime('%Y-%m-%d %H:%M')}",
                data={
                    "event_id": event.pk,
                    "action": "parsed_from_email",
                    "start": event.start.isoformat(),
                },
                event=event,
            )

            # Serialize and return
            serializer = EventSerializer(event)
            logger.info(f"Successfully created event {event.pk} from email parsing")

            return Response(
                {
                    "message": "Event created successfully from email",
                    "event": serializer.data,
                },
                status=status.HTTP_201_CREATED,
            )

        except ValueError as e:
            logger.warning(f"Email parsing validation error: {e}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        except Exception as e:
            logger.error(f"Unexpected error parsing email: {e}", exc_info=True)
            return Response(
                {"error": "Failed to parse email. Please try again or check the format."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


@method_decorator(csrf_exempt, name='dispatch')
class GmailWatchWebhookView(APIView):
    """
    Webhook endpoint for Gmail push notifications from Google Cloud Pub/Sub.

    POST /api/gmail/webhook/
    Receives notifications when new emails arrive and processes calendar-related ones.
    """
    permission_classes = [AllowAny]  # Google Pub/Sub doesn't use user auth

    def post(self, request):
        """
        Handle incoming Gmail push notification.

        Google sends notifications in this format:
        {
          "message": {
            "data": "base64-encoded-data",
            "messageId": "...",
            "publishTime": "..."
          },
          "subscription": "..."
        }
        """
        try:
            import base64
            import json
            from django.db import IntegrityError
            from .gmail_integration import get_message_details, is_calendar_related, build_gmail_service
            from .email_parser import parse_email_to_event
            from .models import ParsedEmail

            # Extract message from Pub/Sub payload
            message_data = request.data.get("message", {})
            encoded_data = message_data.get("data", "")

            if not encoded_data:
                logger.warning("Received Gmail webhook with no data")
                return Response({"status": "ignored"}, status=status.HTTP_200_OK)

            # Decode the Pub/Sub message
            decoded_data = base64.b64decode(encoded_data).decode("utf-8")
            notification = json.loads(decoded_data)

            email_address = notification.get("emailAddress")
            history_id = notification.get("historyId")

            if not email_address or not history_id:
                logger.warning("Gmail webhook missing required fields")
                return Response({"status": "ignored"}, status=status.HTTP_200_OK)

            # Find the Google account by email
            try:
                account = GoogleAccount.objects.get(email=email_address)
            except GoogleAccount.DoesNotExist:
                logger.warning(f"No GoogleAccount found for email: {email_address}")
                return Response({"status": "ignored"}, status=status.HTTP_200_OK)

            # Process new messages since the last history ID
            logger.info(f"Processing Gmail notification for {email_address}, historyId: {history_id}")

            # Fetch and filter calendar-related messages
            service = build_gmail_service(account)
            parsed_emails_created = 0

            try:
                # Get the latest messages from inbox to check
                messages_response = service.users().messages().list(
                    userId="me",
                    labelIds=["INBOX"],
                    maxResults=5  # Check recent messages
                ).execute()

                messages = messages_response.get("messages", [])

                for msg in messages:
                    message_id = msg.get("id")
                    if not message_id:
                        continue

                    # Fetch full message details (subject, sender, content)
                    message_details = get_message_details(service, message_id)

                    if not message_details or not message_details.get("content"):
                        continue

                    # Check if calendar-related
                    if is_calendar_related(message_details["content"]):
                        logger.info(f"Found calendar-related email: {message_id} - {message_details.get('subject', 'No subject')}")

                        # Parse email with AI
                        try:
                            event_data = parse_email_to_event(message_details["content"])

                            # Convert datetime objects to ISO strings for JSON storage
                            json_safe_data = {**event_data}
                            if 'start' in json_safe_data and json_safe_data['start']:
                                json_safe_data['start'] = json_safe_data['start'].isoformat()
                            if 'end' in json_safe_data and json_safe_data['end']:
                                json_safe_data['end'] = json_safe_data['end'].isoformat()
                            if 'recurrence_end_date' in json_safe_data and json_safe_data['recurrence_end_date']:
                                json_safe_data['recurrence_end_date'] = json_safe_data['recurrence_end_date'].isoformat()

                            # Create ParsedEmail for user review (with deduplication)
                            try:
                                parsed_email = ParsedEmail.objects.create(
                                    user=account.user,
                                    message_id=message_id,
                                    subject=message_details.get("subject", "No subject"),
                                    email_body=message_details.get("content", ""),
                                    sender=message_details.get("sender", ""),
                                    parsed_data=json_safe_data,
                                    status=ParsedEmail.Status.PENDING,
                                )

                                # Create notification
                                create_notification(
                                    user=account.user,
                                    type=Notification.Type.EVENT_CREATED,  # Reusing existing type
                                    title=f"New event suggestion: {event_data.get('title', 'Untitled')}",
                                    message=f"Gmail found a calendar invitation from {message_details.get('sender', 'unknown sender')}. Review and approve to add to your calendar.",
                                    data={
                                        "parsed_email_id": parsed_email.pk,
                                        "action": "parsed_email_pending_review",
                                        "subject": message_details.get("subject", ""),
                                        "message_id": message_id,
                                    },
                                )

                                logger.info(f"Created ParsedEmail {parsed_email.pk} from Gmail message {message_id}")
                                parsed_emails_created += 1

                            except IntegrityError:
                                # Message already processed (deduplication)
                                logger.info(f"Gmail message {message_id} already processed, skipping")

                        except Exception as e:
                            logger.warning(f"Failed to parse calendar email {message_id}: {e}")

            except Exception as e:
                logger.error(f"Error processing Gmail messages: {e}", exc_info=True)

            return Response({
                "status": "processed",
                "parsed_emails_created": parsed_emails_created
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Error handling Gmail webhook: {e}", exc_info=True)
            return Response({"status": "error"}, status=status.HTTP_200_OK)


class GmailWatchManageView(APIView):
    """
    Manage Gmail watch subscription for automatic email monitoring.

    GET /api/gmail/watch/ - Get watch status
    POST /api/gmail/watch/ - Start watching Gmail
    DELETE /api/gmail/watch/ - Stop watching Gmail
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Get current Gmail watch status."""
        try:
            account = request.user.google_account
        except GoogleAccount.DoesNotExist:
            return Response(
                {"error": "Google Calendar not connected"},
                status=status.HTTP_404_NOT_FOUND,
            )

        from .gmail_integration import get_watch_status

        watch_status = get_watch_status(account)
        return Response(watch_status)

    def post(self, request):
        """Start Gmail watch subscription."""
        try:
            account = request.user.google_account
        except GoogleAccount.DoesNotExist:
            return Response(
                {"error": "Google Calendar not connected. Please connect first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if user has Gmail scope
        if "gmail" not in account.scopes.lower():
            return Response(
                {
                    "error": "Gmail access not authorized. Please reconnect your Google account to enable Gmail monitoring."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            from .gmail_integration import start_gmail_watch

            watch_data = start_gmail_watch(account)

            create_notification(
                user=request.user,
                type=Notification.Type.EVENT_CREATED,
                title="Gmail monitoring enabled",
                message="V-Cal will now automatically create events from calendar-related emails",
                data={
                    "action": "gmail_watch_started",
                    "expires_at": watch_data["expires_at"].isoformat(),
                },
            )

            return Response({
                "message": "Gmail monitoring started successfully",
                "watch": watch_data,
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Failed to start Gmail watch: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to start Gmail monitoring: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def delete(self, request):
        """Stop Gmail watch subscription."""
        try:
            account = request.user.google_account
        except GoogleAccount.DoesNotExist:
            return Response(
                {"error": "Google Calendar not connected"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            from .gmail_integration import stop_gmail_watch

            stop_gmail_watch(account)

            create_notification(
                user=request.user,
                type=Notification.Type.EVENT_UPDATED,
                title="Gmail monitoring disabled",
                message="V-Cal is no longer monitoring your Gmail for calendar invitations",
                data={"action": "gmail_watch_stopped"},
            )

            return Response({
                "message": "Gmail monitoring stopped successfully"
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Failed to stop Gmail watch: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to stop Gmail monitoring: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
