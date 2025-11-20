# Cloudflared Tunnel Setup

This guide covers setting up cloudflared tunnels for V-Cal. Tunnels provide publicly accessible HTTPS URLs needed for Gmail auto-parsing webhooks.

---

## Why Cloudflared?

Gmail's push notification system (Pub/Sub) requires a publicly accessible HTTPS URL to send webhook notifications. Cloudflared provides this without:
- Opening ports on your router
- Configuring firewall rules
- Obtaining SSL certificates
- Exposing your local IP address

---

## Two Options

### Option 1: Temporary Tunnels (Quick Setup)
- **Use case**: Development, quick testing, single-session demos
- **Pros**: No account needed, instant setup, completely free
- **Cons**: URL changes every time you restart cloudflared
- **Best for**: First-time setup, learning the system

### Option 2: Permanent Tunnels (Production Setup)
- **Use case**: Production deployment, repeated demos, stable webhooks
- **Pros**: Fixed URLs that never change, professional domains
- **Cons**: Requires Cloudflare account and domain ownership
- **Best for**: Production environment, multiple demonstration sessions

---

## Option 1: Temporary Tunnel Setup

### Prerequisites

- cloudflared CLI installed
- Backend server can run on port 8000

### Step 1: Start Temporary Tunnel

**Linux/macOS and Windows**:
```bash
cloudflared tunnel --url http://localhost:8000
```

### Step 2: Copy Tunnel URL

Look for output similar to:
```
INF |  https://random-words-example.trycloudflare.com  |
```

Copy this URL (e.g., `https://random-words-example.trycloudflare.com`)

### Step 3: Update Backend Configuration

Edit `backend/.env`:
```ini
GOOGLE_WEBHOOK_BASE_URL=https://random-words-example.trycloudflare.com
```

### Step 4: Restart Backend

Terminal running Django server:
1. Press `Ctrl+C` to stop
2. Restart: `python manage.py runserver`

### Step 5: Update Google Cloud Pub/Sub

If you already have a Pub/Sub subscription:

1. Go to Google Cloud Console → Pub/Sub → Subscriptions
2. Edit your subscription
3. Update **Endpoint URL** to: `https://random-words-example.trycloudflare.com/api/gmail/webhook/`
4. Save

### Important Notes

**URL Lifespan**:
- URL is valid until you stop cloudflared (Ctrl+C)
- Restarting cloudflared generates a NEW URL
- You must update `.env` and Pub/Sub subscription with new URL

**Best Practices**:
- Start cloudflared FIRST, note URL, THEN start backend
- Keep cloudflared running during entire session
- Don't restart cloudflared unless necessary

---

## Option 2: Permanent Tunnel Setup

### Prerequisites

1. **Cloudflare Account** (Free): Sign up at https://cloudflare.com
2. **Domain**: You need a domain (examples: namecheap.com, godaddy.com - ~$10-15/year)
3. **Domain on Cloudflare**:
   - Add domain to Cloudflare account
   - Update domain nameservers to Cloudflare's nameservers
   - Wait for nameserver propagation (usually 5-30 minutes)

### Step 1: Authenticate Cloudflared

**One-time setup** - Opens browser for authentication:
```bash
cloudflared tunnel login
```

Follow browser prompts to authorize cloudflared with your Cloudflare account.

### Step 2: Create Named Tunnel

Replace `vcal-tunnel` with your preferred tunnel name:
```bash
cloudflared tunnel create vcal-tunnel
```

**Output** shows:
- Tunnel UUID (e.g., `1234abcd-5678-efgh-9012-ijklmnopqrst`)
- Credentials file path (e.g., `~/.cloudflared/1234abcd-5678-efgh-9012-ijklmnopqrst.json`)

**Save the UUID** - you'll need it for configuration.

### Step 3: Create Configuration File

Create file: `~/.cloudflared/config.yml`

**Linux/macOS**:
```bash
nano ~/.cloudflared/config.yml
```

