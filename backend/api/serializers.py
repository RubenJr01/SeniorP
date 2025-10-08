from datetime import timedelta, timezone as dt_timezone

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import serializers

from .models import Event

# ORM: Object Relational Mapping
class UserSerializer(serializers.ModelSerializer):
  class Meta:
    model = User # Built into django
    fields = ["id", "username", "password"]
    extra_kwargs = {"password": {"write_only": True}} # Accepts the password when creating user, but dont return password when giving info about user
    
  def create(self, validated_data):
    user = User.objects.create_user(**validated_data)
    return user


class EventSerializer(serializers.ModelSerializer):
  class Meta:
    model = Event
    fields = [
      "id",
      "title",
      "description",
      "start",
      "end",
      "all_day",
      "source",
      "google_event_id",
      "google_ical_uid",
      "google_updated",
      "created_at",
      "updated_at",
      "pilot",
    ]
    read_only_fields = [
      "created_at",
      "updated_at",
      "pilot",
      "source",
      "google_event_id",
      "google_ical_uid",
      "google_updated",
    ]

  def validate(self, attrs):
    instance = getattr(self, "instance", None)
    start = attrs.get("start", getattr(instance, "start", None))
    end = attrs.get("end", getattr(instance, "end", None))
    all_day = attrs.get("all_day", getattr(instance, "all_day", False))

    if all_day and start:
      if timezone.is_naive(start):
        start = timezone.make_aware(start, dt_timezone.utc)
      tz = start.tzinfo or dt_timezone.utc
      start = start.astimezone(tz).replace(hour=0, minute=0, second=0, microsecond=0)
      end = start + timedelta(days=1) - timedelta(microseconds=1)
      attrs["start"] = start
      attrs["end"] = end
    else:
      if start and timezone.is_naive(start):
        start = timezone.make_aware(start, dt_timezone.utc)
        attrs["start"] = start
      if end:
        if timezone.is_naive(end):
          tz = start.tzinfo if start else dt_timezone.utc
          end = timezone.make_aware(end, tz)
        attrs["end"] = end

    if start and end and end < start:
      raise serializers.ValidationError({"end": "End must be >= start."})
    return attrs
