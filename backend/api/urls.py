from django.urls import path
from . import views

urlpatterns = [
  path("events/", views.EventListCreate.as_view(), name="event-list"),
  path("events/<int:pk>/", views.EventModification.as_view(), name="event-detail")
]
