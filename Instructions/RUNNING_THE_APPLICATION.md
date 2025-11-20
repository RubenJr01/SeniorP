# Running V-Cal

This guide covers starting the application servers, accessing the interface, and using the main features.

---

## Starting the Application

You'll need **2-3 terminal windows** running simultaneously:
1. **Backend** (Django REST API)
2. **Frontend** (Vite React dev server)
3. **Cloudflared** (Optional - only needed for Gmail auto-parsing)

---

## Terminal 1: Start Backend Server

### Linux/macOS

```bash
cd ~/Documents/SeniorP/backend
source env/bin/activate
python manage.py runserver
```

### Windows

```powershell
cd $HOME\Documents\SeniorP\backend
.\env\Scripts\Activate.ps1
python manage.py runserver
```

### Expected Output

```
Watching for file changes with StatReloader
Performing system checks...

System check identified no issues (0 silenced).
November 20, 2025 - 10:30:45
Django version 5.2.8, using settings 'backend.settings'
Starting development server at http://127.0.0.1:8000/
Quit the server with CONTROL-C.
```

**Keep this terminal running.** The backend API is now available at http://localhost:8000

---

## Terminal 2: Start Frontend Server

Open a **new terminal window**.

### Linux/macOS

```bash
cd ~/Documents/SeniorP/frontend
npm run dev
```

### Windows

```powershell
cd $HOME\Documents\SeniorP\frontend
npm run dev
```

### Expected Output

```
VITE v5.x.x  ready in 324 ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
➜  press h + enter to show help
```

**Keep this terminal running.** The frontend is now available at http://localhost:5173

---

## Terminal 3: Start Cloudflared (Optional)

**Only required for Gmail auto-parsing demonstration.**

Open a **third terminal window**.

### Linux/macOS and Windows

```bash
cloudflared tunnel --url http://localhost:8000
```

### Expected Output

```
2025-11-20T10:31:00Z INF Thank you for trying Cloudflare Tunnel...
2025-11-20T10:31:01Z INF |  https://random-words-example.trycloudflare.com  |
```

**Important Steps**:

1. **Copy the tunnel URL** (e.g., `https://random-words-example.trycloudflare.com`)
2. **Update backend/.env**: Set `GOOGLE_WEBHOOK_BASE_URL=https://random-words-example.trycloudflare.com`
3. **Restart the backend server** (Terminal 1): Press `Ctrl+C` then restart with `python manage.py runserver`
4. **Keep this terminal running** throughout your session

**Note**: This URL changes every time you restart cloudflared. For permanent URLs, see `CLOUDFLARED_TUNNEL_SETUP.md`.

---

## Accessing the Application

Open your web browser and navigate to:

**http://localhost:5173**

You should see the V-Cal landing page.

---

## Core Features Guide

### 1. User Registration and Login

**Registration**:
1. Click **"Register"** on the landing page
2. Fill in:
   - Username
   - Email (optional)
   - Password
3. Click **"Register"**
4. You'll be automatically logged in and redirected to the Dashboard

**Login** (for returning users):
1. Click **"Login"** on the landing page
2. Enter username and password
3. Click **"Login"**

**Authentication Details**:
- Uses JWT (JSON Web Tokens)
- Access tokens expire in 30 minutes
- Refresh tokens expire in 1 day
- Automatic token refresh on frontend

---

### 2. Creating Events

#### Basic Event

1. Navigate to **Calendar** from the top menu
2. Click on any date
3. Fill in the event form:
   - **Title**: Event name
   - **Start**: Start date and time
   - **End**: End date and time
   - **Location**: Physical address or virtual meeting link (optional)
   - **Description**: Event details (optional)
4. Click **emoji picker button** to select custom emoji (optional)
5. Click **"Create Event"**

#### All-Day Event

1. Create event as above
2. Check **"All-Day"** checkbox
3. Time selectors will be hidden
4. Event will span entire day(s)

#### Recurring Event

1. Create event as above
2. Set **Recurrence Frequency**:
   - None (default)
   - Daily
   - Weekly
   - Monthly
   - Yearly
3. Set **Recurrence Interval**: Repeat every N days/weeks/months/years
4. **Optional**: Set end condition:
   - **Recurrence Count**: Number of occurrences
   - **OR Recurrence End Date**: Last occurrence date
5. Click **"Create Event"**

