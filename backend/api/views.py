from django.shortcuts import render
from django.contrib.auth.models import User
from rest_framework import generics
from .serializers import UserSerializer, EventSerializer
from rest_framework.permissions import IsAuthenticated, AllowAny
from .models import Event

# Creating event
class EventListCreate(generics.ListCreateAPIView): #List all events/create events
  serializer_class = EventSerializer
  permission_classes = [IsAuthenticated] # Can't call route unless you're authenticated
  
  def get_queryset(self):
    return Event.objects.filter(pilot=self.request.user).order_by("-start")
  
  def get_serializer_context(self):
    ctx = super().get_serializer_context()
    ctx.update({"request": self.request})
    return ctx
      
class EventModification(generics.RetrieveUpdateDestroyAPIView):
  serializer_class = EventSerializer
  permission_classes = [IsAuthenticated]
  
  def get_queryset(self):
    return Event.objects.filter(pilot=self.request.user)

# Allowing to make registration form
class CreateUserView(generics.CreateAPIView):
  queryset = User.objects.all() # List of all objects when creating a new one so no duplicates
  serializer_class = UserSerializer # Tells view what data we need to accept 
  permission_classes = [AllowAny] # Who can call this, even if they're not authenticated ONLY for the registration page/view
