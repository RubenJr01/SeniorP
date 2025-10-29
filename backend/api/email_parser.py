"""
Email parsing module using Groq AI to extract calendar event details.
"""
import os
import json
import logging
from datetime import datetime
from typing import Dict, Any

from groq import Groq
from django.conf import settings

logger = logging.getLogger(__name__)


def parse_email_to_event(email_text: str) -> Dict[str, Any]:
    """
    Parse email text using Groq AI to extract calendar event details.

    Args:
        email_text: Raw email text content

    Returns:
        Dictionary with event fields: title, start, end, description, all_day

    Raises:
        ValueError: If parsing fails or required fields are missing
    """
    if not email_text or not email_text.strip():
        raise ValueError("Email text cannot be empty")

    # Get API key from environment
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY not configured in environment")

    # Initialize Groq client
    client = Groq(api_key=api_key)

    # Create the prompt for AI
    prompt = f"""You are a calendar event parser. Extract event details from the following email and return ONLY a valid JSON object with these exact fields:

- "title": string (required, the event name/subject)
- "start": ISO 8601 datetime string (required, e.g., "2025-01-15T14:00:00")
- "end": ISO 8601 datetime string (required, e.g., "2025-01-15T15:00:00")
- "description": string (optional, main content of email)
- "all_day": boolean (true if all-day event, false otherwise)

Rules:
1. If the email mentions "tomorrow", calculate from today's date
2. If no specific time mentioned, default to 10:00 AM - 11:00 AM
3. If duration mentioned (e.g., "2 hours"), calculate end time accordingly
4. Use the email subject line as the title if available
5. Return ONLY the JSON object, no other text

Email to parse:
{email_text}

JSON output:"""

    try:
        # Call Groq API
        logger.info("Calling Groq API to parse email")
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            model="llama-3.3-70b-versatile",  # Updated to current model (llama-3.1 was decommissioned)
            temperature=0.1,  # Low temperature for consistent parsing
            max_tokens=1024,
        )

        # Extract response
        response_text = chat_completion.choices[0].message.content.strip()
        logger.info(f"Groq API response: {response_text}")

        # Sometimes AI adds markdown code blocks, remove them
        if response_text.startswith("```json"):
            response_text = response_text.replace("```json", "").replace("```", "").strip()
        elif response_text.startswith("```"):
            response_text = response_text.replace("```", "").strip()

        # Parse JSON
        event_data = json.loads(response_text)

        # Validate required fields
        required_fields = ["title", "start", "end"]
        for field in required_fields:
            if field not in event_data:
                raise ValueError(f"Missing required field: {field}")

        # Convert ISO datetime strings to datetime objects
        event_data['start'] = datetime.fromisoformat(event_data['start'].replace('Z', '+00:00'))
        event_data['end'] = datetime.fromisoformat(event_data['end'].replace('Z', '+00:00'))

        # Ensure all_day defaults to False
        if 'all_day' not in event_data:
            event_data['all_day'] = False

        # Set default description if not provided
        if 'description' not in event_data or not event_data['description']:
            event_data['description'] = email_text.strip()

        logger.info(f"Successfully parsed email to event: {event_data['title']}")
        return event_data

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON from Groq response: {e}")
        raise ValueError(f"AI returned invalid JSON: {str(e)}")

    except Exception as e:
        logger.error(f"Error parsing email with Groq: {e}")
        raise ValueError(f"Failed to parse email: {str(e)}")
