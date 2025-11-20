from django.conf import settings
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import serializers

from .models import Event, EventAttendee, Invitation, Notification, ParsedEmail

class UserSerializer(serializers.ModelSerializer):
    # Register a new user with a hashed password
    email = serializers.EmailField(required=False, allow_blank=True)
    invite_token = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ("id", "username", "password", "email", "invite_token")
        extra_kwargs = {
            "password": {"write_only": True},
            "email": {"required": False},
        }

    def validate(self, attrs):
        invite_token = attrs.get("invite_token")
        email = attrs.get("email")
        self._invitation = None

        if invite_token:
            try:
                invitation = Invitation.objects.select_related("invited_by").get(token=invite_token)
            except Invitation.DoesNotExist:
                raise serializers.ValidationError({"invite_token": "Invitation not found."})

            if invitation.status == Invitation.Status.ACCEPTED:
                raise serializers.ValidationError({"invite_token": "Invitation already accepted."})

            if invitation.status == Invitation.Status.EXPIRED:
                raise serializers.ValidationError({"invite_token": "Invitation expired."})

            if email and email.lower() != invitation.email.lower():
                raise serializers.ValidationError({"email": "Email does not match the invitation."})

            attrs["email"] = invitation.email
            self._invitation = invitation
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        validated_data.pop("invite_token", None)
        email = validated_data.pop("email", "")

        user = User(username=validated_data["username"])
        if email:
            user.email = email
        user.set_password(password)
        user.save()

        invitation = getattr(self, "_invitation", None)
        if invitation:
            invitation.accepted_at = timezone.now()
            invitation.accepted_by = user
            invitation.save(update_fields=["accepted_at", "accepted_by", "updated_at"])

        return user


class EventAttendeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventAttendee
        fields = (
            "id",
            "email",
            "display_name",
            "response_status",
            "optional",
            "is_organizer",
            "is_self",
        )
        read_only_fields = ("id", "is_organizer", "is_self")

class EventSerializer(serializers.ModelSerializer):
    # Expose pilot as ID, but don't allow client to set it
    pilot = serializers.PrimaryKeyRelatedField(read_only=True)
    # Show the pilot's username
    pilot_username = serializers.CharField(source="pilot.username", read_only=True)
    attendees = EventAttendeeSerializer(many=True, required=False)
    urgency_color = serializers.SerializerMethodField()

    def get_urgency_color(self, obj):
        now = timezone.now()
        time_diff = obj.start - now
        if time_diff.total_seconds() > 2 * 24 * 3600:
            return "green"   # More than 2 days
        elif time_diff.total_seconds() > 24 * 3600:
            return "yellow"  # Less than 2 days
        else:
            return "red"


    class Meta:
        model = Event
        fields = (
            "id",
            "title",
            "description",
            "start",
            "end",
            "all_day",
            "location",
            "emoji",
            "recurrence_frequency",
            "recurrence_interval",
            "recurrence_count",
            "recurrence_end_date",
            "source",
            "pilot",
            "pilot_username",
            "created_at",
            "updated_at",
            "attendees",
            "urgency_color",
        )

        read_only_fields = (
            "id",
            "pilot",
            "pilot_username",
            "source",
            "created_at",
            "updated_at",
            "urgency_color",
        )
        extra_kwargs = {
            "description": {"required": False, "allow_blank": True},
            "location": {"required": False, "allow_blank": True},
            "emoji": {"required": False, "allow_blank": True},
            "recurrence_count": {"required": False, "allow_null": True},
            "recurrence_end_date": {"required": False, "allow_null": True},
        }

    def create(self, validated_data):
        attendees_data = validated_data.pop("attendees", [])
        event = super().create(validated_data)
        self._replace_attendees(event, attendees_data)
        return event

    def update(self, instance, validated_data):
        attendees_data = validated_data.pop("attendees", None)
        event = super().update(instance, validated_data)
        if attendees_data is not None:
            self._replace_attendees(event, attendees_data)
        return event

    def _replace_attendees(self, event, attendees_data):
        if attendees_data is None:
            return

        normalized = []
        for attendee in attendees_data:
            email = (attendee.get("email") or "").strip().lower()
            if not email:
                continue
            normalized.append(
                {
                    "email": email,
                    "display_name": attendee.get("display_name", "").strip(),
                    "optional": bool(attendee.get("optional", False)),
                    "response_status": attendee.get(
                        "response_status",
                        EventAttendee.ResponseStatus.NEEDS_ACTION,
                    ),
                }
            )

        EventAttendee.objects.filter(event=event, is_self=False).delete()

        seen = set()
        for attendee in normalized:
            email = attendee["email"]
            if email in seen:
                continue
            status = attendee["response_status"]
            if status not in EventAttendee.ResponseStatus.values:
                status = EventAttendee.ResponseStatus.NEEDS_ACTION
            EventAttendee.objects.update_or_create(
                event=event,
                email=email,
                defaults={
                    "display_name": attendee["display_name"],
                    "optional": attendee["optional"],
                    "response_status": status,
                    "is_self": False,
                    "is_organizer": False,
                    "raw": {},
                },
            )
            seen.add(email)

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
    emoji = serializers.CharField(allow_blank=True, required=False)
    location = serializers.CharField(allow_blank=True, required=False)
    source = serializers.CharField()
    is_recurring = serializers.BooleanField()
    recurrence_frequency = serializers.CharField()
    recurrence_interval = serializers.IntegerField()
    attendees = serializers.ListField(
        child=serializers.DictField(),
        required=False,
    )
    self_response_status = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
    )
    can_rsvp = serializers.BooleanField(required=False)
    urgency_color = serializers.CharField(required=False)


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


class InvitationSerializer(serializers.ModelSerializer):
    invited_by_username = serializers.CharField(source="invited_by.username", read_only=True)
    accepted_by_username = serializers.CharField(source="accepted_by.username", read_only=True)
    status = serializers.SerializerMethodField()
    invite_url = serializers.SerializerMethodField()

    class Meta:
        model = Invitation
        fields = (
            "id",
            "email",
            "message",
            "token",
            "status",
            "invited_by_username",
            "accepted_by_username",
            "accepted_at",
            "accepted_by",
            "expires_at",
            "last_sent_at",
            "created_at",
            "updated_at",
            "invite_url",
            "urgency_color",
        )
        read_only_fields = (
            "id",
            "token",
            "status",
            "invited_by_username",
            "accepted_by_username",
            "accepted_at",
            "accepted_by",
            "expires_at",
            "last_sent_at",
            "created_at",
            "updated_at",
            "invite_url",
        )

    def get_status(self, invitation):
        return invitation.status

    def get_invite_url(self, invitation):
        base_url = settings.FRONTEND_APP_URL.rstrip("/")
        return f"{base_url}/register?invite={invitation.token}"


class ParsedEmailSerializer(serializers.ModelSerializer):
    """Serializer for AI-parsed email events awaiting user review."""
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    created_event_id = serializers.IntegerField(source="created_event.id", read_only=True)

    class Meta:
        model = ParsedEmail
        fields = (
            "id",
            "user_id",
            "username",
            "message_id",
            "subject",
            "email_body",
            "sender",
            "parsed_data",
            "status",
            "created_event_id",
            "parsed_at",
            "reviewed_at",
        )
        read_only_fields = (
            "id",
            "user_id",
            "username",
            "message_id",
            "created_event_id",
            "parsed_at",
            "reviewed_at",
        )
