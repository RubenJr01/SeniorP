from django.contrib.auth.models import User
from rest_framework import generics, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated

from .models import Event
from .serializers import UserSerializer, EventSerializer

class CreateUserView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]


class EventViewSet(viewsets.ModelViewSet):
    # /api/events/      GET, POST
    #
    # /api/events/{id}      GET, PUT, PATCH, DELETE
    queryset = Event.objects.select_related("pilot").all().order_by("start")
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializers.save(pilot=self.request.user)
