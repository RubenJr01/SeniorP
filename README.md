# V-Cal (SeniorP) – Local Development Manual

This repository contains a Django REST backend and a Vite/React frontend that power **V-Cal**, a calendar and sortie-planning app with optional Google Calendar synchronisation.  
Use this guide as an end-to-end checklist for setting the project up on a fresh machine.

---

## 1. System Requirements

| Component          | Minimum version | How to verify                                       |
|-------------------|-----------------|-----------------------------------------------------|
| Python             | 3.11            | `python --version` or `python3 --version`          |
| Node.js            | 18.x            | `node --version`                                    |
| npm                | bundled with Node | `npm --version`                                   |
| Git                | any modern version | `git --version`                                 |
| Google Cloud acct*| n/a             | only needed for Google Calendar integration        |

\*You can run the app without Google Calendar credentials; synchronisation features will simply be disabled.

> **Windows tip:** Use PowerShell for the listed commands. On macOS/Linux substitute `python3` for `python` and `source env/bin/activate` for the activation step shown below.

---

## 2. Clone the Repository

```bash
git clone https://github.com/<your-org>/SeniorP.git
cd SeniorP
```

If you have multiple remotes or forks, verify you are pointing at the desired repository with `git remote -v`.

---

## 3. Backend Setup (`backend/`)

### 3.1 Create and Activate a Virtual Environment

```bash
cd backend
python -m venv env

# Activate it
# PowerShell (Windows)
.\env\Scripts\Activate.ps1
# Bash/Zsh (macOS/Linux)
source env/bin/activate
```

You should now see `(env)` at the start of your shell prompt.

### 3.2 Install Python Dependencies

The consolidated dependency list lives in `requirements.txt` at the project root.

```bash
python -m pip install --upgrade pip
pip install -r ../requirements.txt
```

> If you encounter installation issues, ensure the virtual environment is active and that you are running Python 3.11 or newer.

### 3.3 Configure Environment Variables

Create `backend/.env` (this file is ignored by Git):

```ini
DJANGO_SECRET_KEY=replace-me-with-a-random-string
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:5173
FRONTEND_APP_URL=http://localhost:5173

# Optional: enable Google Calendar sync
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/google/oauth/callback/
GOOGLE_OAUTH_PROMPT=consent
```

If you are not configuring Google Calendar yet, you may omit those keys—sync buttons will simply be disabled.

### 3.4 Apply Migrations

```bash
python manage.py makemigrations
python manage.py migrate
```

### 3.5 Run the Backend API

```bash
python manage.py runserver
```

The API is now available at <http://localhost:8000>. Leave this process running while you work with the frontend.

---

## 4. Frontend Setup (`frontend/`)

Open a **new terminal** (keep the backend running) and from the repository root:

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```ini
VITE_API_URL=http://localhost:8000
```

Start the development server:

```bash
npm run dev
```

By default Vite serves the app at <http://localhost:5173>. The dev server provides hot module reloading; leave this process running while developing.

---

| Backend  | `python manage.py runserver`                  | <http://localhost:8000>                |
| Frontend | `npm run dev`                                 | <http://localhost:5173>                |

Open <http://localhost:5173> in a browser, register or log in, and start creating missions. Recurring events, mission logs, and sync status will update live as you interact with the UI.

---

## 8. Useful Development Commands

| Purpose                          | Command                                             |
|----------------------------------|------------------------------------------------------|
| Run Django tests                 | `python manage.py test`                             |
| Run ESLint (frontend lint)       | `npm run lint`                                      |
| Create a production build        | `npm run build`                                     |
| Collect static files (if needed) | `python manage.py collectstatic`                    |
| Reset local database             | delete `backend/db.sqlite3`, then rerun migrations  |

---

## 9. Troubleshooting

- **Backend fails to start**: Ensure the virtual environment is active and dependencies are installed; check for missing `.env` keys.
- **Frontend cannot reach API**: Confirm `VITE_API_URL` is correct and the backend is running on port 8000.
- **CORS errors**: Verify `DJANGO_CORS_ALLOWED_ORIGINS` and `FRONTEND_APP_URL` in `backend/.env` match the frontend origin exactly.
- **Google OAuth errors**: Double-check the redirect URI and authorised origins in the Google Cloud Console; restart the backend after editing `.env`.
- **Recurring events not appearing**: Make sure you ran `python manage.py migrate` after pulling the latest code so the recurrence fields are created in the database.
- **Brightspace import fails**: Confirm the iCal URL loads in a browser (it should download an `.ics` file) and that you are logged in to V-Cal before importing.

---

## 10. Cleaning Up

To stop the dev servers, press `Ctrl+C` in each terminal.  
Deactivate the Python virtual environment when finished:

```bash
deactivate  # Windows/macOS/Linux
```

To remove all installed Node modules and Python dependencies:

```bash
rm -rf frontend/node_modules frontend/dist
Remove-Item -Recurse -Force frontend/node_modules frontend/dist  # PowerShell equivalent

cd backend
Remove-Item -Recurse -Force env  # or rm -rf env on macOS/Linux
```

---

## 11. Next Steps

- Commit your work (`git add ... && git commit`) and push to your chosen branch.
- Deploy the backend and frontend or containerise for production.
- Configure CI to run the Django and React test suites automatically.

You now have a fully operational local environment for V-Cal. Happy building!
