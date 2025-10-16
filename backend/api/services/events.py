from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from typing import Iterable, List, Tuple

from dateutil import parser as date_parser
from dateutil import rrule
from django.utils import timezone

from ..models import Event

# Window defaults (relative to "now") for the occurrences endpoint.
DEFAULT_WINDOW_BACK = timedelta(days=1)
DEFAULT_WINDOW_FORWARD = timedelta(days=90)
MAX_WINDOW_FORWARD = timedelta(days=365)
MAX_OCCURRENCES_PER_EVENT = 200

FREQUENCY_MAP = {
    Event.RecurrenceFrequency.DAILY: rrule.DAILY,
    Event.RecurrenceFrequency.WEEKLY: rrule.WEEKLY,
    Event.RecurrenceFrequency.MONTHLY: rrule.MONTHLY,
    Event.RecurrenceFrequency.YEARLY: rrule.YEARLY,
}


class InvalidWindowError(ValueError):
    """Raised when the requested occurrence window is invalid."""


@dataclass(frozen=True)
class Occurrence:
    event_id: int
    occurrence_id: str
    title: str
    description: str
    start: datetime
    end: datetime
    all_day: bool
    source: str
    is_recurring: bool
    recurrence_frequency: str
    recurrence_interval: int

    def to_dict(self) -> dict:
        return asdict(self)


def parse_occurrence_window(start_param: str | None, end_param: str | None) -> Tuple[datetime, datetime]:
    """Normalize the requested time window for occurrences."""
    now = timezone.now()
    default_start = now - DEFAULT_WINDOW_BACK
    default_end = now + DEFAULT_WINDOW_FORWARD

    try:
        window_start = date_parser.isoparse(start_param) if start_param else default_start
        window_end = date_parser.isoparse(end_param) if end_param else default_end
    except (ValueError, TypeError) as exc:
        raise InvalidWindowError("Invalid start or end parameter. Use ISO 8601 format.") from exc

    window_start = _ensure_aware(window_start)
    window_end = _ensure_aware(window_end)

    if window_end <= window_start:
        raise InvalidWindowError("End must be after start.")

    max_end = now + MAX_WINDOW_FORWARD
    if window_end > max_end:
        window_end = max_end

    return window_start, window_end


def collect_occurrences(user, window_start: datetime, window_end: datetime) -> List[dict]:
    """Produce serialized occurrences for the requested user within the window."""
    events = (
        Event.objects.filter(pilot=user)
        .select_related("pilot")
        .order_by("start")
    )

    occurrences: List[Occurrence] = []
    for event in events:
        occurrences.extend(_collect_event_occurrences(event, window_start, window_end))

    occurrences.sort(key=lambda occ: occ.start)
    return [occurrence.to_dict() for occurrence in occurrences]


def _collect_event_occurrences(event: Event, window_start: datetime, window_end: datetime) -> Iterable[Occurrence]:
    event_duration = event.end - event.start
    if event_duration.total_seconds() <= 0:
        event_duration = timedelta(minutes=1)

    if event.recurrence_frequency == Event.RecurrenceFrequency.NONE:
        if event.end >= window_start and event.start <= window_end:
            yield _build_occurrence(event, event.start, event.start + event_duration, is_recurring=False)
        return

    rule_kwargs: dict = {
        "dtstart": event.start,
        "interval": event.recurrence_interval,
    }

    if event.recurrence_count:
        rule_kwargs["count"] = event.recurrence_count

    if event.recurrence_end_date:
        rule_kwargs["until"] = _calculate_recurrence_until(event)

    rule = rrule.rrule(FREQUENCY_MAP[event.recurrence_frequency], **rule_kwargs)
    for idx, occurrence_start in enumerate(rule.between(window_start, window_end, inc=True), start=1):
        if idx > MAX_OCCURRENCES_PER_EVENT:
            break
        occurrence_end = occurrence_start + event_duration
        yield _build_occurrence(event, occurrence_start, occurrence_end, is_recurring=True)


def _build_occurrence(event: Event, start: datetime, end: datetime, *, is_recurring: bool) -> Occurrence:
    return Occurrence(
        event_id=event.id,
        occurrence_id=f"{event.id}:{start.isoformat()}",
        title=event.title,
        description=event.description or "",
        start=start,
        end=end,
        all_day=event.all_day,
        source=event.source,
        is_recurring=is_recurring,
        recurrence_frequency=event.recurrence_frequency,
        recurrence_interval=event.recurrence_interval,
    )


def _calculate_recurrence_until(event: Event) -> datetime:
    """Derive the `until` datetime for date-based recurrence end dates."""
    if not event.recurrence_end_date:
        return event.start

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
        end_time = end_time.replace(tzinfo=event.start.tzinfo)
    return end_time


def _ensure_aware(value: datetime) -> datetime:
    if timezone.is_naive(value):
        return timezone.make_aware(value, timezone.get_current_timezone())
    return value

