from celery import shared_task


@shared_task
def send_notification_debug(message: str) -> str:
  """
  Placeholder task to verify Celery wiring.

  Replace or extend with real notification delivery logic (email/SMS/etc.).
  """
  print(f"[Celery] Notification debug task says: {message}")
  return message
