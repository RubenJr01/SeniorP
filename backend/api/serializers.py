from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import serializers
from .models import Event, Notification

class UserSerializer(serializers.ModelSerializer):
    # Register a new user with a hashed password
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
    # Expose pilot as ID, but don't allow client to set it
    pilot = serializers.PrimaryKeyRelatedField(read_only=True)
    # Show the pilot's username
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
        start = attrs.get("start")
        end = attrs.get("end")

        if start and timezone.is_naive(start):
            attrs["start"] = timezone.make_aware(start, timezone.get_current_timezone())
            start = attrs["start"]

        if end and timezone.is_naive(end):
            attrs["end"] = timezone.make_aware(end, start.tzinfo if start else timezone.get_current_timezone())
            end = attrs["end"]

        if start and end and end < start:
            raise serializers.ValidationError({"end": "End must be greater or equal to Start"})

        frequency = attrs.get("recurrence_frequency", getattr(self.instance, "recurrence_frequency", Event.RecurrenceFrequency.NONE))
        interval = attrs.get("recurrence_interval", getattr(self.instance, "recurrence_interval", 1))
        count = attrs.get("recurrence_count", getattr(self.instance, "recurrence_count", None))
        end_date = attrs.get("recurrence_end_date", getattr(self.instance, "recurrence_end_date", None))

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


class NotificationSerializer(serializers.ModelSerializer):
    event = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Notification
        fields = (
            "id",
            "type",
            "title",
            "message",
            "data",
            "event",
            "read_at",
            "created_at",
        )
        read_only_fields = fields
