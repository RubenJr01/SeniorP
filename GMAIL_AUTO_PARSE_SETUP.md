# Gmail Auto-Parse Setup Guide
## 🎯 Simple Step-by-Step Instructions

### What This Does
When someone emails you "Meeting tomorrow at 2pm in room 301", V-Cal will **automatically** create a calendar event. No copy-pasting needed!

---

## 📋 What You Need Before Starting
- [ ] A Gmail account
- [ ] 30 minutes of free time
- [ ] Your V-Cal app running

**Don't worry if you've never used Google Cloud before - this guide assumes ZERO experience!**

---

## Part 1: Get a FREE Groq AI Key (5 minutes)

### Why?
This is the "brain" that reads your emails and figures out the meeting details.

### Steps:

1. **Go to this website:** https://console.groq.com/

2. **Sign up:**
   - Click the big "Sign In" or "Sign Up" button
   - Use your Google account or email
   - It's 100% free, no credit card needed

3. **Get your API key:**
   - After signing in, look for "API Keys" in the left sidebar
   - Click "+ Create API Key"
   - Give it a name like "VCal App"
   - Click "Create"
   - **COPY THE KEY** (looks like: `gsk_abc123xyz...`)

4. **Save the key:**
   - Open your project folder: `SeniorP/backend/`
   - Find the file named `.env`
   - Add this line (paste your actual key):
     ```
     GROQ_API_KEY=gsk_abc123xyz_YOUR_ACTUAL_KEY_HERE
     ```
   - Save the file

✅ **Done with Part 1!** The AI is ready.

---

## Part 2: Set Up Google Cloud (25 minutes)

### Why?
Google needs to tell your app when new emails arrive.

---

### Step A: Create a Google Cloud Project

1. **Go to:** https://console.cloud.google.com/

2. **Sign in** with your Gmail account

3. **At the very top of the page**, you'll see a project dropdown (might say "Select a project" or show a project name)
   - Click it
   - Click "**NEW PROJECT**" button (top right of the popup)

4. **Create your project:**
   - Project name: `VCal-App` (or anything you want)
   - Location: Leave as "No organization"
   - Click "**CREATE**"
   - Wait 10-20 seconds for it to create

5. **Make sure your new project is selected:**
   - Look at the top of the page again
   - It should say "VCal-App" (or whatever you named it)
   - If not, click the dropdown and select it

---

### Step B: Turn On Gmail API

1. **Still on Google Cloud Console,** click the **☰ hamburger menu** (top left, three horizontal lines)

2. **Navigate:** Hover over "**APIs & Services**" → Click "**Library**"

3. **In the search box,** type: `Gmail API`

4. **Click on** "Gmail API" (the official one from Google)

5. **Click the blue "ENABLE" button**

6. **Wait** for it to say "API Enabled" (takes 5-10 seconds)

✅ **Gmail API is now on!**

---

### Step C: Turn On Pub/Sub API

1. **In the search box** (same Library page), type: `Cloud Pub/Sub API`

2. **Click on** "Cloud Pub/Sub API"

3. **Click "ENABLE"**

4. **Wait** for it to enable

✅ **Pub/Sub is now on!**

---

### Step D: Create a Topic (This is where Gmail will send notifications)

1. **Click the ☰ hamburger menu** (top left)

2. **Navigate:** Scroll down to "**Pub/Sub**" → Click "**Topics**"

3. **Click the "+ CREATE TOPIC" button** (top of page)

