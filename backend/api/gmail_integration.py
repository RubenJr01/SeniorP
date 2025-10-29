import logging
import base64
import re
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Dict, Optional, List, Tuple
import uuid

from django.conf import settings
from django.utils import timezone
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import httplib2
from google_auth_httplib2 import AuthorizedHttp

from .models import GoogleAccount

logger = logging.getLogger(__name__)

TOKEN_URI = "https://oauth2.googleapis.com/token"

class GmailError(Exception):
    """Raised when a Gmail API call fails."""


def refresh_credentials(account: GoogleAccount) -> Credentials:
    """Refresh Google OAuth credentials if needed."""
    creds = Credentials(
        token=account.access_token,
        refresh_token=account.refresh_token or None,
        token_uri=TOKEN_URI,
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=account.scopes.split(),
    )
    if not creds.valid:
        if not creds.refresh_token:
            raise GmailError("Google refresh token is missing.")
        creds.refresh(Request())
        account.access_token = creds.token
        account.token_expiry = creds.expiry
        account.scopes = " ".join(sorted(creds.scopes or account.scopes.split()))
        account.save(update_fields=["access_token", "token_expiry", "scopes", "updated_at"])
    return creds


def build_gmail_service(account: GoogleAccount):
    """Build Gmail API service with authorized credentials."""
    creds = refresh_credentials(account)
    timeout = getattr(settings, "GOOGLE_API_TIMEOUT_SECONDS", 15)
    http = AuthorizedHttp(creds, http=httplib2.Http(timeout=timeout))
    return build("gmail", "v1", http=http, cache_discovery=False)


def start_gmail_watch(account: GoogleAccount) -> Dict:
    """
    Start watching for new Gmail messages.

    Returns watch details including channel_id, resource_id, and expiration.
    """
    if not settings.GOOGLE_PUBSUB_TOPIC:
        raise GmailError("GOOGLE_PUBSUB_TOPIC is not configured.")

    service = build_gmail_service(account)

    # Generate unique channel ID
    channel_id = f"vcal-gmail-{account.user_id}-{uuid.uuid4().hex[:8]}"

    # Request body for watch
    request_body = {
        "topicName": settings.GOOGLE_PUBSUB_TOPIC,
        "labelIds": ["INBOX"],  # Only watch inbox
        "labelFilterAction": "include"
    }

    try:
        response = service.users().watch(
            userId="me",
            body=request_body
        ).execute()

        # Extract details
        watch_data = {
            "channel_id": channel_id,
            "resource_id": response.get("historyId", ""),
            "expires_at": datetime.fromtimestamp(
                int(response.get("expiration", 0)) / 1000,
                tz=dt_timezone.utc
            ) if response.get("expiration") else timezone.now() + timedelta(days=7)
        }

        # Update account with watch details
        account.watch_channel_id = watch_data["channel_id"]
        account.watch_resource_id = watch_data["resource_id"]
        account.watch_expires_at = watch_data["expires_at"]
        account.save(update_fields=["watch_channel_id", "watch_resource_id", "watch_expires_at", "updated_at"])

        logger.info(f"Started Gmail watch for user {account.user_id}: {channel_id}")
        return watch_data

    except HttpError as exc:
        logger.error(f"Failed to start Gmail watch for user {account.user_id}: {exc}")
        raise GmailError(f"Failed to start Gmail watch: {exc}") from exc


def stop_gmail_watch(account: GoogleAccount):
    """Stop watching Gmail for the account."""
    service = build_gmail_service(account)

    try:
        service.users().stop(userId="me").execute()

        # Clear watch details
        account.watch_channel_id = ""
        account.watch_resource_id = ""
        account.watch_expires_at = None
        account.save(update_fields=["watch_channel_id", "watch_resource_id", "watch_expires_at", "updated_at"])

        logger.info(f"Stopped Gmail watch for user {account.user_id}")

    except HttpError as exc:
        logger.warning(f"Failed to stop Gmail watch for user {account.user_id}: {exc}")
        # Clear watch details anyway
        account.watch_channel_id = ""
        account.watch_resource_id = ""
        account.watch_expires_at = None
        account.save(update_fields=["watch_channel_id", "watch_resource_id", "watch_expires_at", "updated_at"])


def renew_gmail_watch(account: GoogleAccount) -> Dict:
    """Renew Gmail watch subscription (should be called before expiry)."""
    # Stop existing watch
    try:
        stop_gmail_watch(account)
    except Exception as exc:
        logger.warning(f"Error stopping old watch during renewal: {exc}")

    # Start new watch
    return start_gmail_watch(account)


def get_message_content(service, message_id: str, user_id: str = "me") -> Optional[str]:
    """
    Fetch the text content of a Gmail message.

    Returns the plain text body of the email, or None if not found.
    """
    try:
        message = service.users().messages().get(
            userId=user_id,
            id=message_id,
            format="full"
        ).execute()

        # Extract text from message payload
        payload = message.get("payload", {})
        text_content = _extract_text_from_payload(payload)

        return text_content

    except HttpError as exc:
        logger.error(f"Failed to fetch message {message_id}: {exc}")
        return None


