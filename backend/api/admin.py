from django.contrib import admin

from .models import Invitation, EventAttendee


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
  list_display = ("email", "invited_by", "status", "created_at", "accepted_at")
  search_fields = ("email", "invited_by__username")
  list_filter = ("accepted_at", "expires_at")


@admin.register(EventAttendee)
class EventAttendeeAdmin(admin.ModelAdmin):
  list_display = ("event", "email", "response_status", "is_self", "is_organizer", "optional")
  list_filter = ("response_status", "is_self", "is_organizer", "optional")
  search_fields = ("email", "event__title")
