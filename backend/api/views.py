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
    user = self.request.user
    return Event.objects.filter(pilot=user) # Only able to view events written by user
  
  def create_event(self, serializer):
    if serializer.is_valid():
      serializer.save(pilot=self.request.user)
    else:
      print(serializer.errors)
      
class EventModification(generics.RetrieveUpdateDestroyAPIView):
  serializer_class = EventSerializer
  permission_classes = [IsAuthenticated]
  
  def get_queryset(self):
    user = self.request.user
    return Event.objects.filter(pilot=user)

# Allowing to make registration form
class CreateUserView(generics.CreateAPIView):
  queryset = User.objects.all() # List of all objects when creating a new one so no duplicates
  serializer_class = UserSerializer # Tells view what data we need to accept 
  permission_classes = [AllowAny] # Who can call this, even if they're not authenticated ONLY for the registration page/view