**Examples**:
- Daily standup for 10 days: Frequency=Daily, Interval=1, Count=10
- Bi-weekly meeting for 2 months: Frequency=Weekly, Interval=2, End Date=2 months from now
- Monthly review every quarter: Frequency=Monthly, Interval=3

---

### 3. Calendar Views

**Month View**:
- Default view showing full month
- Events displayed with emoji and urgency color
- Click date to create event
- Click event to view/edit

**Day View**:
- Timeline view with hourly breakdown
- Shows all events for selected day
- Edit and delete buttons on each event
- Better for detailed daily planning

---

### 4. Urgency Color Coding

Events are automatically color-coded based on time until start:

- **Green** 😊: More than 2 days away
- **Yellow** 😢: 1-2 days away
- **Red** 😡: Less than 1 day away

The color updates automatically as time passes. If you set a custom emoji, it overrides the default urgency emoji but the background color remains.

---

### 5. Custom Emoji Support

**Adding Emoji to Event**:
1. When creating/editing event, click emoji picker button
2. Browse or search for emoji
3. Click to select
4. Emoji appears on calendar instead of urgency emoji

**Features**:
- Uses Twitter emoji style (image-based)
- Works consistently across all platforms
- Over 1,800 emojis available
- Search by keyword

---

### 6. Gmail Auto-Parsing (AI-Powered)

**Prerequisites**:
- Cloudflared tunnel running (Terminal 3)
- `GOOGLE_WEBHOOK_BASE_URL` set in backend/.env
- `GROQ_API_KEY` configured
- Gmail watch subscription active

**Using the Feature**:

1. Send yourself an email with event details. Example:

```
Subject: Project Meeting Tomorrow

Hi,

Let's meet tomorrow at 2:30 PM to discuss the project proposal.
We'll meet at Conference Room B on the 3rd floor.

Looking forward to it!
```

2. Wait 10-30 seconds for Gmail push notification
3. Navigate to **"Pending Events"** in top menu
4. Review the AI-parsed event suggestion:
   - Title extracted from subject/content
   - Date/time parsed from email
   - Location identified automatically
   - Description from email body

5. **Approve** to create the event OR **Reject** to dismiss

**What Gets Extracted**:
- Title
- Start and end date/time
- Location (addresses, room numbers, virtual meeting links)
- Attendees (email addresses mentioned)
- Recurrence patterns (e.g., "every Monday")
- All-day events
- Timezone

**AI Model**: Uses Groq's llama-3.3-70b-versatile model
**Free Tier**: 14,400 requests per day

---

### 7. Google Calendar Sync

**Prerequisites**:
- Google OAuth credentials configured in backend/.env
- GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET set

**Connecting**:
1. Click **"Connect Google Calendar"** button (Dashboard or Calendar page)
2. Browser redirects to Google login
3. Select your Google account
4. Grant permissions
5. Redirect back to V-Cal

**Syncing**:
1. Click **"Sync with Google Calendar"** button
2. Backend performs bidirectional sync:
   - **Push**: Local V-Cal events → Google Calendar
   - **Pull**: Google Calendar events → V-Cal
3. Events appear on both calendars

**Incremental Sync**:
- First sync transfers all events
- Subsequent syncs only transfer changes (efficient)
- Uses Google's sync tokens
- No duplicate events created

**Event Sources**:
- `local`: Created in V-Cal
- `google`: Imported from Google Calendar
- `synced`: Created locally and synced to Google
- `brightspace`: Imported from Brightspace

---

### 8. Brightspace Integration

**Prerequisites**:
- Access to Brightspace course with calendar
- iCal feed URL from Brightspace

**Importing**:
1. In Brightspace, find Calendar iCal feed URL
2. In V-Cal, navigate to Settings or Dashboard
3. Paste iCal URL in "Import Brightspace Calendar"
4. Click **"Import"**
5. Academic events appear on V-Cal calendar
6. Events tagged with source "brightspace"

**Notes**:
- One-time import (not continuous sync)
- Re-import to update events
- Maximum file size: 5MB

---

### 9. Editing and Deleting Events

**Edit Event**:
1. Click on event in calendar
2. Event details modal appears
3. Click **"Edit"** button
4. Modify any fields
5. Click **"Save"**

**Delete Event**:
1. Click on event
2. Click **"Delete"** button
3. Confirm deletion
4. Event removed from calendar

**Notes**:
- Changes persist immediately
- No page reload required
- If event is synced to Google, changes propagate on next sync

