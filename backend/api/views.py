from django.shortcuts import render
from django.contrib.auth.models import User
from rest_framework import generics
from .serializers import UserSerializer
from rest_framework.permissions import IsAuthenticated, AllowAny

# Allowing to make registration form
class CreateUserView(generics.CreateAPIView):
  queryset = User.objects.all() # List of all objects when creating a new one so no duplicates
  serializer_class = User # Tells view what data we need to accept 
  permission_classes = [AllowAny] # Who can call this, even if they're not authenticated ONLY for the registration page/view