4. **Fill in the form:**
   - **Topic ID:** Type exactly: `gmail-notifications`
   - **Leave everything else as default** (don't change any checkboxes)

5. **Click "CREATE" at the bottom**

6. **IMPORTANT: Copy your topic name**
   - After it creates, you'll see a page with details
   - Look for "Topic name" - it looks like: `projects/vcal-app-123456/topics/gmail-notifications`
   - **COPY THIS ENTIRE THING** - you'll need it later
   - Save it in a text file for now

✅ **Topic created!**

---

### Step E: Let Gmail Send Notifications to Your Topic

**Important:** This step is tricky because Google's UI can be confusing. Follow these exact steps:

1. **Make sure you're on your topic page** (you should still be there from Step D)
   - The page should say "Topic details" at the top
   - You should see your topic name: `projects/your-project/topics/gmail-notifications`

2. **Click the "PERMISSIONS" tab** (near the top, next to "DETAILS")

3. **Click the "+ GRANT ACCESS" or "+ ADD PRINCIPAL" button** (depends on your UI version)

4. **IMPORTANT - Add the principal correctly:**
   - In the "New principals" box, type this **EXACTLY** (include `serviceAccount:` at the beginning):
     ```
     serviceAccount:gmail-api-push@system.gserviceaccount.com
     ```
   - **Do NOT just type the email** - you MUST include `serviceAccount:` before it!

5. **Select the role:**
   - Click the "Select a role" dropdown
   - Type "Pub/Sub Publisher" in the search box
   - Click on "**Pub/Sub Publisher**" when it appears

6. **Click "SAVE"**

**If you still get an error** saying "Email addresses must be associated with an active Google Account":

**Alternative Method (Using gcloud command line):**

1. **Open Google Cloud Shell** (click the `>_` icon in the top-right of Google Cloud Console)

2. **Run this command** (replace `YOUR-PROJECT-ID` with your actual project ID):
   ```bash
   gcloud pubsub topics add-iam-policy-binding gmail-notifications \
     --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
     --role=roles/pubsub.publisher \
     --project=YOUR-PROJECT-ID
   ```

3. **Press Enter** - you should see output saying "Updated IAM policy"

**To verify it worked (either method):**
- On the Permissions tab, you should now see `gmail-api-push@system.gserviceaccount.com` listed with role "Pub/Sub Publisher"

✅ **Gmail now has permission to send notifications!**

---

### Step F: Create a Subscription (This sends notifications to your app)

**⚠️ STOP HERE FOR NOW IF YOU'RE TESTING LOCALLY**

For local development (running on your computer), you need a **public URL** first. Skip to "Local Development Setup" section below, then come back here.

**For production (deployed app), continue:**

1. **Click the ☰ hamburger menu**

2. **Navigate:** "**Pub/Sub**" → "**Subscriptions**"

3. **Click "+ CREATE SUBSCRIPTION" button**

4. **Fill in the form:**
   - **Subscription ID:** Type: `gmail-vcal-push`
   - **Select a Cloud Pub/Sub topic:** Click "Browse" and select `gmail-notifications`
   - **Delivery type:** Make sure "**Push**" is selected (not Pull)
   - **Endpoint URL:** This is YOUR app's webhook URL:
     - Format: `https://YOUR-DOMAIN.com/api/gmail/webhook/`
     - Example: `https://vcal.herokuapp.com/api/gmail/webhook/`
     - Example: `https://api.yoursite.com/api/gmail/webhook/`
   - **Enable authentication:** Leave this **UNCHECKED**
   - **Message retention duration:** 7 days (default is fine)
   - **Acknowledgement deadline:** 10 seconds (default is fine)

5. **Click "CREATE"**

✅ **Subscription created! Gmail will now send notifications to your app!**

---

### Step G: Add Config to Your App

1. **Open your project:** `SeniorP/backend/.env`

2. **Add these lines** (replace with your actual values):

```ini
# Paste the topic name you copied in Step D
GOOGLE_PUBSUB_TOPIC=projects/vcal-app-123456/topics/gmail-notifications

# Your app's public URL (same as your website)
GOOGLE_WEBHOOK_BASE_URL=https://YOUR-DOMAIN.com

# You already added this in Part 1
GROQ_API_KEY=gsk_abc123xyz_YOUR_ACTUAL_KEY_HERE
```

3. **Save the file**

4. **Restart your backend server**

✅ **Configuration complete!**

---

## Part 3: Enable in Your App (2 minutes)

### For Existing Users (If you already connected Google Calendar before)

**You MUST reconnect your Google account to get Gmail permission:**

1. Open your V-Cal app
2. Go to **Dashboard**
3. Find "Google sync" section
4. Click "**Disconnect**"
5. Click "**Connect**" again
6. When Google asks for permissions, you'll now see "**Read your email messages**" - this is normal!
7. Click "Allow"

### Enable Gmail Auto-Parse

1. On Dashboard, scroll to "**Gmail auto-parse**" section
2. Click "**Enable**"
3. You should see "Active" status

✅ **You're done! It's working!**

---

## 🧪 Test It Out!

1. **Send yourself an email** (from any account to your Gmail):

```
Subject: Team Meeting

Hey, let's meet tomorrow at 3:00 PM in conference room A
to discuss the project. Should take about an hour.
```

2. **Wait 5-10 seconds**

3. **Check your V-Cal app:**
   - You should see a new event: "Team Meeting"
   - Check notifications - you'll see "Auto-created: Team Meeting"

**If it worked: 🎉 Congratulations! You're all set!**

**If it didn't work:** See "Troubleshooting" section below.

---

## 🏠 Local Development Setup

**Testing on your laptop?** You need a public URL because Google can't send notifications to `localhost`.

### Option 1: Cloudflare Tunnel (Easiest, Free)

1. **Install Cloudflare Tunnel:**
   ```bash
   # Windows
   winget install cloudflare.cloudflared

   # Mac
   brew install cloudflare/cloudflare/cloudflared
   ```

2. **Start your Django server:**
   ```bash
   cd backend
   python manage.py runserver
   ```

3. **In another terminal, start the tunnel:**
   ```bash
   cloudflared tunnel --url http://localhost:8000
   ```

4. **Copy the public URL** it gives you (looks like: `https://random-words.trycloudflare.com`)

5. **Use this URL in Step F** for the webhook:
   ```
   https://random-words.trycloudflare.com/api/gmail/webhook/
   ```

6. **Add to your `.env`:**
   ```ini
   GOOGLE_WEBHOOK_BASE_URL=https://random-words.trycloudflare.com
   ```

### Option 2: ngrok (Alternative)

1. Sign up at https://ngrok.com (free)
2. Install ngrok
3. Run: `ngrok http 8000`
4. Copy the HTTPS URL
5. Use it for webhook endpoint

---

## ❌ Troubleshooting

### "Gmail access not authorized" error

**Fix:**
1. Dashboard → Google sync → Disconnect
2. Connect again
3. Make sure you click "Allow" when Google asks for Gmail permission

### No events being created from emails

**Check:**
1. Is your GROQ_API_KEY in `.env`? (Part 1)
2. Did you restart the backend after adding the key?
3. Does your email have calendar keywords? Try: "meeting tomorrow at 2pm"
4. Check backend terminal - any errors?

### Webhook not receiving anything

**Check:**
1. Is your webhook URL public (not localhost)?
2. Did you add `/api/gmail/webhook/` at the end?
3. Test it with this command (replace URL):
   ```bash
   curl -X POST https://YOUR-URL.com/api/gmail/webhook/ \
     -H "Content-Type: application/json" \
     -d '{"message":{"data":"e30="}}'
   ```
   You should see: `{"status":"processed",...}`

### Still stuck?

**Check these URLs in Google Cloud Console:**
- Pub/Sub Topic: https://console.cloud.google.com/cloudpubsub/topic/list
- Subscriptions: https://console.cloud.google.com/cloudpubsub/subscription/list
- APIs Enabled: https://console.cloud.google.com/apis/dashboard

Make sure:
- Gmail API shows "Enabled"
- Cloud Pub/Sub API shows "Enabled"
- Your topic exists
- Your subscription shows "PUSH" type

---

## 📝 Quick Reference

**What you created in Google Cloud:**
- Project: `VCal-App`
- Topic: `gmail-notifications`
- Subscription: `gmail-vcal-push`

**What you added to `.env`:**
```ini
GOOGLE_PUBSUB_TOPIC=projects/YOUR-PROJECT-ID/topics/gmail-notifications
GOOGLE_WEBHOOK_BASE_URL=https://your-domain.com
GROQ_API_KEY=gsk_your_key_here
```

**URLs to bookmark:**
- Google Cloud Console: https://console.cloud.google.com/
- Groq Console: https://console.groq.com/
- Pub/Sub Topics: https://console.cloud.google.com/cloudpubsub/topic/list

---

## 💰 Costs

**Everything is FREE for normal use:**
- Groq AI: Free tier = 14,400 requests/day
- Google Pub/Sub: Free for first 10 GB/month
- Gmail API: Free

You'd need THOUSANDS of emails per day to exceed free limits.

---

## 🎓 For Your Senior Project Presentation

**What to say:**
> "My app uses Google Cloud Pub/Sub for real-time push notifications. When an email arrives, Gmail sends a notification to my webhook endpoint, which fetches the email content, filters it with keyword matching, parses it with Groq's Llama 3.3 AI model, and automatically creates a calendar event - all in under 5 seconds."

**Impressive tech buzzwords you're using:**
- Real-time push notifications (not polling!)
- Google Cloud Platform integration
- Webhook architecture
- AI/Machine Learning (Llama 3.3 70B)
- OAuth 2.0 with multiple scopes
- Background task scheduling (Celery)
- Event-driven architecture

This is way more advanced than most senior projects! 🚀