**Windows**:
```powershell
notepad $HOME\.cloudflared\config.yml
```

**Template** (see `cloudflared-config.yml.template` for full version):
```yaml
tunnel: vcal-tunnel
credentials-file: /path/to/your/.cloudflared/1234abcd-5678-efgh-9012-ijklmnopqrst.json

ingress:
  # Backend API
  - hostname: api.yourdomain.com
    service: http://localhost:8000
    originRequest:
      noTLSVerify: true

  # Frontend
  - hostname: app.yourdomain.com
    service: http://localhost:5173
    originRequest:
      noTLSVerify: true

  # Required catch-all
  - service: http_status:404
```

**Replace**:
- `yourdomain.com` with your actual domain
- `/path/to/your/.cloudflared/...json` with actual credentials file path from Step 2

### Step 4: Create DNS Routes

Map your subdomains to the tunnel:

```bash
cloudflared tunnel route dns vcal-tunnel api.yourdomain.com
cloudflared tunnel route dns vcal-tunnel app.yourdomain.com
```

This creates DNS records in Cloudflare automatically.

### Step 5: Update Environment Variables

**Backend** (`backend/.env`):
```ini
DJANGO_ALLOWED_HOSTS=api.yourdomain.com,localhost,127.0.0.1
DJANGO_CORS_ALLOWED_ORIGINS=https://app.yourdomain.com
FRONTEND_APP_URL=https://app.yourdomain.com
FRONTEND_TUNNEL=app.yourdomain.com
BACKEND_TUNNEL=api.yourdomain.com
GOOGLE_REDIRECT_URI=https://api.yourdomain.com/api/google/oauth/callback/
GOOGLE_WEBHOOK_BASE_URL=https://api.yourdomain.com
```

**Frontend** (`frontend/.env`):
```ini
VITE_API_URL=https://api.yourdomain.com
VITE_TUNNEL_HOST=app.yourdomain.com
```

### Step 6: Update Google Cloud Settings

**OAuth Redirect URIs**:
1. Go to Google Cloud Console → APIs & Services → Credentials
2. Edit your OAuth 2.0 Client ID
3. Add to **Authorized redirect URIs**:
   - `https://api.yourdomain.com/api/google/oauth/callback/`

**Pub/Sub Subscription**:
1. Go to Pub/Sub → Subscriptions
2. Edit subscription
3. Set **Endpoint URL**: `https://api.yourdomain.com/api/gmail/webhook/`

### Step 7: Run Permanent Tunnel

**Development** (manual start):
```bash
cloudflared tunnel run vcal-tunnel
```

**Production** (as system service):

**Linux**:
```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared  # Auto-start on boot
```

**Windows** (run PowerShell as Administrator):
```powershell
cloudflared.exe service install
sc start cloudflared
sc config cloudflared start=auto  # Auto-start on boot
```

### Step 8: Verify Setup

1. Open browser to `https://app.yourdomain.com`
2. Should show V-Cal frontend (may take 1-2 minutes for DNS propagation)
3. Test API: `https://api.yourdomain.com/admin`
4. Should show Django admin login

---

## Managing Permanent Tunnels

### Check Tunnel Status

**Linux**:
```bash
sudo systemctl status cloudflared
```

**Windows**:
```powershell
sc query cloudflared
```

### View Logs

**Linux**:
```bash
sudo journalctl -u cloudflared -f
```

**Windows**:
Check Event Viewer → Windows Logs → Application

### Stop Tunnel

**Linux**:
```bash
sudo systemctl stop cloudflared
```

**Windows**:
```powershell
sc stop cloudflared
```

### Uninstall Service

**Linux**:
```bash
sudo systemctl disable cloudflared
sudo cloudflared service uninstall
```

**Windows** (as Administrator):
```powershell
sc stop cloudflared
sc delete cloudflared
```

---

## Comparison: Temporary vs Permanent

