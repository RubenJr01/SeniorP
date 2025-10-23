import uuid
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import BrightspaceFeed, Event, EventAttendee, GoogleAccount, Invitation, Notification


class EventAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("alice", password="password123")
        self.other_user = User.objects.create_user("bob", password="password123")
        now = timezone.now()
        self.own_event = Event.objects.create(
            pilot=self.user,
            title="Own event",
            description="",
            start=now,
            end=now + timedelta(hours=1),
        )
        self.other_event = Event.objects.create(
            pilot=self.other_user,
            title="Other event",
            description="",
            start=now + timedelta(days=1),
            end=now + timedelta(days=1, hours=1),
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_event_list_returns_only_authenticated_user_events(self):
        self.authenticate(self.user)
        url = reverse("event-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], self.own_event.id)

    def test_user_cannot_delete_other_users_event(self):
        self.authenticate(self.user)
        url = reverse("event-detail", args=[self.other_event.pk])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Event.objects.filter(pk=self.other_event.pk).exists())

    def test_create_event_sets_pilot_and_all_day_flag(self):
        self.authenticate(self.user)
        url = reverse("event-list")
        start = timezone.now() + timedelta(days=2)
        payload = {
            "title": "Trip",
            "description": "Day trip",
            "start": start.isoformat(),
            "end": (start + timedelta(hours=2)).isoformat(),
            "all_day": False,
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created_id = response.data["id"]
        event = Event.objects.get(pk=created_id)
        self.assertEqual(event.pilot, self.user)
        self.assertFalse(event.all_day)
        notification = Notification.objects.filter(user=self.user).latest("created_at")
        self.assertEqual(notification.type, Notification.Type.EVENT_CREATED)
        self.assertEqual(notification.data.get("event_id"), event.pk)

    def test_notifications_mark_read(self):
        self.authenticate(self.user)
        notification = Notification.objects.create(
            user=self.user,
            type=Notification.Type.EVENT_CREATED,
            title="Test",
            message="",
            data={"event_id": 1},
        )

        url = reverse("notifications")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["unread_count"], 1)

        mark_resp = self.client.post(url, {"ids": [notification.pk]}, format="json")
        self.assertEqual(mark_resp.status_code, status.HTTP_200_OK)
        notification.refresh_from_db()
        self.assertIsNotNone(notification.read_at)


    def test_brightspace_status_connected(self):
        self.authenticate(self.user)
        BrightspaceFeed.objects.create(user=self.user, ics_url="https://example.com/feed.ics")

        url = reverse("calendar-brightspace-import")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["connected"])
        self.assertEqual(response.data["ics_url"], "https://example.com/feed.ics")

    def test_brightspace_status_not_connected(self):
        self.authenticate(self.user)
        url = reverse("calendar-brightspace-import")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["connected"])


    def test_delete_event_removes_google_record(self):
        self.authenticate(self.user)
        self.own_event.google_event_id = "abc123"
        self.own_event.source = Event.Source.SYNCED
        self.own_event.save(update_fields=["google_event_id", "source", "updated_at"])

        GoogleAccount.objects.create(
            user=self.user,
            google_user_id="gid",
            email="user@example.com",
            access_token="token",
            refresh_token="refresh",
            token_expiry=timezone.now(),
            scopes="openid",
        )

        url = reverse("event-detail", args=[self.own_event.pk])
        with patch("api.views.delete_event_on_google") as mock_delete:
            response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        mock_delete.assert_called_once()
        self.assertFalse(Event.objects.filter(pk=self.own_event.pk).exists())

    def test_google_status_not_connected(self):
        self.authenticate(self.user)
        url = reverse("google-status")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"connected": False})

    def test_google_sync_requires_connection(self):
        self.authenticate(self.user)
        url = reverse("google-sync")
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(GOOGLE_CLIENT_ID="", GOOGLE_CLIENT_SECRET="")
    def test_google_start_returns_error_when_not_configured(self):
        self.authenticate(self.user)
        url = reverse("google-oauth-start")
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)


class EventRSVPTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            "pilot",
            email="pilot@example.com",
            password="password123",
        )
        self.client.force_authenticate(user=self.user)
        now = timezone.now()
        self.event = Event.objects.create(
            pilot=self.user,
            title="Invite test",
            description="",
            start=now,
            end=now + timedelta(hours=1),
            google_event_id="evt_123",
            source=Event.Source.SYNCED,
        )
        self.account = GoogleAccount.objects.create(
            user=self.user,
            google_user_id="gid",
            email="pilot@example.com",
            access_token="token",
            refresh_token="refresh",
            token_expiry=timezone.now() + timedelta(hours=1),
            scopes="openid",
        )
        EventAttendee.objects.create(
            event=self.event,
            email=self.account.email,
            response_status=EventAttendee.ResponseStatus.NEEDS_ACTION,
            is_self=True,
            raw={},
        )

    @patch("api.views.update_attendee_response")
    def test_rsvp_accepts_invite(self, mock_update):
        def side_effect(account, event, response):
            EventAttendee.objects.filter(
                event=event,
                email=account.email.lower(),
            ).update(response_status=response)
            return event

        mock_update.side_effect = side_effect
        url = reverse("event-rsvp", args=[self.event.pk])
        response = self.client.post(
            url,
            {"response": EventAttendee.ResponseStatus.ACCEPTED},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        attendee = EventAttendee.objects.get(event=self.event, email=self.account.email.lower())
        self.assertEqual(attendee.response_status, EventAttendee.ResponseStatus.ACCEPTED)
        mock_update.assert_called_once()

    def test_rsvp_invalid_choice(self):
        url = reverse("event-rsvp", args=[self.event.pk])
        response = self.client.post(url, {"response": "not-valid"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class InvitationAPITests(APITestCase):
    def setUp(self):
        self.inviter = User.objects.create_user("inviter", password="password123")
        self.client.force_authenticate(user=self.inviter)

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        INVITATION_EXPIRY_DAYS=7,
    )
    def test_create_invitation_sends_email(self):
        if hasattr(mail, "outbox"):
            mail.outbox.clear()
        url = reverse("invitation-list")
        payload = {"email": "guest@example.com", "message": "Join us!"}
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Invitation.objects.count(), 1)
        invitation = Invitation.objects.get()
        self.assertEqual(invitation.email, "guest@example.com")
        self.assertEqual(invitation.invited_by, self.inviter)
        self.assertIsNotNone(invitation.last_sent_at)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("guest@example.com", mail.outbox[0].to)
        self.assertIn(str(invitation.token), mail.outbox[0].body)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_resend_invitation(self):
        if hasattr(mail, "outbox"):
            mail.outbox.clear()
        invitation = Invitation.objects.create(invited_by=self.inviter, email="guest@example.com")
        url = reverse("invitation-resend", kwargs={"pk": invitation.pk})
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        invitation.refresh_from_db()
        self.assertIsNotNone(invitation.last_sent_at)
        self.assertGreaterEqual(len(mail.outbox), 1)

    def test_resend_rejected_when_not_pending(self):
        invitation = Invitation.objects.create(
            invited_by=self.inviter,
            email="guest@example.com",
            accepted_at=timezone.now(),
        )
        url = reverse("invitation-resend", kwargs={"pk": invitation.pk})
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invitation_lookup(self):
        invitation = Invitation.objects.create(invited_by=self.inviter, email="guest@example.com")
        self.client.force_authenticate(user=None)
        url = reverse("invitation-lookup", kwargs={"token": invitation.token})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "guest@example.com")
        self.assertEqual(response.data["status"], Invitation.Status.PENDING)


class InvitationRegistrationTests(APITestCase):
    def setUp(self):
        self.inviter = User.objects.create_user("inviter", password="password123")
        self.invitation = Invitation.objects.create(invited_by=self.inviter, email="guest@example.com")
        self.register_url = reverse("register")

    def test_register_with_invitation_marks_accepted(self):
        payload = {
            "username": "newcrew",
            "password": "secret123",
            "invite_token": str(self.invitation.token),
        }
        response = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.invitation.refresh_from_db()
        self.assertIsNotNone(self.invitation.accepted_at)
        self.assertIsNotNone(self.invitation.accepted_by)
        new_user = User.objects.get(username="newcrew")
        self.assertEqual(new_user.email, "guest@example.com")

    def test_register_with_invalid_invite_returns_error(self):
        payload = {
            "username": "anothercrew",
            "password": "secret123",
            "invite_token": str(uuid.uuid4()),
        }
        response = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("invite_token", response.data)

    def test_register_with_mismatched_email(self):
        payload = {
            "username": "wrongemail",
            "password": "secret123",
            "invite_token": str(self.invitation.token),
            "email": "different@example.com",
        }
        response = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)
