import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

app = Celery("backend")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# Configure periodic tasks
app.conf.beat_schedule = {
    'renew-gmail-watches-daily': {
        'task': 'api.tasks.renew_gmail_watches',
        'schedule': crontab(hour=2, minute=0),  # Run daily at 2 AM
    },
}


@app.task(bind=True)
def debug_task(self):
  """Simple debug task to confirm Celery is wired up."""
  print(f"Running debug task from {self.request!r}")
