from django.urls import path

from . import views

urlpatterns = [
  path("events/", views.EventListCreate.as_view(), name="event-list"),
  path("events/<int:pk>/", views.EventModification.as_view(), name="event-detail"),
  path("google/oauth/start/", views.GoogleOAuthStartView.as_view(), name="google-oauth-start"),
  path("google/oauth/callback/", views.GoogleOAuthCallbackView.as_view(), name="google-oauth-callback"),
  path("google/status/", views.GoogleStatusView.as_view(), name="google-status"),
  path("google/sync/", views.GoogleSyncNowView.as_view(), name="google-sync"),
  path("google/disconnect/", views.GoogleDisconnectView.as_view(), name="google-disconnect"),
]
