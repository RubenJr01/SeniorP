from django.contrib.auth.models import User
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
      "created_at",
      "updated_at",
      "pilot",
    ]
    read_only_fields = ["created_at", "updated_at", "pilot"]

  def validate(self, attrs):
    instance = getattr(self, "instance", None)
    start = attrs.get("start", getattr(instance, "start", None))
    end = attrs.get("end", getattr(instance, "end", None))
    if start and end and end < start:
      raise serializers.ValidationError({"end": "End must be >= start."})
    return attrs
