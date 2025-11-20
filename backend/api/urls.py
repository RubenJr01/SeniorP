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
    ParseEmailView,
    ParsedEmailViewSet,
    GmailWatchWebhookView,
    GmailWatchManageView,
)

router = DefaultRouter()
router.register(r"events", EventViewSet, basename="event")
router.register(r"invitations", InvitationViewSet, basename="invitation")
router.register(r"parsed-emails", ParsedEmailViewSet, basename="parsed-email")

urlpatterns = [
    path("events/occurrences/", EventOccurrencesView.as_view(), name="event-occurrences"),
    path("events/parse-email/", ParseEmailView.as_view(), name="parse-email"),
    path("calendar/brightspace/import/", BrightspaceImportView.as_view(), name="calendar-brightspace-import"),
    path("", include(router.urls)),
    path("google/status/", GoogleStatusView.as_view(), name="google-status"),
    path("google/oauth/start/", GoogleOAuthStartView.as_view(), name="google-oauth-start"),
    path("google/oauth/callback/", GoogleOAuthCallbackView.as_view(), name="google-oauth-callback"),
    path("google/sync/", GoogleSyncView.as_view(), name="google-sync"),
    path("google/disconnect/", GoogleDisconnectView.as_view(), name="google-disconnect"),
    path("gmail/webhook/", GmailWatchWebhookView.as_view(), name="gmail-webhook"),
    path("gmail/watch/", GmailWatchManageView.as_view(), name="gmail-watch"),
    path("notifications/", NotificationListView.as_view(), name="notifications"),
    path("invitations/lookup/<uuid:token>/", InvitationLookupView.as_view(), name="invitation-lookup"),
]