---

### 10. Notifications

**Automatic Polling**:
- Navigation bar polls for notifications every 30 seconds
- Badge shows unread count
- Click bell icon to view notifications

**Notification Types**:
- Event invitations
- Sync status updates
- Parsed email approvals
- System messages

---

## Stopping the Application

### Proper Shutdown

1. **Terminal 1 (Backend)**: Press `Ctrl+C`
2. **Terminal 2 (Frontend)**: Press `Ctrl+C`
3. **Terminal 3 (Cloudflared)**: Press `Ctrl+C` (if running)

### Deactivate Virtual Environment

**Linux/macOS and Windows**:
```bash
deactivate
```

### Optional: Clear Test Data

**Remove database**:
```bash
cd backend
rm db.sqlite3
```

**Clear browser storage**:
- Open browser Developer Tools (F12)
- Go to Application → Local Storage
- Clear `ACCESS_TOKEN` and `REFRESH_TOKEN`

---

## Common Usage Scenarios

### Scenario 1: Daily Planning

1. Start application
2. Navigate to Calendar → Day View
3. Review today's events (color-coded by urgency)
4. Create new events for tasks
5. Sync with Google Calendar if needed

### Scenario 2: Team Meeting Coordination

1. Receive meeting invite via email
2. Gmail auto-parsing creates suggestion
3. Review in Pending Events
4. Approve to add to calendar
5. Emoji and location automatically populated

### Scenario 3: Academic Calendar Import

1. Get iCal URL from Brightspace
2. Import via Brightspace Integration
3. All course events appear on calendar
4. Create personal study events around classes
5. Sync combined calendar to Google

### Scenario 4: Recurring Event Management

1. Create recurring event (e.g., weekly team meeting)
2. Calendar expands to show all occurrences
3. Edit single occurrence if needed
4. Sync to Google Calendar for mobile access
5. Team members see updated schedule

---

## Troubleshooting

### Issue: Frontend can't connect to backend

**Symptoms**: Network errors, blank pages, API errors

**Solutions**:
1. Verify backend is running: Check Terminal 1 for Django server
2. Check `VITE_API_URL` in frontend/.env: Should be `http://localhost:8000`
3. Verify `DJANGO_CORS_ALLOWED_ORIGINS` in backend/.env includes `http://localhost:5173`
4. Restart both servers

### Issue: Gmail auto-parsing not working

**Symptoms**: No suggestions appearing in Pending Events

**Solutions**:
1. Verify cloudflared is running (Terminal 3)
2. Check tunnel URL matches `GOOGLE_WEBHOOK_BASE_URL` in backend/.env
3. Restart backend after updating .env
4. Verify `GROQ_API_KEY` is valid
5. Check backend console for webhook POST requests
6. Confirm Gmail watch subscription is active

### Issue: Google Calendar sync fails

**Symptoms**: OAuth errors, redirect URI mismatch

**Solutions**:
1. Go to Google Cloud Console → OAuth Client
2. Verify authorized redirect URIs include:
   - `http://localhost:8000/api/google/oauth/callback/`
3. Ensure `GOOGLE_REDIRECT_URI` in backend/.env matches exactly
4. Restart backend after changes

### Issue: Events not displaying

**Symptoms**: Calendar appears empty

**Solutions**:
1. Check browser console for JavaScript errors (F12)
2. Verify events exist: Open `http://localhost:8000/admin` and login
3. Check network tab for API requests
4. Ensure date range is correct (try navigating to today)
5. Refresh browser page

### Issue: Custom emojis not showing

**Symptoms**: Default urgency emojis appear instead

**Solutions**:
1. Check browser console for CSP violations
2. Verify `frontend/index.html` CSP allows `https://cdn.jsdelivr.net`
3. Try different browser (Chrome or Firefox recommended)
4. Clear browser cache and reload

---

## Performance Tips

1. **Keep cloudflared running**: Restarting changes the URL and requires backend restart
2. **Use incognito/private browsing**: For clean testing sessions
3. **Clear browser cache**: If experiencing stale data
4. **Monitor backend console**: Watch for errors and warnings
5. **Limit initial sync**: When connecting Google Calendar with many events, first sync may take time

---

## Next Steps

For setting up permanent cloudflared tunnels that don't change on restart, see `CLOUDFLARED_TUNNEL_SETUP.md`.

For production deployment configuration, see the `.env.production.template` files in the Instructions folder.
