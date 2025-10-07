from django.db import models
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db.models import Q, F

class Event(models.Model):
  pilot = models.ForeignKey(User, on_delete=models.CASCADE, related_name="events")
  title = models.CharField(max_length=250)
  description = models.TextField(blank=True)
  start = models.DateTimeField()
  end = models.DateTimeField()
  all_day = models.BooleanField(default=False)
  created_at = models.DateTimeField(auto_now_add=True)
  updated_at = models.DateTimeField(auto_now=True)
  
  def __str__(self):
    return f"{self.title} {self.start} {self.end}"

  def clean(self):
    if self.start and self.end and self.end < self.start:
      raise ValidationError({"end": "End must be >= start."})

  def save(self, *args, **kwargs):
    self.full_clean()
    return super().save(*args, **kwargs)

  class Meta:
    constraints = [
      models.CheckConstraint(
        check=Q(end__gte=F("start")),
        name="event_end_gte_start",
      )
    ]

