# V-Cal Local Setup Guide

V-Cal is a Django REST API (`backend/`) paired with a Vite + React frontend (`frontend/`). Follow the steps below to run both services on your machine.

## 1. Prerequisites
- Python 3.11 (check with `python --version`)
- Node.js 18.x (check with `node --version`)
- npm (bundled with Node.js)
- Git

Windows users should run commands in PowerShell. Replace `python` with `python3` and `.\env\Scripts\Activate.ps1` with `source env/bin/activate` on macOS/Linux.

## 2. Clone the Repository
```bash
git clone https://github.com/<your-org>/SeniorP.git
cd SeniorP
```

## 3. Configure Environment Files
Create `backend/.env`:
```ini
DJANGO_SECRET_KEY=replace-with-strong-value
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:5173
FRONTEND_APP_URL=http://localhost:5173
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/google/oauth/callback/
GOOGLE_OAUTH_PROMPT=consent
```

Create `frontend/.env`:
```ini
VITE_API_URL=http://localhost:8000
```

> Skip the Google values if you do not plan to test calendar sync yet.

## 4. Backend Setup
```bash
cd backend
python -m venv env
.\env\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r ../requirements.txt
python manage.py migrate
python manage.py runserver
```
The API listens at `http://localhost:8000/`. Leave this process running.

## 5. Frontend Setup
Open a new terminal at the project root:
```bash
cd frontend
npm install
npm run dev
```
The UI is available at `http://localhost:5173/`.

## 6. Log In and Explore
1. Register a new account from the landing page.
2. Sign in to access the dashboard and calendar.
3. Create missions from the calendar view; changes appear immediately on the dashboard.

## 7. Optional: Google Calendar Sync
1. In Google Cloud Console, create an OAuth 2.0 Web client and add `http://localhost:8000/api/google/oauth/callback/` as an authorised redirect URI.
2. Add the generated client ID and secret to `backend/.env`.
3. Restart `python manage.py runserver`.
4. From the dashboard, connect your Google account and use **Sync all** to push updates.

## 8. Useful Commands
| Goal | Command |
|------|---------|
| Run Django tests | `python manage.py test` |
| Lint React code  | `npm run lint` |
| Build frontend   | `npm run build` |

You now have a fully working local environment for V-Cal. Happy building!
