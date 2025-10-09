from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth.models import User
from django.http import HttpResponseRedirect
from rest_framework import generics, status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .google_calendar import (
    GoogleSyncError,
    StateError,
    build_authorization_url,
    delete_event_on_google,
    complete_oauth_flow,
    revoke_google_account,
    run_two_way_sync,
)
from .models import Event, GoogleAccount
from .serializers import UserSerializer, EventSerializer

class CreateUserView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]


class EventViewSet(viewsets.ModelViewSet):
    # /api/events/      GET, POST
    #
    # /api/events/{id}      GET, PUT, PATCH, DELETE
    queryset = Event.objects.select_related("pilot").order_by("start")
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return self.queryset.filter(pilot=self.request.user)

    def perform_create(self, serializer):
        serializer.save(pilot=self.request.user)

    def perform_destroy(self, instance):
        account = None
        try:
            account = instance.pilot.google_account
        except GoogleAccount.DoesNotExist:
            account = None

        if account and instance.google_event_id:
            try:
                delete_event_on_google(account, instance)
            except GoogleSyncError:
                # If Google deletion fails, fall back to local delete so the app stays responsive.
                pass

        instance.delete()


class GoogleStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            account = request.user.google_account
        except GoogleAccount.DoesNotExist:
            return Response({"connected": False})

        data = {
            "connected": True,
            "email": account.email,
            "last_synced_at": account.last_synced_at,
            "scopes": account.scopes.split() if account.scopes else [],
        }
        return Response(data)


class GoogleOAuthStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            auth_url, _ = build_authorization_url(request.user)
        except GoogleSyncError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"auth_url": auth_url})


class GoogleSyncView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            account = request.user.google_account
        except GoogleAccount.DoesNotExist:
            return Response(
                {"detail": "Google account not connected."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            stats = run_two_way_sync(account)
        except GoogleSyncError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({"stats": stats})


class GoogleDisconnectView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        try:
            account = request.user.google_account
        except GoogleAccount.DoesNotExist:
            return Response(status=status.HTTP_204_NO_CONTENT)

        revoke_google_account(account)
        return Response(status=status.HTTP_204_NO_CONTENT)


class GoogleOAuthCallbackView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        frontend_base = settings.FRONTEND_APP_URL.rstrip("/") or "http://localhost:5173"
        redirect_base = f"{frontend_base}"

        error = request.query_params.get("error")
        if error:
            params = {"google_status": "error", "message": error}
            return HttpResponseRedirect(f"{redirect_base}?{urlencode(params)}")

        state = request.query_params.get("state")
        code = request.query_params.get("code")
        if not state or not code:
            params = {"google_status": "error", "message": "missing_state_or_code"}
            return HttpResponseRedirect(f"{redirect_base}?{urlencode(params)}")

        try:
            account, stats = complete_oauth_flow(state, code)
        except (StateError, GoogleSyncError) as exc:
            params = {"google_status": "error", "message": str(exc) or "oauth_failed"}
            return HttpResponseRedirect(f"{redirect_base}?{urlencode(params)}")

        summary = {
            "google_status": "success",
            "imported": stats.get("created", 0),
            "linked": stats.get("linked_existing", 0),
            "deduped": stats.get("deduped", 0),
        }
        encoded = urlencode({k: v for k, v in summary.items() if k == "google_status" or v})
        return HttpResponseRedirect(f"{redirect_base}?{encoded}")
