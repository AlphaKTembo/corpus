# FitnessSyncer Integration Setup

## Quick Start

### 1. Get OAuth2 Credentials

1. Contact FitnessSyncer to register your application
2. Obtain:
   - Client ID
   - Client Secret
   - Set redirect URI: `http://your-domain/api/v1/fitnesssyncer/callback`

### 2. Configure Environment Variables

Add to your `.env` file:

```bash
FITNESSSYNCER_CLIENT_ID=your_client_id_here
FITNESSSYNCER_CLIENT_SECRET=your_client_secret_here
FITNESSSYNCER_REDIRECT_URI=http://your-domain/api/v1/fitnesssyncer/callback
```

### 3. Connect Account via Web UI

1. Navigate to `/fitnesssyncer` in the web dashboard
2. Click "Connect FitnessSyncer Account"
3. Authorize on FitnessSyncer's website
4. You'll be redirected back and see "✓ Connected"

### 4. Sync Data

**Manual sync via web UI:**
- Click "Sync Now" button on FitnessSyncer page

**Manual sync via CLI:**
```bash
docker compose run --rm worker fitnesssyncer --sync
```

**Automatic sync (recommended):**
- Set up cron job (see SETUP.md)
- Runs daily at 6 AM automatically

## What Gets Synced

- **Activities**: All workouts, runs, rides, etc.
- **Vitals**: HRV, resting heart rate
- **Sleep**: Duration, REM, deep sleep, efficiency
- **Body Metrics**: Weight, body fat percentage

## Troubleshooting

### "FitnessSyncer credentials not configured"
- Make sure `FITNESSSYNCER_CLIENT_ID` and `FITNESSSYNCER_CLIENT_SECRET` are set in environment

### "No FitnessSyncer token found"
- You need to connect your account first via the web UI

### Sync fails
- Check worker logs: `docker compose logs worker`
- Verify tokens are valid: Check `/data/corpus/metadata/fitnesssyncer_tokens.json`
- Tokens auto-refresh, but if issues persist, reconnect via web UI

