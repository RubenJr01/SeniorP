from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    EventViewSet,
    EventOccurrencesView,
    BrightspaceImportView,
    BrightspaceStatusView,
    BrightspaceDisconnectView,
    GoogleDisconnectView,
    GoogleOAuthCallbackView,
    GoogleOAuthStartView,
    GoogleStatusView,
    GoogleSyncView,
)

router = DefaultRouter()
router.register(r"events", EventViewSet, basename="event")

urlpatterns = [
    path("events/occurrences/", EventOccurrencesView.as_view(), name="event-occurrences"),
    path("calendar/brightspace/import/", BrightspaceImportView.as_view(), name="calendar-brightspace-import"),
    path("brightspace/status/", BrightspaceStatusView.as_view(), name="brightspace-status"),
    path("brightspace/disconnect/", BrightspaceDisconnectView.as_view(), name="brightspace-disconnect"),
    path("", include(router.urls)),
    path("google/status/", GoogleStatusView.as_view(), name="google-status"),
    path("google/oauth/start/", GoogleOAuthStartView.as_view(), name="google-oauth-start"),
    path("google/oauth/callback/", GoogleOAuthCallbackView.as_view(), name="google-oauth-callback"),
    path("google/sync/", GoogleSyncView.as_view(), name="google-sync"),
    path("google/disconnect/", GoogleDisconnectView.as_view(), name="google-disconnect"),
]
