from __future__ import annotations

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
    complete_oauth_flow,
    delete_event_on_google,
    revoke_google_account,
    run_two_way_sync,
)
from .models import BrightspaceFeed, Event, GoogleAccount
from .serializers import (
    BrightspaceImportSerializer,
    EventOccurrenceSerializer,
    EventSerializer,
    UserSerializer,
)
from .services.brightspace import BrightspaceImportError, import_brightspace_feed
from .services.events import (
    InvalidWindowError,
    collect_occurrences,
    parse_occurrence_window,
)


# --------------------------------------------------------------------------- #
# User & authentication views
# --------------------------------------------------------------------------- #


class CreateUserView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]


# --------------------------------------------------------------------------- #
# Event views
# --------------------------------------------------------------------------- #


class EventViewSet(viewsets.ModelViewSet):
    """CRUD operations for mission events scoped to the authenticated pilot."""

    queryset = Event.objects.select_related("pilot").order_by("start")
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return self.queryset.filter(pilot=self.request.user)

    def perform_create(self, serializer):
        serializer.save(pilot=self.request.user)

    def perform_destroy(self, instance):
        account = getattr(instance.pilot, "google_account", None)
        if account and instance.google_event_id:
            try:
                delete_event_on_google(account, instance)
            except GoogleSyncError:
                # Fallback to local delete if Google API call fails.
                pass

        instance.delete()


class EventOccurrencesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            window_start, window_end = parse_occurrence_window(
                request.query_params.get("start"),
                request.query_params.get("end"),
            )
        except InvalidWindowError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        occurrences = collect_occurrences(request.user, window_start, window_end)
        serializer = EventOccurrenceSerializer(occurrences, many=True)
        return Response(serializer.data)


# --------------------------------------------------------------------------- #
# Brightspace import views
# --------------------------------------------------------------------------- #


class BrightspaceImportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = BrightspaceImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            result = import_brightspace_feed(request.user, serializer.validated_data.get("ics_url"))
        except BrightspaceImportError as exc:
            return Response({"detail": exc.message}, status=exc.http_status)

        return Response(result.to_dict(), status=status.HTTP_200_OK)


class BrightspaceStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            feed = request.user.brightspace_feed
        except BrightspaceFeed.DoesNotExist:
            return Response({"connected": False})

        return Response(
            {
                "connected": True,
                "last_imported_at": feed.last_imported_at,
            }
        )


class BrightspaceDisconnectView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        try:
            feed = request.user.brightspace_feed
        except BrightspaceFeed.DoesNotExist:
            return Response(status=status.HTTP_204_NO_CONTENT)

        feed.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Google integration views
# --------------------------------------------------------------------------- #


class GoogleStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            account = request.user.google_account
        except GoogleAccount.DoesNotExist:
            return Response({"connected": False})

        return Response(
            {
                "connected": True,
                "email": account.email,
                "last_synced_at": account.last_synced_at,
            }
        )


class GoogleOAuthStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            auth_url, _ = build_authorization_url(request.user)
        except GoogleSyncError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
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
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

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
        redirect_url = f"{settings.FRONTEND_APP_URL.rstrip('/') or 'http://localhost:5173'}/dashboard"

        error = request.query_params.get("error")
        if error:
            return _redirect_with_params(redirect_url, {"google_status": "error", "message": error})

        state = request.query_params.get("state")
        code = request.query_params.get("code")
        if not state or not code:
            return _redirect_with_params(
                redirect_url,
                {"google_status": "error", "message": "missing_state_or_code"},
            )

        try:
            _, stats = complete_oauth_flow(state, code)
        except (StateError, GoogleSyncError) as exc:
            return _redirect_with_params(
                redirect_url,
                {"google_status": "error", "message": str(exc) or "oauth_failed"},
            )

        summary = {
            "google_status": "success",
            "imported": stats.get("created", 0),
            "linked": stats.get("linked_existing", 0),
            "deduped": stats.get("deduped", 0),
        }
        payload = {key: value for key, value in summary.items() if key == "google_status" or value}
        return _redirect_with_params(redirect_url, payload)


def _redirect_with_params(base_url: str, params: dict) -> HttpResponseRedirect:
    return HttpResponseRedirect(f"{base_url}?{urlencode(params)}")

