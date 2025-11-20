# V-Cal Setup and Installation Guide

This guide provides complete instructions for setting up V-Cal from scratch on a fresh machine.

---

## System Requirements

| Component | Minimum Version | Verification Command |
|-----------|----------------|---------------------|
| Python | 3.11+ | `python --version` or `python3 --version` |
| Node.js | 18.x+ | `node --version` |
| npm | 9.x+ | `npm --version` |
| Git | Any modern | `git --version` |
| cloudflared | Latest | `cloudflared --version` |

### Required Accounts (Optional Features)

- **GitHub Account**: To clone the repository
- **Google Cloud Account** (Free tier): For Google Calendar sync and Gmail auto-parsing
- **Groq API Key** (Free tier): For AI email parsing - 14,400 free requests/day
- **Cloudflare Account** (Optional): For permanent tunnel URLs

### Downloads

- **Python**: https://www.python.org/downloads/
- **Node.js**: https://nodejs.org/
- **Git**: https://git-scm.com/downloads
- **cloudflared**: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

---

## 1. Clone the Repository

**Linux/macOS**:
```bash
cd ~/Documents
git clone https://github.com/<your-org>/SeniorP.git
cd SeniorP
```

**Windows**:
```powershell
cd $HOME\Documents
git clone https://github.com/<your-org>/SeniorP.git
cd SeniorP
```

---

## 2. Backend Setup

### 2.1 Create Virtual Environment

**Linux/macOS**:
```bash
cd backend
python3 -m venv env
source env/bin/activate
```

**Windows**:
```powershell
cd backend
python -m venv env
.\env\Scripts\Activate.ps1
```

You should see `(env)` at the beginning of your terminal prompt when the virtual environment is active.

### 2.2 Install Python Dependencies

**Linux/macOS**:
```bash
python -m pip install --upgrade pip
pip install -r ../requirements.txt
```

**Windows**:
```powershell
python -m pip install --upgrade pip
pip install -r ..\requirements.txt
```

This will take approximately 2-3 minutes.

### 2.3 Configure Environment Variables

Create a file named `.env` in the `backend/` directory:

**Linux/macOS**:
```bash
nano .env  # or vim, code, etc.
```

**Windows**:
```powershell
notepad .env
```

**Basic Configuration** (minimal setup for local development):

```ini
# Django Core Settings
DJANGO_SECRET_KEY=any-random-string-here-change-in-production
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,.trycloudflare.com
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:5173
FRONTEND_APP_URL=http://localhost:5173

# Celery (auto-configured for development)
CELERY_TASK_ALWAYS_EAGER=true
```

**Full Configuration** (with all features enabled):

```ini
# Django Core Settings
DJANGO_SECRET_KEY=your-secret-key-here
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,.trycloudflare.com
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:5173
FRONTEND_APP_URL=http://localhost:5173

# Google OAuth (for Google Calendar Sync)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/google/oauth/callback/
GOOGLE_OAUTH_PROMPT=consent

# Groq API (for AI Email Parsing)
GROQ_API_KEY=gsk_your_groq_api_key_here

# Gmail Auto-Parsing (update after starting cloudflared)
GOOGLE_WEBHOOK_BASE_URL=https://your-tunnel-url.trycloudflare.com
GOOGLE_PUBSUB_TOPIC=projects/your-project/topics/your-topic

# Celery
CELERY_TASK_ALWAYS_EAGER=true
```

**Notes**:
- For initial setup without Gmail features, use the basic configuration
- `GOOGLE_WEBHOOK_BASE_URL` will be updated after you start cloudflared
- See the main documentation for obtaining Google OAuth credentials and Groq API keys

### 2.4 Initialize Database

**Linux/macOS**:
```bash
python manage.py migrate
```

**Windows**:
```powershell
python manage.py migrate
```

You should see "OK" messages for each migration applied.

---

## 3. Frontend Setup

