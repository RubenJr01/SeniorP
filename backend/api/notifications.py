from __future__ import annotations

from typing import Any, Mapping, MutableMapping, TYPE_CHECKING

from django.utils import timezone

from .models import Event, Notification

if TYPE_CHECKING:  # pragma: no cover
    from django.contrib.auth.models import User


def create_notification(
    *,
    user: "User",
    type: Notification.Type,
    title: str,
    message: str | None = None,
    data: Mapping[str, Any] | None = None,
    event: Event | None = None,
) -> Notification:
    payload: MutableMapping[str, Any] = {"timestamp": timezone.now().isoformat()}
    if data:
        payload.update(data)
    notification = Notification.objects.create(
        user=user,
        type=type,
        title=title,
        message=message or "",
        data=payload,
        event=event,
    )
    return notification
