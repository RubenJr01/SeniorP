import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def send_notification_debug(message: str) -> str:
  """
  Placeholder task to verify Celery wiring.

  Replace or extend with real notification delivery logic (email/SMS/etc.).
  """
  print(f"[Celery] Notification debug task says: {message}")
  return message


@shared_task
def renew_gmail_watches():
  """
  Background task to renew Gmail watch subscriptions that are expiring soon.

  Should be run daily via Celery beat scheduler.
  Renews watches that expire within 24 hours.
  """
  from .models import GoogleAccount
  from .gmail_integration import renew_gmail_watch

  logger.info("Starting Gmail watch renewal task")

  # Find accounts with watches expiring in the next 24 hours
  threshold = timezone.now() + timedelta(hours=24)

  accounts_to_renew = GoogleAccount.objects.filter(
      watch_channel_id__isnull=False,
      watch_expires_at__lte=threshold,
      watch_expires_at__gt=timezone.now(),
  ).exclude(watch_channel_id="")

  renewed_count = 0
  failed_count = 0

  for account in accounts_to_renew:
      try:
          logger.info(f"Renewing Gmail watch for user {account.user_id} (expires: {account.watch_expires_at})")
          renew_gmail_watch(account)
          renewed_count += 1

      except Exception as e:
          logger.error(f"Failed to renew Gmail watch for user {account.user_id}: {e}", exc_info=True)
          failed_count += 1

  logger.info(f"Gmail watch renewal complete: {renewed_count} renewed, {failed_count} failed")

  return {
      "renewed": renewed_count,
      "failed": failed_count,
  }
