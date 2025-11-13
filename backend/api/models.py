import uuid

from django.db import models
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db.models import Q, F
from django.utils import timezone


class Event(models.Model):
  class Source(models.TextChoices):
    LOCAL = "local", "Created in app"
    GOOGLE = "google", "Created in Google"
    SYNCED = "synced", "Synced between app and Google"
    BRIGHTSPACE = "brightspace", "Imported from Brightspace"

  class RecurrenceFrequency(models.TextChoices):
    NONE = "none", "Does not repeat"
    DAILY = "daily", "Daily"
    WEEKLY = "weekly", "Weekly"
    MONTHLY = "monthly", "Monthly"
    YEARLY = "yearly", "Yearly"

  pilot = models.ForeignKey(User, on_delete=models.CASCADE, related_name="events")
  title = models.CharField(max_length=250)
  description = models.TextField(blank=True)
  start = models.DateTimeField()
  end = models.DateTimeField()
  all_day = models.BooleanField(default=False)
  recurrence_frequency = models.CharField(
    max_length=10,
    choices=RecurrenceFrequency.choices,
    default=RecurrenceFrequency.NONE,
  )
  recurrence_interval = models.PositiveSmallIntegerField(default=1)
  recurrence_count = models.PositiveIntegerField(null=True, blank=True)
  recurrence_end_date = models.DateField(null=True, blank=True)
  source = models.CharField(
    max_length=20,
    choices=Source.choices,
    default=Source.LOCAL,
  )
  google_event_id = models.CharField(max_length=255, blank=True, default="")
  google_etag = models.CharField(max_length=255, blank=True, default="")
  google_ical_uid = models.CharField(max_length=255, blank=True, default="")
  google_updated = models.DateTimeField(null=True, blank=True)
  google_raw = models.JSONField(default=dict, blank=True)
  created_at = models.DateTimeField(auto_now_add=True)
  updated_at = models.DateTimeField(auto_now=True)

  def __str__(self):
    return f"{self.title} {self.start} {self.end}"

  def clean(self):
    if self.start and self.end and self.end < self.start:
      raise ValidationError({"end": "End must be >= start."})

    if self.recurrence_interval < 1:
      raise ValidationError({"recurrence_interval": "Interval must be at least 1."})

    if (
      self.recurrence_frequency != self.RecurrenceFrequency.NONE
      and self.recurrence_count is not None
      and self.recurrence_count < 1
    ):
      raise ValidationError({"recurrence_count": "Count must be greater than zero."})

    if (
      self.recurrence_frequency != self.RecurrenceFrequency.NONE
      and self.recurrence_end_date
      and self.start
      and self.recurrence_end_date < self.start.date()
    ):
      raise ValidationError({"recurrence_end_date": "End date must be after the start date."})

    if self.recurrence_frequency == self.RecurrenceFrequency.NONE:
      self.recurrence_interval = 1
      self.recurrence_count = None
      self.recurrence_end_date = None

  def save(self, *args, **kwargs):
    self.full_clean()
    return super().save(*args, **kwargs)

  @property
  def urgency_color(self):
    if not self.start:
        return "green"  
    now = timezone.now()
    time_left = self.start - now

    if time_left > timezone.timedelta(days=2):
        return "green"
    elif time_left > timezone.timedelta(days=1):
        return "yellow"
    else:
        return "red"

  class Meta:
    constraints = [
      models.CheckConstraint(
        check=Q(end__gte=F("start")),
        name="event_end_gte_start",
      ),
      models.UniqueConstraint(
        fields=["pilot", "google_event_id"],
        condition=~Q(google_event_id=""),
        name="unique_google_event_per_user",
      ),
      models.UniqueConstraint(
        fields=["pilot", "google_ical_uid"],
        condition=~Q(google_ical_uid=""),
        name="unique_google_ical_per_user",
      ),
    ]
    indexes = [
      models.Index(fields=["pilot", "google_event_id"]),
      models.Index(fields=["pilot", "google_ical_uid"]),
    ]


