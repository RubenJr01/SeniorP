from urllib.parse import urlencode
from datetime import datetime, timedelta, time, date

from dateutil import parser as date_parser
from dateutil import rrule
import requests
from icalendar import Calendar
from django.conf import settings
from django.contrib.auth.models import User
from django.http import HttpResponseRedirect
from django.utils import timezone
from rest_framework import generics, status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
import re

from .google_calendar import (
    GoogleSyncError,
    StateError,
    build_authorization_url,
    delete_event_on_google,
    complete_oauth_flow,
    revoke_google_account,
    run_two_way_sync,
)
from .models import Event, GoogleAccount, BrightspaceFeed, Notification
from .serializers import (
    UserSerializer,
    EventSerializer,
    EventOccurrenceSerializer,
    BrightspaceImportSerializer,
    NotificationSerializer,
)
from .notifications import create_notification

class CreateUserView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]


class EventViewSet(viewsets.ModelViewSet):
    # /api/events/      GET, POST
    #
    # /api/events/{id}      GET, PUT, PATCH, DELETE
    queryset = Event.objects.select_related("pilot").order_by("start")
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

        events = Event.objects.filter(pilot=request.user).order_by("start")
        occurrences = []

        freq_map = {
            Event.RecurrenceFrequency.DAILY: rrule.DAILY,
            Event.RecurrenceFrequency.WEEKLY: rrule.WEEKLY,
            Event.RecurrenceFrequency.MONTHLY: rrule.MONTHLY,
            Event.RecurrenceFrequency.YEARLY: rrule.YEARLY,
        }

        for event in events:
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
                            "source": event.source,
                            "is_recurring": False,
                            "recurrence_frequency": event.recurrence_frequency,
                            "recurrence_interval": event.recurrence_interval,
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
                occurrences.append(
                    {
                        "event_id": event.id,
                        "occurrence_id": f"{event.id}:{occurrence_start.isoformat()}",
                        "title": event.title,
                        "description": event.description,
                        "start": occurrence_start,
                        "end": occurrence_end,
                        "all_day": event.all_day,
                        "source": event.source,
                        "is_recurring": True,
                        "recurrence_frequency": event.recurrence_frequency,
                        "recurrence_interval": event.recurrence_interval,
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
    if provided_url:
      feed_instance, _ = BrightspaceFeed.objects.update_or_create(
        user=request.user,
        defaults={"ics_url": provided_url},
      )
      ics_url = provided_url
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
      response = requests.get(ics_url, timeout=15)
      response.raise_for_status()
    except requests.RequestException as exc:
      return Response(
        {"detail": f"Failed to download ICS feed: {exc}"},
        status=status.HTTP_400_BAD_REQUEST,
      )

    try:
      calendar = Calendar.from_ical(response.content)
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
        create_notification(
            user=request.user,
            type=Notification.Type.GOOGLE_SYNC,
            title="Google Calendar sync completed",
            message="Two-way sync with Google Calendar finished.",
            data={"stats": stats},
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
        create_notification(
            user=request.user,
            type=Notification.Type.GOOGLE_SYNC,
            title="Google Calendar disconnected",
            message="Google Calendar account has been disconnected.",
            data={"action": "disconnect"},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class GoogleOAuthCallbackView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        frontend_base = settings.FRONTEND_APP_URL.rstrip("/") or "http://localhost:5173"
        redirect_base = f"{frontend_base}"

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

        create_notification(
            user=account.user,
            type=Notification.Type.GOOGLE_SYNC,
            title="Google Calendar connected",
            message="Google Calendar account connected and initial sync complete.",
            data={"stats": stats, "action": "connect"},
        )

        summary = {
            "google_status": "success",
            "imported": stats.get("created", 0),
            "linked": stats.get("linked_existing", 0),
            "deduped": stats.get("deduped", 0),
        }
        encoded = urlencode({k: v for k, v in summary.items() if k == "google_status" or v})
        return HttpResponseRedirect(f"{redirect_base}?{encoded}")


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        limit_param = request.query_params.get("limit")
        try:
            limit = int(limit_param) if limit_param is not None else 20
        except (TypeError, ValueError):
            limit = 20
        limit = max(1, min(limit, 100))

        base_queryset = Notification.objects.filter(user=request.user)
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
