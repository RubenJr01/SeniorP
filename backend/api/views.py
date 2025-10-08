import logging
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth.models import User
from django.http import HttpResponseRedirect
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .google_calendar import (
  GoogleSyncError,
  StateError,
  build_authorization_url,
  complete_oauth_flow,
  push_event_to_google,
  delete_event_on_google,
  run_two_way_sync,
  revoke_google_account,
)
from .models import Event
from .serializers import UserSerializer, EventSerializer

logger = logging.getLogger(__name__)

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
  
  def perform_create(self, serializer):
    event = serializer.save(pilot=self.request.user)
    account = getattr(self.request.user, "google_account", None)
    if account:
      try:
        push_event_to_google(account, event)
      except GoogleSyncError as exc:
        logger.warning("Google sync failed while creating event: %s", exc)
      
class EventModification(generics.RetrieveUpdateDestroyAPIView):
  serializer_class = EventSerializer
  permission_classes = [IsAuthenticated]
  
  def get_queryset(self):
    return Event.objects.filter(pilot=self.request.user)

  def perform_update(self, serializer):
    event = serializer.save()
    account = getattr(self.request.user, "google_account", None)
    if account:
      try:
        push_event_to_google(account, event)
      except GoogleSyncError as exc:
        logger.warning("Google sync failed while updating event: %s", exc)

  def perform_destroy(self, instance):
    account = getattr(self.request.user, "google_account", None)
    if account:
      try:
        delete_event_on_google(account, instance)
      except GoogleSyncError as exc:
        logger.warning("Google sync failed while deleting event: %s", exc)
    return super().perform_destroy(instance)

# Allowing to make registration form
class CreateUserView(generics.CreateAPIView):
  queryset = User.objects.all() # List of all objects when creating a new one so no duplicates
  serializer_class = UserSerializer # Tells view what data we need to accept 
  permission_classes = [AllowAny] # Who can call this, even if they're not authenticated ONLY for the registration page/view


class GoogleOAuthStartView(APIView):
  permission_classes = [IsAuthenticated]

  def post(self, request):
    url, state = build_authorization_url(request.user)
    return Response({"auth_url": url, "state": state})


class GoogleOAuthCallbackView(APIView):
  permission_classes = [AllowAny]

  def get(self, request):
    redirect_params = {}
    error = request.query_params.get("error")
    state = request.query_params.get("state")
    code = request.query_params.get("code")

    if not state:
      redirect_params = {"google_status": "error", "message": "missing_state"}
    elif error:
      redirect_params = {"google_status": "error", "message": error}
    elif not code:
      redirect_params = {"google_status": "error", "message": "missing_code"}
    else:
      try:
        _, stats = complete_oauth_flow(state, code)
        redirect_params = {
          "google_status": "success",
        }
        if stats.get("created"):
          redirect_params["imported"] = str(stats.get("created", 0))
        if stats.get("linked_existing"):
          redirect_params["linked"] = str(stats.get("linked_existing"))
        if stats.get("deduped"):
          redirect_params["deduped"] = str(stats.get("deduped"))
      except StateError:
        redirect_params = {"google_status": "error", "message": "invalid_state"}
      except GoogleSyncError as exc:
        logger.exception("Google sync error during OAuth callback: %s", exc)
        redirect_params = {"google_status": "error", "message": "sync_failed"}

    query = urlencode(redirect_params)
    redirect_url = f"{settings.FRONTEND_APP_URL}/dashboard"
    if query:
      redirect_url = f"{redirect_url}?{query}"
    return HttpResponseRedirect(redirect_url)


class GoogleStatusView(APIView):
  permission_classes = [IsAuthenticated]

  def get(self, request):
    account = getattr(request.user, "google_account", None)
    if not account:
      return Response({"connected": False})
    return Response(
      {
        "connected": True,
        "email": account.email,
        "last_synced_at": account.last_synced_at,
        "scopes": account.scopes.split(),
      }
    )


class GoogleSyncNowView(APIView):
  permission_classes = [IsAuthenticated]

  def post(self, request):
    account = getattr(request.user, "google_account", None)
    if not account:
      return Response({"detail": "Google account not connected."}, status=status.HTTP_400_BAD_REQUEST)
    try:
      stats = run_two_way_sync(account)
    except GoogleSyncError as exc:
      logger.warning("Google sync failed: %s", exc)
      return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
    return Response({"detail": "Synced", "stats": stats})


class GoogleDisconnectView(APIView):
  permission_classes = [IsAuthenticated]

  def delete(self, request):
    account = getattr(request.user, "google_account", None)
    if not account:
      return Response(status=status.HTTP_204_NO_CONTENT)
    revoke_google_account(account)
    return Response(status=status.HTTP_204_NO_CONTENT)
