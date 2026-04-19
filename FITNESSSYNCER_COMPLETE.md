# FitnessSyncer Integration - Complete ✅

## What Was Added

### 1. Web UI Connection Page ✅
- **Location**: `/fitnesssyncer` page in web dashboard
- **Features**:
  - Connection status display
  - "Connect FitnessSyncer Account" button
  - OAuth2 flow initiation
  - Callback handling with success/error messages
  - Manual sync trigger button
  - Connection instructions and data sync info

### 2. Scheduled Automatic Syncs ✅
- **Scheduler Service**: `services/worker/src/services/scheduler.service.ts`
  - Runs both CSV/FIT file sync and FitnessSyncer sync
  - Handles errors gracefully
  - Checks for FitnessSyncer connection before syncing

- **CLI Command**: `docker compose run --rm worker scheduler`
  - Single command to run all scheduled syncs
  - Perfect for cron jobs

- **Cron Setup Script**: `infra/cron-setup.sh`
  - Automated setup of daily sync at 6 AM
  - Logs to `/var/log/corpus-scheduler.log`

## How It Works

### User Connection Flow

1. **User visits** `/fitnesssyncer` page
2. **Clicks** "Connect FitnessSyncer Account"
3. **Redirected** to FitnessSyncer authorization page
4. **Authorizes** and gets redirected back with code
5. **API exchanges** code for tokens and stores them
6. **Page shows** "✓ Connected" status

### Automatic Sync Flow

1. **Cron job** runs daily at 6 AM (or custom schedule)
2. **Scheduler service** executes:
   - Syncs CSV/FIT files from drive_sync folder
   - If FitnessSyncer connected, syncs from API
   - Processes all data into Parquet
   - Recomputes derived datasets
3. **Data appears** in dashboard automatically

## Setup Instructions

### 1. Configure Environment

Add to `.env`:
```bash
FITNESSSYNCER_CLIENT_ID=your_client_id
FITNESSSYNCER_CLIENT_SECRET=your_client_secret
FITNESSSYNCER_REDIRECT_URI=http://your-domain/api/v1/fitnesssyncer/callback
```

### 2. Set Up Cron (Optional but Recommended)

```bash
cd infra
chmod +x cron-setup.sh
./cron-setup.sh
```

Or manually add to crontab:
```bash
0 6 * * * cd /path/to/corpus/infra && docker compose run --rm worker scheduler >> /var/log/corpus-scheduler.log 2>&1
```

### 3. Connect Account

1. Navigate to `/fitnesssyncer` in web dashboard
2. Click "Connect FitnessSyncer Account"
3. Authorize on FitnessSyncer
4. Done! Data will sync automatically

## API Endpoints

- `GET /api/v1/fitnesssyncer/authorize` - Get authorization URL
- `GET /api/v1/fitnesssyncer/callback` - OAuth2 callback (public)
- `GET /api/v1/fitnesssyncer/status` - Check connection status
- `POST /api/v1/fitnesssyncer/sync` - Trigger manual sync

## CLI Commands

```bash
# Get authorization URL
docker compose run --rm worker fitnesssyncer --auth-url

# Exchange code for token
docker compose run --rm worker fitnesssyncer --exchange-code <code>

# Manual sync
docker compose run --rm worker fitnesssyncer --sync

# Run all scheduled syncs (for cron)
docker compose run --rm worker scheduler
```

## Files Created/Modified

**New Files:**
- `apps/web/src/app/fitnesssyncer/page.tsx` - Web UI page
- `services/api/src/fitnesssyncer/fitnesssyncer-callback.controller.ts` - OAuth callback handler
- `services/worker/src/services/scheduler.service.ts` - Scheduler service
- `services/worker/src/commands/scheduler.command.ts` - Scheduler CLI command
- `infra/cron-setup.sh` - Cron setup script
- `FITNESSSYNCER_SETUP.md` - Setup guide

**Modified Files:**
- `apps/web/src/components/layout.tsx` - Added FitnessSyncer nav item
- `apps/web/src/lib/api-client.ts` - Added FitnessSyncer API methods
- `services/api/src/fitnesssyncer/fitnesssyncer.controller.ts` - Added status endpoint
- `services/worker/src/cli.ts` - Added scheduler command
- `SETUP.md` - Updated with cron instructions

## Status: ✅ Complete

Both features are now fully implemented and operational!

