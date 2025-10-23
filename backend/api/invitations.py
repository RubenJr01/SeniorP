from django.conf import settings
from django.core.mail import send_mail


def build_invitation_link(invitation):
  base_url = settings.FRONTEND_APP_URL.rstrip("/")
  return f"{base_url}/register?invite={invitation.token}"


def send_invitation_email(invitation):
  link = build_invitation_link(invitation)
  subject = f"{invitation.invited_by.username} invited you to V-Cal"

  lines = [
    "You have been invited to join V-Cal, the mission coordination hub.",
    "",
    f"Invited by: {invitation.invited_by.username}",
  ]

  if invitation.message:
    lines.extend(("", "Message from your teammate:", invitation.message.strip(), ""))

  lines.extend([
    "Create your account with the link below:",
    link,
    "",
    "If you were not expecting this invitation, you can safely ignore this email.",
  ])

  message = "\n".join(lines)
  send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [invitation.email])
  return link
