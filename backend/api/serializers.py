from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import serializers
from .models import Event

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
            "location",
            "pilot",
            "pilot_username",
            "created_at",
            "updated_at",
        )

        read_only_fields = ("id", "pilot", "pilot_username", "created_at", "updated_at")
        extra_kwargs = {
            "description": {"required": False, "allow_blank": True},
            "location": {"required": False, "allow_blank": True},
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

        return attrs

