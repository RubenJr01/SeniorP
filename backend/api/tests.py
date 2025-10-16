from datetime import timedelta

from django.contrib.auth.models import User
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch

from .models import Event, GoogleAccount


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

    def test_create_event_sets_pilot_and_recurrance_flag(self):
        self.authenticate(self.user)
        url = reverse("event-list")
        start = timezone.now() + timedelta(days=2)
        payload = {
            "title": "Trip",
            "description": "Day trip",
            "start": start.isoformat(),
            "end": (start + timedelta(hours=2)).isoformat(),
            "recurrance": False,
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created_id = response.data["id"]
        event = Event.objects.get(pk=created_id)
        self.assertEqual(event.pilot, self.user)
        self.assertFalse(event.recurrance)

   # def test_create_event_sets_reccurance_period_and_recurrance_flag(self):
   #     self.authenticate(self.user)
   #     url = reverse("event-list")
   #     start = timezone.now() + timedelta(days=2)
   #     payload = {
   #         "title": "Trip",
   #         "description": "Day trip",
   #         "start": start.isoformat(),
   #         "end": (start + timedelta(hours=2)).isoformat(),
   #         "recurrance": False,
   #         "reccurance_period": 7,
   #     }
   #     response = self.client.post(url, payload, format="json")
   #     self.assertEqual(response.status_code, status.HTTP_201_CREATED)
   #     created_id = response.data["id"]
   #     event = Event.objects.get(pk=created_id)
   #     self.assertEqual(event.pilot, self.user)
   #     self.assertFalse(event.recurrance)
   #     self.assertEqual(event.recurrance_period, 7)
    

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
