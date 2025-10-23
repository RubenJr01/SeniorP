from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    EventViewSet,
    EventOccurrencesView,
    BrightspaceImportView,
    GoogleDisconnectView,
    GoogleOAuthCallbackView,
    GoogleOAuthStartView,
    GoogleStatusView,
    GoogleSyncView,
    NotificationListView,
    InvitationViewSet,
    InvitationLookupView,
)

router = DefaultRouter()
router.register(r"events", EventViewSet, basename="event")
router.register(r"invitations", InvitationViewSet, basename="invitation")

urlpatterns = [
    path("events/occurrences/", EventOccurrencesView.as_view(), name="event-occurrences"),
    path("calendar/brightspace/import/", BrightspaceImportView.as_view(), name="calendar-brightspace-import"),
    path("", include(router.urls)),
    path("google/status/", GoogleStatusView.as_view(), name="google-status"),
    path("google/oauth/start/", GoogleOAuthStartView.as_view(), name="google-oauth-start"),
    path("google/oauth/callback/", GoogleOAuthCallbackView.as_view(), name="google-oauth-callback"),
    path("google/sync/", GoogleSyncView.as_view(), name="google-sync"),
    path("google/disconnect/", GoogleDisconnectView.as_view(), name="google-disconnect"),
    path("notifications/", NotificationListView.as_view(), name="notifications"),
    path("invitations/lookup/<uuid:token>/", InvitationLookupView.as_view(), name="invitation-lookup"),
]
