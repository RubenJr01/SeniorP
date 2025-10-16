from django.db import models
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db.models import Q, F


class Event(models.Model):
  class Source(models.TextChoices):
    LOCAL = "local", "Created in app"
    GOOGLE = "google", "Created in Google"
    SYNCED = "synced", "Synced between app and Google"

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