def _extract_text_from_payload(payload: Dict) -> Optional[str]:
    """Extract plain text from email payload (handles multipart)."""
    # Check for plain text in body
    if "body" in payload and payload["body"].get("data"):
        return _decode_base64_url(payload["body"]["data"])

    # Check parts for multipart messages
    if "parts" in payload:
        for part in payload["parts"]:
            if part.get("mimeType") == "text/plain" and part.get("body", {}).get("data"):
                return _decode_base64_url(part["body"]["data"])

            # Recursively check nested parts
            if "parts" in part:
                text = _extract_text_from_payload(part)
                if text:
                    return text

    return None


def _decode_base64_url(data: str) -> str:
    """Decode base64url-encoded string."""
    try:
        # Gmail uses URL-safe base64 encoding
        decoded_bytes = base64.urlsafe_b64decode(data)
        return decoded_bytes.decode("utf-8", errors="ignore")
    except Exception as exc:
        logger.error(f"Failed to decode base64 data: {exc}")
        return ""


def is_calendar_related(email_content: str) -> bool:
    """
    Determine if an email appears to contain calendar/event information.

    Uses keyword matching to identify potential event invitations or scheduling emails.
    """
    if not email_content:
        return False

    # Convert to lowercase for case-insensitive matching
    content_lower = email_content.lower()

    # Calendar-related keywords and patterns
    calendar_keywords = [
        # Time indicators
        r'\b(meeting|appointment|event|conference|call|session)\b',
        r'\b(schedule|scheduled|scheduling)\b',
        r'\b(invite|invitation|invited)\b',

        # Date/time patterns
        r'\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b',
        r'\b(january|february|march|april|may|june|july|august|september|october|november|december)\b',
        r'\d{1,2}:\d{2}\s*(am|pm)',
        r'\d{1,2}/\d{1,2}/\d{2,4}',

        # Location indicators
        r'\b(room|location|venue|address)\b',
        r'\b(zoom|teams|meet|webex)\b',

        # Action words
        r'\b(rsvp|confirm|attendance|attending)\b',
        r'\b(reminder|upcoming)\b',
    ]

    # Count keyword matches
    matches = 0
    for pattern in calendar_keywords:
        if re.search(pattern, content_lower):
            matches += 1

    # Consider it calendar-related if we have at least 2 matches
    return matches >= 2


def list_recent_messages(account: GoogleAccount, max_results: int = 10) -> List[Dict]:
    """
    List recent messages from the user's inbox.

    Returns a list of message IDs and metadata.
    """
    service = build_gmail_service(account)

    try:
        response = service.users().messages().list(
            userId="me",
            labelIds=["INBOX"],
            maxResults=max_results
        ).execute()

        messages = response.get("messages", [])
        return messages

    except HttpError as exc:
        logger.error(f"Failed to list messages for user {account.user_id}: {exc}")
        raise GmailError(f"Failed to list messages: {exc}") from exc


def process_new_messages(account: GoogleAccount, history_id: str) -> List[Tuple[str, str]]:
    """
    Process new messages since the given history ID.

    Returns list of (message_id, content) tuples for calendar-related emails.
    """
    service = build_gmail_service(account)
    calendar_emails = []

    try:
        # Get history of changes since last check
        response = service.users().history().list(
            userId="me",
            startHistoryId=history_id,
            historyTypes=["messageAdded"],
            labelId="INBOX"
        ).execute()

        if "history" not in response:
            return calendar_emails

        # Process each history entry
        for history_item in response.get("history", []):
            messages_added = history_item.get("messagesAdded", [])

            for message_entry in messages_added:
                message = message_entry.get("message", {})
                message_id = message.get("id")

                if not message_id:
                    continue

                # Fetch full message content
                content = get_message_content(service, message_id)

                if content and is_calendar_related(content):
                    logger.info(f"Found calendar-related email: {message_id}")
                    calendar_emails.append((message_id, content))

        return calendar_emails

    except HttpError as exc:
        logger.error(f"Failed to process message history for user {account.user_id}: {exc}")
        return calendar_emails


def get_watch_status(account: GoogleAccount) -> Dict:
    """
    Get the current Gmail watch status for an account.

    Returns dict with 'active', 'expires_at', and 'needs_renewal' fields.
    """
    if not account.watch_channel_id or not account.watch_expires_at:
        return {
            "active": False,
            "expires_at": None,
            "needs_renewal": False
        }

    now = timezone.now()
    expires_at = account.watch_expires_at

    # Consider renewal needed if less than 1 day remaining
    needs_renewal = expires_at <= now + timedelta(days=1)

    return {
        "active": expires_at > now,
        "expires_at": expires_at.isoformat(),
        "needs_renewal": needs_renewal,
        "channel_id": account.watch_channel_id
    }
