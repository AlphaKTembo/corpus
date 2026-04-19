# FitnessSyncer Setup Steps - Complete Guide

## Your Credentials

✅ **Client ID**: `df950ab8fe90414d96c8d480bd8823b1`  
✅ **Client Secret**: `2f4aed980b3b46f786149151508bf3ae`  
✅ **Redirect URL**: `https://personal.fitnesssyncer.com/`

## Step 1: Add Environment Variables

### Option A: Create/Edit `.env` file in project root

Create or edit `/Users/kurasilalabs/Documents/corpus/.env` and add:

```bash
# FitnessSyncer OAuth2 Credentials
FITNESSSYNCER_CLIENT_ID=df950ab8fe90414d96c8d480bd8823b1
FITNESSSYNCER_CLIENT_SECRET=2f4aed980b3b46f786149151508bf3ae
FITNESSSYNCER_REDIRECT_URI=https://personal.fitnesssyncer.com/
```

### Option B: Set in Docker Compose (if using Docker)

Edit `infra/docker-compose.yml` and add to the `api` service environment:

```yaml
environment:
  - FITNESSSYNCER_CLIENT_ID=df950ab8fe90414d96c8d480bd8823b1
  - FITNESSSYNCER_CLIENT_SECRET=2f4aed980b3b46f786149151508bf3ae
  - FITNESSSYNCER_REDIRECT_URI=https://personal.fitnesssyncer.com/
```

## Step 2: Restart API Server

### If running locally (development):

```bash
# Stop the current API server (Ctrl+C if running in terminal)
# Then restart:
cd services/api
npm run start:dev
```

### If using Docker:

```bash
cd infra
docker compose restart api
```

### Verify environment variables are loaded:

```bash
# Check API logs to ensure no errors
docker compose logs api | tail -20
```

## Step 3: Connect Your FitnessSyncer Account

### Via Web Dashboard (Recommended):

1. **Start your web app** (if not running):
   ```bash
   cd apps/web
   npm run dev
   ```

2. **Navigate to FitnessSyncer page**:
   - Open browser: `http://localhost:3000/fitnesssyncer`
   - Or click "FitnessSyncer" in the navigation menu

3. **Click "Connect FitnessSyncer Account"**:
   - This opens FitnessSyncer's authorization page in a new window
   - Log in to your FitnessSyncer account
   - Authorize the application

4. **Copy the Authorization Code**:
   - After authorization, FitnessSyncer redirects to: `https://personal.fitnesssyncer.com/?code=YOUR_CODE_HERE`
   - Copy the `code` value from the URL (everything after `code=`)

5. **Paste Code in the Form**:
   - Back on your Corpus dashboard, you'll see a form
   - Paste the code into the input field
   - Click "Connect"

6. **Success!**:
   - You should see "✓ Connected" status
   - The connection is now saved

### Via API (Alternative):

1. **Get authorization URL**:
   ```bash
   curl http://localhost:3000/api/v1/fitnesssyncer/authorize
   ```

2. **Visit the URL** in your browser and authorize

3. **Extract code** from the redirect URL

4. **Exchange code for token**:
   ```bash
   curl -X POST http://localhost:3000/api/v1/fitnesssyncer/callback \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{"code": "YOUR_CODE_HERE"}'
   ```

## Step 4: Verify Connection

### Check Status:

```bash
curl http://localhost:3000/api/v1/fitnesssyncer/status
```

Should return:
```json
{
  "connected": true,
  "hasToken": true
}
```

Or check in the web UI at `/fitnesssyncer` - you should see "✓ Connected"

## Step 5: Sync Data

### Option A: Via Web UI

1. Go to `/fitnesssyncer` page
2. Click "Sync Now" button
3. Check the ingestion status page for progress

### Option B: Via CLI

```bash
cd infra
docker compose run --rm worker fitnesssyncer --sync
```

### Option C: Automatic Daily Sync

Set up cron job (see `infra/cron-setup.sh`):

```bash
cd infra
chmod +x cron-setup.sh
./cron-setup.sh
```

This sets up daily syncs at 6 AM.

## Step 6: Verify Data Sync

After syncing, check:

1. **Dashboard** (`/dashboard`) - Should show activities and metrics
2. **Activities** (`/activities`) - Should list synced activities
3. **Metrics** (`/metrics`) - Should show vitals, sleep, body metrics

## Troubleshooting

### "FitnessSyncer credentials not configured"
- ✅ Make sure `.env` file exists with the credentials
- ✅ Restart API server after adding variables
- ✅ Check variable names are exact (case-sensitive)

### "Invalid redirect_uri"
- ✅ For personal apps, use `https://personal.fitnesssyncer.com/`
- ✅ The redirect URL must match exactly what's registered

### "Invalid client_id" or "Invalid client_secret"
- ✅ Check for extra spaces in the values
- ✅ Make sure credentials are correct
- ✅ Restart API server after changes

### Connection works but no data syncs
- ✅ Check worker logs: `docker compose logs worker`
- ✅ Verify tokens are saved: Check `/data/corpus/metadata/fitnesssyncer_tokens.json`
- ✅ Make sure you have data sources configured in FitnessSyncer

### Manual Code Entry Not Working
- ✅ Make sure the code is complete (no extra characters)
- ✅ Code expires quickly - use it immediately after getting it
- ✅ Check API logs for error details

## Quick Reference

**Environment Variables:**
```bash
FITNESSSYNCER_CLIENT_ID=df950ab8fe90414d96c8d480bd8823b1
FITNESSSYNCER_CLIENT_SECRET=2f4aed980b3b46f786149151508bf3ae
FITNESSSYNCER_REDIRECT_URI=https://personal.fitnesssyncer.com/
```

**API Endpoints:**
- Get auth URL: `GET /api/v1/fitnesssyncer/authorize`
- Exchange code: `POST /api/v1/fitnesssyncer/callback` (body: `{code: "..."}`)
- Check status: `GET /api/v1/fitnesssyncer/status`
- Trigger sync: `POST /api/v1/fitnesssyncer/sync`

**CLI Commands:**
- Sync: `docker compose run --rm worker fitnesssyncer --sync`
- Scheduled sync: `docker compose run --rm worker scheduler`

## Next Steps

Once connected:
1. ✅ Data syncs automatically if cron is set up
2. ✅ Or trigger manual syncs via web UI or CLI
3. ✅ View synced data in Dashboard, Activities, and Metrics pages
4. ✅ Data appears in Parquet files: `/data/corpus/canonical/`

You're all set! 🎉

