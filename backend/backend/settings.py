# backend/backend/settings.py
from pathlib import Path
from datetime import timedelta
import os

from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from .env files if present (local dev convenience)
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR / "backend" / ".env")

# --- Env flags ---
debug_flag = os.getenv("DJANGO_DEBUG")
if debug_flag is None:
    DEBUG = False
else:
    DEBUG = debug_flag.lower() == "true"

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "dev-secret-key"
    else:
        raise ImproperlyConfigured(
            "DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is false."
        )

# Cloudflare tunnel configuration
# NOTE: These tunnel URLs change every time you restart cloudflared
# Set them in environment variables (.env) or rely on wildcard .trycloudflare.com in DEBUG mode
FRONTEND_TUNNEL = os.getenv("FRONTEND_TUNNEL", "")
BACKEND_TUNNEL = os.getenv("BACKEND_TUNNEL", "")

# In development, accept all trycloudflare.com subdomains (tunnel URLs change on restart)
if DEBUG:
    ALLOWED_HOSTS = ["localhost", "127.0.0.1", ".trycloudflare.com"]
else:
    ALLOWED_HOSTS = [host for host in (BACKEND_TUNNEL, "localhost", "127.0.0.1") if host]

# --- Apps ---
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "api",
]

# --- Middleware (order matters) ---
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "backend.wsgi.application"

# --- DB (sqlite for dev) ---
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# --- Password validators ---
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --- i18n ---
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# --- Static ---
STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- DRF / JWT ---
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ("rest_framework_simplejwt.authentication.JWTAuthentication",),
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.AnonRateThrottle",
    ],
}
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
}

# --- Google / Frontend config ---
FRONTEND_APP_URL = os.getenv("FRONTEND_APP_URL", "http://localhost:5173")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:8000/api/google/oauth/callback/",
)
GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.readonly",
]
GOOGLE_OAUTH_PROMPT = os.getenv("GOOGLE_OAUTH_PROMPT", "consent")
GOOGLE_API_TIMEOUT_SECONDS = int(os.getenv("GOOGLE_API_TIMEOUT_SECONDS", "15"))
GOOGLE_PUBSUB_TOPIC = os.getenv("GOOGLE_PUBSUB_TOPIC", "")
GOOGLE_WEBHOOK_BASE_URL = os.getenv("GOOGLE_WEBHOOK_BASE_URL", "http://localhost:8000")
API_USER_THROTTLE_RATE = os.getenv("API_USER_THROTTLE_RATE", "300/min")
API_ANON_THROTTLE_RATE = os.getenv("API_ANON_THROTTLE_RATE", "60/min")

# --- CORS / CSRF for tunnels ---
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    origin
    for origin in (
        FRONTEND_APP_URL,
        f"https://{FRONTEND_TUNNEL}" if FRONTEND_TUNNEL else "",
    )
    if origin
]
CORS_ALLOW_CREDENTIALS = False  # set True only if you use cookies for auth
CORS_ALLOW_HEADERS = ["Authorization", "Content-Type"]
CORS_ALLOW_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


CSRF_TRUSTED_ORIGINS = [
    origin
    for origin in (
        f"https://{FRONTEND_TUNNEL}" if FRONTEND_TUNNEL else "",
        f"https://{BACKEND_TUNNEL}" if BACKEND_TUNNEL else "",
    )
    if origin
]

# Note: Gmail webhook (/api/gmail/webhook/) is exempt from CSRF via @csrf_exempt decorator
# so changing tunnel URLs won't break webhooks

# --- Celery / Redis ---
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://127.0.0.1:6379/1")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_ALWAYS_EAGER = os.getenv(
    "CELERY_TASK_ALWAYS_EAGER",
    "true" if DEBUG else "false",
).lower() == "true"
CELERY_TASK_EAGER_PROPAGATES = True

# --- Email / Invitations ---
EMAIL_BACKEND = os.getenv(
    "DJANGO_EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend",
)
DEFAULT_FROM_EMAIL = os.getenv("DJANGO_DEFAULT_FROM_EMAIL", "V-Cal <no-reply@v-cal.local>")
INVITATION_EXPIRY_DAYS = int(os.getenv("INVITATION_EXPIRY_DAYS", "14"))

# --- Brightspace ---
BRIGHTSPACE_MAX_ICS_BYTES = int(os.getenv("BRIGHTSPACE_MAX_ICS_BYTES", str(5 * 1024 * 1024)))

# DRF throttle rates (configured after constants to use env values)
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    "user": API_USER_THROTTLE_RATE,
    "anon": API_ANON_THROTTLE_RATE,
}
