from __future__ import annotations

from datetime import datetime

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import serializers

from .models import Event

__all__ = [
    "UserSerializer",
    "EventSerializer",
    "EventOccurrenceSerializer",
    "BrightspaceImportSerializer",
]


class UserSerializer(serializers.ModelSerializer):
    """Register a new user with a hashed password."""

    class Meta:
        model = User
        fields = ("id", "username", "password")
        extra_kwargs = {"password": {"write_only": True}}

    def create(self, validated_data):
        user = User(username=validated_data["username"])
        user.set_password(validated_data["password"])
        user.save()
        return user


class EventSerializer(serializers.ModelSerializer):
    """Expose mission events while keeping pilot assignment server-side."""

    pilot = serializers.PrimaryKeyRelatedField(read_only=True)
    pilot_username = serializers.CharField(source="pilot.username", read_only=True)

    class Meta:
        model = Event
        fields = (
            "id",
            "title",
            "description",
            "start",
            "end",
            "all_day",
            "recurrence_frequency",
            "recurrence_interval",
            "recurrence_count",
            "recurrence_end_date",
            "source",
            "pilot",
            "pilot_username",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "pilot",
            "pilot_username",
            "source",
            "created_at",
            "updated_at",
        )
        extra_kwargs = {
            "description": {"required": False, "allow_blank": True},
            "recurrence_count": {"required": False, "allow_null": True},
            "recurrence_end_date": {"required": False, "allow_null": True},
        }

    def validate(self, attrs):
        start = self._ensure_awareness(attrs.get("start"))
        end = self._ensure_awareness(attrs.get("end"), reference=start)

        if start:
            attrs["start"] = start
        if end:
            attrs["end"] = end

        if start and end and end < start:
            raise serializers.ValidationError({"end": "End must be greater or equal to start."})

        frequency = attrs.get(
            "recurrence_frequency",
            getattr(self.instance, "recurrence_frequency", Event.RecurrenceFrequency.NONE),
        )
        interval = attrs.get(
            "recurrence_interval",
            getattr(self.instance, "recurrence_interval", 1),
        )
        count = attrs.get(
            "recurrence_count",
            getattr(self.instance, "recurrence_count", None),
        )
        end_date = attrs.get(
            "recurrence_end_date",
            getattr(self.instance, "recurrence_end_date", None),
        )

        if interval and interval < 1:
            raise serializers.ValidationError({"recurrence_interval": "Interval must be at least 1."})

        if frequency != Event.RecurrenceFrequency.NONE:
            if count is not None and count < 1:
                raise serializers.ValidationError({"recurrence_count": "Count must be greater than zero."})

            if end_date and start and end_date < start.date():
                raise serializers.ValidationError({"recurrence_end_date": "End date must be after the start date."})
        else:
            attrs["recurrence_interval"] = 1
            attrs["recurrence_count"] = None
            attrs["recurrence_end_date"] = None

        return attrs

    @staticmethod
    def _ensure_awareness(value, reference: datetime | None = None):
        if not value:
            return value
        if timezone.is_naive(value):
            tz = reference.tzinfo if reference else timezone.get_current_timezone()
            return timezone.make_aware(value, tz)
        return value


class EventOccurrenceSerializer(serializers.Serializer):
    event_id = serializers.IntegerField()
    occurrence_id = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField(allow_blank=True, required=False)
    start = serializers.DateTimeField()
    end = serializers.DateTimeField()
    all_day = serializers.BooleanField()
    source = serializers.CharField()
    is_recurring = serializers.BooleanField()
    recurrence_frequency = serializers.CharField()
    recurrence_interval = serializers.IntegerField()


class BrightspaceImportSerializer(serializers.Serializer):
    ics_url = serializers.URLField(required=False, allow_blank=True)