class EventAttendee(models.Model):
  class ResponseStatus(models.TextChoices):
    NEEDS_ACTION = "needsAction", "Needs action"
    ACCEPTED = "accepted", "Accepted"
    DECLINED = "declined", "Declined"
    TENTATIVE = "tentative", "Tentative"

  event = models.ForeignKey(
    Event,
    on_delete=models.CASCADE,
    related_name="attendees",
  )
  email = models.EmailField()
  display_name = models.CharField(max_length=255, blank=True)
  response_status = models.CharField(
    max_length=20,
    choices=ResponseStatus.choices,
    default=ResponseStatus.NEEDS_ACTION,
  )
  optional = models.BooleanField(default=False)
  is_organizer = models.BooleanField(default=False)
  is_self = models.BooleanField(default=False)
  raw = models.JSONField(default=dict, blank=True)
  created_at = models.DateTimeField(auto_now_add=True)
  updated_at = models.DateTimeField(auto_now=True)

  def save(self, *args, **kwargs):
    if self.email:
      self.email = self.email.strip().lower()
    return super().save(*args, **kwargs)

  def __str__(self):
    role = "self" if self.is_self else "attendee"
    return f"{self.email} ({role}) for {self.event_id}"

  class Meta:
    unique_together = (("event", "email"),)
    ordering = ["event_id", "email"]


class GoogleAccount(models.Model):
  user = models.OneToOneField(
    User,
    on_delete=models.CASCADE,
    related_name="google_account",
  )
  google_user_id = models.CharField(max_length=255)
  email = models.EmailField()
  access_token = models.TextField()
  refresh_token = models.TextField()
  token_expiry = models.DateTimeField(null=True, blank=True)
  scopes = models.TextField()
  sync_token = models.TextField(blank=True)
  last_synced_at = models.DateTimeField(null=True, blank=True)
  watch_channel_id = models.CharField(max_length=255, blank=True)
  watch_resource_id = models.CharField(max_length=255, blank=True)
  watch_expires_at = models.DateTimeField(null=True, blank=True)
  created_at = models.DateTimeField(auto_now_add=True)
  updated_at = models.DateTimeField(auto_now=True)

  def __str__(self):
    return f"{self.user.username} ({self.email})"


  class Meta:
    unique_together = (("user", "google_user_id"),)


class BrightspaceFeed(models.Model):
  user = models.OneToOneField(
    User,
    on_delete=models.CASCADE,
    related_name="brightspace_feed",
  )
  ics_url = models.URLField()
  last_imported_at = models.DateTimeField(null=True, blank=True)
  created_at = models.DateTimeField(auto_now_add=True)
  updated_at = models.DateTimeField(auto_now=True)

  def __str__(self):
    return f"{self.user.username} Brightspace feed"


class Notification(models.Model):
  class Type(models.TextChoices):
    EVENT_CREATED = "event_created", "Mission created"
    EVENT_UPDATED = "event_updated", "Mission updated"
    EVENT_DELETED = "event_deleted", "Mission deleted"
    GOOGLE_SYNC = "google_sync", "Google Calendar sync"
    BRIGHTSPACE_IMPORT = "brightspace_import", "Brightspace import"

  user = models.ForeignKey(
    User,
    on_delete=models.CASCADE,
    related_name="notifications",
  )
  event = models.ForeignKey(
    Event,
    on_delete=models.CASCADE,
    related_name="notifications",
    null=True,
    blank=True,
  )
  type = models.CharField(max_length=50, choices=Type.choices)
  title = models.CharField(max_length=255)
  message = models.TextField(blank=True)
  data = models.JSONField(default=dict, blank=True)
  read_at = models.DateTimeField(null=True, blank=True)
  created_at = models.DateTimeField(auto_now_add=True)
  updated_at = models.DateTimeField(auto_now=True)

  def __str__(self):
    return f"Notification({self.user.username}, {self.type})"

  class Meta:
    ordering = ["-created_at"]


class Invitation(models.Model):
  class Status(models.TextChoices):
    PENDING = "pending", "Pending"
    ACCEPTED = "accepted", "Accepted"
    EXPIRED = "expired", "Expired"

  token = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
  invited_by = models.ForeignKey(
    User,
    on_delete=models.CASCADE,
    related_name="sent_invitations",
  )
  email = models.EmailField()
  message = models.TextField(blank=True)
  accepted_at = models.DateTimeField(null=True, blank=True)
  accepted_by = models.ForeignKey(
    User,
    on_delete=models.SET_NULL,
    null=True,
    blank=True,
    related_name="accepted_invitations",
  )
  expires_at = models.DateTimeField(null=True, blank=True)
  last_sent_at = models.DateTimeField(null=True, blank=True)
  created_at = models.DateTimeField(auto_now_add=True)
  updated_at = models.DateTimeField(auto_now=True)

  def __str__(self):
    return f"Invitation to {self.email} by {self.invited_by.username}"

  def is_expired(self):
    if self.expires_at:
      return timezone.now() >= self.expires_at
    return False

  @property
  def status(self):
    if self.accepted_at:
      return self.Status.ACCEPTED
    if self.is_expired():
      return self.Status.EXPIRED
    return self.Status.PENDING

  class Meta:
    ordering = ["-created_at"]
