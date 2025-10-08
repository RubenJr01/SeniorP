# Django + React Calendar Integration

This project is a full-stack calendar application that uses a Vite/React frontend, a Django REST backend, JWT authentication, and two-way Google Calendar synchronization.

---

## Prerequisites

- **Python 3.11+**
- **Node.js 18+** (includes npm)
- **Google Cloud project** with the Google Calendar API enabled

---

## 0. Containerised Development (Recommended)

Spin up the Django API and Vite dev server purely with Docker so every teammate has the same setup (hot reload stays enabled).

1. Copy the example environment files and populate real values:
   - `cp .env.example .env` (optional: override the Postgres username/password/DB name)
   - `cp backend/.env.example backend/.env`
   - `cp frontend/.env.example frontend/.env` (optional: only needed if you want `VITE_API_URL` outside compose)
2. Edit `backend/.env` with a unique `DJANGO_SECRET_KEY`, Google credentials, and any custom origins. Update `.env` if you want Postgres creds other than the defaults.
3. Start the dev stack:
   ```bash
   docker compose up --build
   ```
4. Compose brings up Postgres (`db`), Django API (`backend`), and Vite dev server (`frontend`). Backend runs at <http://localhost:8000/> and the React app at <http://localhost:5173/>.

The containers mount your local code (`backend/`, `frontend/`) so edits refresh instantly. Dependencies stay inside the containers, keeping secrets out of git and avoiding version conflicts on host machines.

---

## 1. Clone the Repository

```bash
git clone https://github.com/<your-org>/Django-Practice.git
cd Django-Practice
```

---

## 2. Backend Setup (`backend/`)

### a. Create and activate a virtual environment

```bash
cd backend
python -m venv env
# Windows PowerShell
.\env\Scripts\Activate.ps1
# macOS/Linux
source env/bin/activate
```

### b. Install dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### c. Configure environment variables

Create `backend/.env` and populate the following keys:

```ini
# Django
DJANGO_SECRET_KEY=replace-me
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:5173
FRONTEND_APP_URL=http://localhost:5173

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/google/oauth/callback/
GOOGLE_OAUTH_PROMPT=consent

# Optional: trusted origins if serving from another host
# DJANGO_CSRF_TRUSTED_ORIGINS=http://localhost:5173
```

> **Tip:** Leave `DJANGO_DEBUG=True` for local development. Set it to `False` and tighten the host/origin lists before deploying.

### d. Apply migrations and run the server

```bash
python manage.py migrate
python manage.py runserver
```

The API will be available at <http://localhost:8000/>.

---

## 3. Frontend Setup (`frontend/`)

Open a new terminal (keep the backend running) and install the React app:

```bash
cd frontend
npm install
```

Create `frontend/.env` with the API base URL:

```bash
VITE_API_URL=http://localhost:8000
```

Start the Vite dev server:

```bash
npm run dev
```

The SPA runs at <http://localhost:5173/>. It assumes the API is reachable at the URL specified in `VITE_API_URL`.

---

## 4. Google Calendar Integration

1. In your Google Cloud project, go to **APIs & Services → Library** and enable **Google Calendar API**.
2. Configure the OAuth consent screen (Internal or External) and add your team members as **Test users** while the app is unverified.
3. Create OAuth credentials (**Credentials → Create credentials → OAuth client ID → Web application**) and use:
   - **Authorized JavaScript origins**: `http://localhost:5173`
   - **Authorized redirect URIs**: `http://localhost:8000/api/google/oauth/callback/`
4. Copy the generated Client ID/Secret into `backend/.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
5. Restart the Django server so it reads the updated environment variables.

After logging in to the web app, click **Connect Google Calendar**, grant access with a test account, and use **Sync now** to verify events travel both ways.

---

## 5. Running the App

1. Start the backend (`python manage.py runserver` in `backend/` with the virtualenv activated).
2. Start the frontend (`npm run dev` in `frontend/`).
3. Visit <http://localhost:5173/>, register/login, and begin creating events.
4. Use the Google Calendar card on the dashboard to connect/sync/disconnect the integration.

---

## 6. Deploying / Production Notes

- Use a production-ready database (e.g., PostgreSQL) instead of SQLite.
- Set `DJANGO_DEBUG=False` and configure `DJANGO_ALLOWED_HOSTS`, `DJANGO_CORS_ALLOWED_ORIGINS`, and `DJANGO_CSRF_TRUSTED_ORIGINS` for your domains.
- Store environment variables securely (CI secrets, parameter store, etc.).
- Issue the OAuth client in Google Cloud for your production domain(s) and complete verification if exposing “Sign in with Google”/Calendar sync to the public.
- Consider running `python manage.py collectstatic` and serving static files via a CDN or your hosting provider.

---

## 7. Troubleshooting

- **403 `accessNotConfigured` on sync**: Ensure the Google Calendar API is enabled for the project connected to your OAuth client.
- **`invalid_grant` errors**: Revoke and reconnect Google access; refresh tokens can expire if the scope set changes.
- **Duplicate events**: Run **Sync now** after connecting—deduplication is built into the sync pipeline and will report “removed duplicates” in the success banner.
- **CORS errors**: Confirm the frontend origin is listed in `DJANGO_CORS_ALLOWED_ORIGINS` and restart the Django server after editing `.env`.

---

Happy coding! If you run into setup issues, double-check that both servers are running, environment variables are present, and your Google OAuth configuration matches the URLs in this README.
