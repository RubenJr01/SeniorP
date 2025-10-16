# SeniorP Local Setup Guide

Follow these steps to run the project locally. The repository contains a Django REST backend and a Vite/React frontend that communicate over HTTP and support Google Calendar synchronization.

---

## 1. Prerequisites
- Python 3.11 or newer
- Node.js 18 or newer (npm included)
- Google Cloud project with Calendar API enabled

---

## 2. Clone the repository
```bash
git clone https://github.com/<your-org>/SeniorP.git
cd SeniorP
```

---

## 3. Backend setup (`backend/`)
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
Create `backend/.env` with:
```ini
DJANGO_SECRET_KEY=replace-me
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:5173
FRONTEND_APP_URL=http://localhost:5173

## This is for me, not you guys ##
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/google/oauth/callback/
GOOGLE_OAUTH_PROMPT=consent
```
> Update the Google values with credentials generated in Google Cloud Console.

### d. Apply migrations and run the server
```bash
python manage.py migrate
python manage.py runserver
```
Backend API: http://localhost:8000/

---

## 4. Frontend setup (`frontend/`)
Open a new terminal (leave the backend running):
```bash
cd frontend
npm install
```

Create `frontend/.env`:
```bash
VITE_API_URL=http://localhost:8000
```

Start the React dev server:
```bash
npm run dev
```
Frontend app: http://localhost:5173/

---

## 5. Google Calendar integration
1. In Google Cloud Console enable **Google Calendar API**.
2. Configure the OAuth consent screen and add test users.
3. Create OAuth credentials (Web application):
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: `http://localhost:8000/api/google/oauth/callback/`
4. Copy the client ID/secret into `backend/.env`.
5. Restart `python manage.py runserver`.
6. From the dashboard, click **Connect Google Calendar**, complete OAuth, then use **Sync now**.

---

## 6. Run both services
1. Backend terminal (venv active):
   ```bash
   python manage.py runserver
   ```
2. Frontend terminal:
   ```bash
   npm run dev
   ```
3. Visit http://localhost:5173/, register or log in, create events, and manage Google synchronization.

---

## 7. Troubleshooting tips
- **OAuth errors**: double-check `GOOGLE_CLIENT_ID/SECRET` and redirect URI match Google Cloud settings.
- **CORS issues**: ensure `DJANGO_CORS_ALLOWED_ORIGINS` includes the frontend origin.
- **No events syncing**: verify the Calendar API is enabled and reconnect Google if refresh tokens expire.

You now have the project running locally with both frontend and backend services connected.
