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
        Dictionary with event fields: title, start, end, description, all_day,
        location, attendees, recurrence details

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
    current_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    prompt = f"""You are a calendar event parser. Extract event details from the following email and return ONLY a valid JSON object with these exact fields:

Required fields:
- "title": string (event name/subject)
- "start": ISO 8601 datetime string (e.g., "2025-01-15T14:00:00")
- "end": ISO 8601 datetime string (e.g., "2025-01-15T15:00:00")

Optional fields:
- "description": string (main content of email, exclude signatures)
- "all_day": boolean (true if all-day event, false otherwise, default: false)
- "location": string (physical address, room number, or virtual meeting link like Zoom/Teams/Meet)
- "attendees": array of strings (email addresses or names of participants mentioned, exclude the recipient)
- "recurrence_frequency": string (one of: "none", "daily", "weekly", "monthly", "yearly", default: "none")
- "recurrence_interval": number (repeat every N days/weeks/months/years, default: 1)
- "recurrence_count": number (number of occurrences, null if no end specified)
- "recurrence_end_date": ISO 8601 date string (last occurrence date, null if count specified or infinite)
- "timezone": string (timezone identifier like "America/New_York", default: "UTC")

Parsing Rules:
1. Current date/time for reference: {current_date}
2. Parse relative dates: "tomorrow", "next Tuesday", "in 2 weeks", etc.
3. If no specific time mentioned, default to 10:00 AM - 11:00 AM
4. If duration mentioned (e.g., "2 hours", "30 minutes"), calculate end time
5. Extract location from phrases like "in Conference Room B", "at 123 Main St", "via Zoom link:", "Teams meeting"
6. Extract attendees from "cc:", "to:", or phrases like "with John and Mary", "team members"
7. Detect recurrence from: "every day", "weekly", "every Monday", "monthly meeting", "annual review"
8. For recurrence: if "for 4 weeks" → count=4, if "until March 1st" → end_date, if "every week" → no count/end
9. Use email subject as title if available and descriptive
10. Return ONLY the JSON object, no markdown, no explanations

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

        # Set defaults for optional fields
        if 'all_day' not in event_data:
            event_data['all_day'] = False

        if 'description' not in event_data or not event_data['description']:
            event_data['description'] = email_text.strip()

        if 'location' not in event_data or not event_data['location']:
            event_data['location'] = ""

        if 'attendees' not in event_data or not isinstance(event_data['attendees'], list):
            event_data['attendees'] = []

        if 'recurrence_frequency' not in event_data:
            event_data['recurrence_frequency'] = "none"

        if 'recurrence_interval' not in event_data:
            event_data['recurrence_interval'] = 1

        if 'recurrence_count' not in event_data:
            event_data['recurrence_count'] = None

        if 'recurrence_end_date' not in event_data:
            event_data['recurrence_end_date'] = None

        if 'timezone' not in event_data or not event_data['timezone']:
            event_data['timezone'] = "UTC"

        # Validate recurrence frequency
        valid_frequencies = ["none", "daily", "weekly", "monthly", "yearly"]
        if event_data['recurrence_frequency'] not in valid_frequencies:
            logger.warning(f"Invalid recurrence frequency '{event_data['recurrence_frequency']}', defaulting to 'none'")
            event_data['recurrence_frequency'] = "none"

        logger.info(f"Successfully parsed email to event: {event_data['title']}")
        return event_data

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON from Groq response: {e}")
        raise ValueError(f"AI returned invalid JSON: {str(e)}")

    except Exception as e:
        logger.error(f"Error parsing email with Groq: {e}")
        raise ValueError(f"Failed to parse email: {str(e)}")