| Feature | Temporary Tunnel | Permanent Tunnel |
|---------|-----------------|------------------|
| **Setup Time** | 30 seconds | 15-30 minutes (one-time) |
| **URL Format** | random-words.trycloudflare.com | api.yourdomain.com |
| **URL Persistence** | Changes on restart | Never changes |
| **Cloudflare Account** | Not required | Required (free) |
| **Domain Required** | No | Yes (~$10-15/year) |
| **Best For** | Development, testing | Production, demos |
| **Configuration** | Update .env on restart | Set once, forget |

---

## Troubleshooting

### Issue: Tunnel won't start

**Error**: `tunnel credentials file not found`

**Solution**:
- Verify `credentials-file` path in `~/.cloudflared/config.yml`
- Use absolute path (e.g., `/home/username/.cloudflared/uuid.json`)
- Check file exists: `ls ~/.cloudflared/`

### Issue: DNS not resolving

**Error**: `ERR_NAME_NOT_RESOLVED` when visiting `app.yourdomain.com`

**Solution**:
- Wait 5-10 minutes for DNS propagation
- Verify DNS routes created: `cloudflared tunnel route dns list`
- Check Cloudflare DNS dashboard for A/AAAA records
- Try `nslookup api.yourdomain.com`

### Issue: 502 Bad Gateway

**Error**: Tunnel is running but site shows 502 error

**Solution**:
- Ensure backend is running: `python manage.py runserver`
- Check port in config.yml matches Django port (8000)
- Verify `service: http://localhost:8000` in config.yml
- Check firewall isn't blocking localhost connections

### Issue: Temporary tunnel URL changed

**Symptom**: Gmail webhooks stop working after restart

**Solution**:
1. Note new tunnel URL from cloudflared output
2. Update `backend/.env` → `GOOGLE_WEBHOOK_BASE_URL`
3. Restart Django: `Ctrl+C` then `python manage.py runserver`
4. Update Google Cloud Pub/Sub subscription endpoint URL

**Prevention**: Use permanent tunnel for production/repeated demos

### Issue: Multiple tunnels running

**Error**: Port already in use or unexpected behavior

**Solution**:
```bash
# Find cloudflared processes
ps aux | grep cloudflared  # Linux/macOS
tasklist | findstr cloudflared  # Windows

# Kill processes
kill -9 <PID>  # Linux/macOS
taskkill /PID <PID> /F  # Windows
```

---

## Cost Summary

### Temporary Tunnels
- **Cost**: $0 (completely free)
- **Limitations**: None for V-Cal use case

### Permanent Tunnels
- **Cloudflare Account**: $0 (free tier)
- **Tunnel Service**: $0 (free tier)
- **Bandwidth**: Unlimited (free)
- **Domain Registration**: $10-15/year (varies by TLD)

**Total Annual Cost**: ~$10-15 for domain only

---

## Security Considerations

### SSL/TLS
- Cloudflare provides automatic HTTPS
- No certificate management required
- Cloudflare terminates SSL, proxies to your localhost

### Firewall
- No port forwarding needed
- No changes to router/firewall
- Cloudflared creates outbound tunnel only

### Access Control
- Tunnel only forwards traffic to specified services
- Django's `ALLOWED_HOSTS` provides additional validation
- CORS settings prevent unauthorized frontend access

---

## Production Deployment Recommendations

For production or stable demo environments:

1. **Use permanent tunnels**: Eliminates URL change issues
2. **Install as system service**: Auto-starts on server reboot
3. **Set DEBUG=False**: In production environment
4. **Use strong SECRET_KEY**: Generate new random key
5. **Enable security headers**: Uncomment in `.env.production.template`
6. **Configure backup**: Export tunnel config and credentials
7. **Monitor logs**: Set up log aggregation/monitoring

---

## Next Steps

- **For development**: Use temporary tunnels (quick and easy)
- **For production**: Set up permanent tunnels (one-time effort, lasting benefit)
- **For help**: See full template in `cloudflared-config.yml.template`
- **For environment config**: See `.env.production.template` files in Instructions folder