Open a new terminal window (keep the backend terminal available for later).

### 3.1 Navigate to Frontend Directory

**Linux/macOS**:
```bash
cd ~/Documents/SeniorP/frontend
```

**Windows**:
```powershell
cd $HOME\Documents\SeniorP\frontend
```

### 3.2 Install Node Dependencies

```bash
npm install
```

This will take approximately 1-2 minutes.

### 3.3 Configure Frontend Environment

Create `.env` file in the `frontend/` directory:

**Linux/macOS**:
```bash
nano .env
```

**Windows**:
```powershell
notepad .env
```

**Content**:
```ini
VITE_API_URL=http://localhost:8000
```

---

## 4. Optional: Cloudflared Tunnel Setup

Cloudflared tunnel is only required if you want to use the Gmail auto-parsing feature, as it needs a publicly accessible HTTPS URL for webhooks.

### 4.1 Install Cloudflared

Follow the installation instructions at:
https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

### 4.2 Verify Installation

```bash
cloudflared --version
```

For detailed tunnel setup instructions, see `CLOUDFLARED_TUNNEL_SETUP.md`.

---

## 5. Google Cloud Configuration (Optional)

### 5.1 Google Calendar Sync Setup

1. Go to https://console.cloud.google.com/
2. Create a new project or select existing
3. Enable **Google Calendar API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Authorized redirect URIs:
   - `http://localhost:8000/api/google/oauth/callback/`
7. Copy **Client ID** and **Client Secret** to `backend/.env`

### 5.2 Gmail Auto-Parsing Setup

1. Enable **Gmail API** in your Google Cloud project
2. Create **Pub/Sub Topic**:
   - Go to **Pub/Sub** → **Topics** → **Create Topic**
   - Topic ID: `gmail-notifications` (or your choice)
   - Copy full topic name to `backend/.env` → `GOOGLE_PUBSUB_TOPIC`
3. Webhook configuration will be done after starting cloudflared (see Running guide)

---

## 6. Groq API Setup (Optional)

For AI-powered email parsing:

1. Sign up at https://console.groq.com
2. Navigate to **API Keys**
3. Create new API key
4. Copy key to `backend/.env` → `GROQ_API_KEY`

Free tier provides 14,400 requests per day.

---

## 7. Verification

Verify your installation before proceeding:

**Backend Dependencies**:
```bash
cd backend
source env/bin/activate  # Windows: .\env\Scripts\Activate.ps1
python -c "import django; print(django.get_version())"
```

Should print Django version (5.2.8 or similar).

**Frontend Dependencies**:
```bash
cd frontend
npm list --depth=0
```

Should show installed packages without errors.

**Database**:
```bash
cd backend
ls db.sqlite3
```

Should show the database file exists.

---

## 8. Troubleshooting

### Issue: Virtual environment won't activate

**Windows**: If you see "script execution is disabled", run PowerShell as Administrator:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Issue: pip install fails

**Solution**: Ensure Python 3.11+ is installed and virtual environment is activated:
```bash
python --version  # Should show 3.11 or higher
which python      # Should point to env/bin/python (Linux/macOS)
where python      # Should point to env\Scripts\python.exe (Windows)
```

### Issue: npm install fails

**Solution**: Clear npm cache and retry:
```bash
npm cache clean --force
npm install
```

### Issue: Port already in use

**Linux/macOS**:
```bash
lsof -i :8000  # Find process using port 8000
kill -9 <PID>  # Kill the process
```

**Windows**:
```powershell
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

### Issue: Database migration errors

**Solution**: Reset database:
```bash
cd backend
rm db.sqlite3
python manage.py migrate
```

---

## Next Steps

Once installation is complete, proceed to `RUNNING_THE_APPLICATION.md` for instructions on starting the servers and using V-Cal.

For cloudflared tunnel setup (required for Gmail auto-parsing), see `CLOUDFLARED_TUNNEL_SETUP.md`.
