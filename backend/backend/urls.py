from django.contrib import admin
from django.urls import path, include
from api.views import CreateUserView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path("admin/", admin.site.urls),

    # Auth & User
    path("api/user/register/", CreateUserView.as_view(), name="register"),
    path("api/token/", TokenObtainPairView.as_view(), name="grab-token"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="refresh_token"),

    # App API (events)
    path("api/", include("api.urls")),
]
