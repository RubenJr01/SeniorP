from django.db import models
from django.contrib.auth.models import User

class Event(models.Model):
  title = models.CharField(max_length=250)
  start = models.DateTimeField()
  end = models.DateTimeField()
  all_day = models.DateTimeField(bool)
  created_at = models.DateTimeField(auto_now_add=True)
  updated_at = models.DateTimeField(auto_now=True)
  pilot = models.ForeignKey(User, on_delete=models.CASCADE, related_name="events")
  
  def __str__(self):
    return f"{self.title} {self.start} {self.end}"

