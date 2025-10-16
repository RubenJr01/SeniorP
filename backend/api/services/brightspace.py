from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from datetime import date, datetime, time, timedelta
from typing import Dict

import requests
from icalendar import Calendar
from django.utils import timezone
from rest_framework import status

from ..models import BrightspaceFeed, Event


class BrightspaceImportError(Exception):
    """Raised when a Brightspace import cannot be completed."""

    def __init__(self, message: str, http_status: int = status.HTTP_400_BAD_REQUEST) -> None:
        super().__init__(message)
        self.message = message
        self.http_status = http_status


@dataclass
class BrightspaceImportResult:
    created: int = 0
    updated: int = 0
    skipped: int = 0
    saved_url: bool = True
    used_saved_url: bool = False

    def to_dict(self) -> Dict[str, int | bool]:
        return asdict(self)


def import_brightspace_feed(user, ics_url: str | None) -> BrightspaceImportResult:
    """Download, parse, and persist Brightspace events for the given user."""
    provided_url = (ics_url or "").strip()
    feed_instance = None

    if provided_url:
        feed_instance, _ = BrightspaceFeed.objects.update_or_create(
            user=user,
            defaults={"ics_url": provided_url},
        )
        target_url = provided_url
        used_saved_url = False
    else:
        try:
            feed_instance = user.brightspace_feed
        except BrightspaceFeed.DoesNotExist as exc:
            raise BrightspaceImportError(
                "No saved Brightspace feed found. Please paste your iCal URL."
            ) from exc

        if not feed_instance.ics_url:
            raise BrightspaceImportError(
                "No saved Brightspace feed found. Please paste your iCal URL."
            )
        target_url = feed_instance.ics_url
        used_saved_url = True

    calendar = _download_and_parse_calendar(target_url)
    result = _ingest_calendar_events(user, calendar, target_url)
    result.used_saved_url = used_saved_url

    if feed_instance:
        feed_instance.last_imported_at = timezone.now()
        feed_instance.save(update_fields=["last_imported_at", "updated_at"])

    return result


def _download_and_parse_calendar(url: str) -> Calendar:
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise BrightspaceImportError(f"Failed to download ICS feed: {exc}") from exc

    try:
        return Calendar.from_ical(response.content)
    except ValueError as exc:
        raise BrightspaceImportError("The provided ICS feed is not valid.") from exc


def _ingest_calendar_events(user, calendar: Calendar, ics_url: str) -> BrightspaceImportResult:
    result = BrightspaceImportResult()

    for component in calendar.walk("vevent"):
        dtstart_prop = component.get("dtstart")
        if dtstart_prop is None:
            result.skipped += 1
            continue

        uid = str(component.get("uid", "")).strip()
        if not uid:
            result.skipped += 1
            continue

        defaults = _build_event_defaults(component, dtstart_prop, ics_url)
        if defaults is None:
            result.skipped += 1
            continue

        event, created = Event.objects.update_or_create(
            pilot=user,
            google_ical_uid=uid,
            defaults=defaults,
        )
        if created:
            result.created += 1
        else:
            result.updated += 1

    return result


def _build_event_defaults(component, dtstart_prop, ics_url: str) -> Dict | None:
    dtstart_raw = dtstart_prop.dt
    dtend_prop = component.get("dtend")
    duration_prop = component.get("duration")

    dtend_raw = dtend_prop.dt if dtend_prop else None
    duration_value = duration_prop.dt if duration_prop else None

    is_all_day = isinstance(dtstart_raw, date) and not isinstance(dtstart_raw, datetime)
    start_dt = _normalize_datetime(dtstart_raw)
    if start_dt is None:
        return None

    if dtend_raw is not None:
        end_dt = _normalize_datetime(dtend_raw)
        if end_dt is None:
            return None
        if is_all_day:
            end_dt = end_dt - timedelta(seconds=1)
    elif isinstance(duration_value, timedelta):
        end_dt = start_dt + duration_value
    else:
        end_dt = start_dt + (timedelta(days=1) if is_all_day else timedelta(hours=1))

    if end_dt <= start_dt:
        end_dt = start_dt + (timedelta(days=1) if is_all_day else timedelta(hours=1))

    summary = component.get("summary")
    description = component.get("description")
    location = component.get("location")

    title = str(summary) if summary else "Brightspace event"
    description_text = ""

    if description:
        raw_description = str(description)
        description_clean = re.sub(r"https?://\S+", "", raw_description, flags=re.IGNORECASE)
        description_text = description_clean.strip()

    if location:
        location_text = str(location)
        description_text = (
            f"{description_text}\nLocation: {location_text}".strip()
            if description_text
            else f"Location: {location_text}"
        )

    return {
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
        "google_ical_uid": str(component.get("uid", "")),
        "google_raw": {
            "source": "brightspace",
            "ics_url": ics_url,
        },
    }


def _normalize_datetime(value):
    if isinstance(value, datetime):
        if timezone.is_naive(value):
            return timezone.make_aware(value, timezone.get_current_timezone())
        return value

    if isinstance(value, date):
        naive = datetime.combine(value, time.min)
        return timezone.make_aware(naive, timezone.get_current_timezone())

    return None

