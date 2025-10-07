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
    fields = ["id", "title", "description", "start", "end", "all_day", "created_at", "updated_at", "pilot"]
    read_only_f = ["created_at", "updated_at"]
    extra_kwargs = {"pilot": {"read_only": True}} # We should read who pilot is, but not author. 