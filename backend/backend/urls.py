from django.contrib import admin
from django.urls import path, include
from api.views import CreateUserView # Creating a user
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView # Prebuilt views that allow to obtain access and refresh tokens

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/user/register/', CreateUserView.as_view(), name="register"), # Linking register page/view
    path('api/token/', TokenObtainPairView.as_view(), name="grab_token"), # Linking token-grab page/view
    path('api/token/refresh/', TokenRefreshView.as_view(), name="refresh_token"), # Linking refresh-token page/view
    path('api-auth/', include("rest_framework.urls")), # Prebuilt rest_framework urls
    path('api/', include("api.urls"))
]