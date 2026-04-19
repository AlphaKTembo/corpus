# How to Restart API Server

## Quick Restart Options

### Option 1: If Using Docker Compose

```bash
cd infra
docker compose restart api
```

### Option 2: If Running Locally (Development)

```bash
# Stop any running API server (Ctrl+C in terminal where it's running)
# Then start it:
cd services/api
npm install  # Only needed first time or after dependency changes
npm run start:dev
```

### Option 3: Check What's Running

```bash
# Check if API is running
lsof -i:3000

# Check if web is running  
lsof -i:3001  # or whatever port Next.js uses
```

## Your Current Setup

Based on your system:
- **Web server**: Running on port 3000 (Next.js)
- **API server**: Not currently running

## Recommended: Start API Server

Since your web app is running on port 3000, your API should run on a different port OR you need to configure the web app to proxy to the API.

### Quick Start API (Port 3001):

```bash
cd services/api
PORT=3001 npm run start:dev
```

Then update your web app's API client to point to `http://localhost:3001` instead of port 3000.

## Environment Variables

Your FitnessSyncer credentials are in `.env`:
- ✅ FITNESSSYNCER_CLIENT_ID=df950ab8fe90414d96c8d480bd8823b1
- ✅ FITNESSSYNCER_CLIENT_SECRET=2f4aed980b3b46f786149151508bf3ae
- ✅ FITNESSSYNCER_REDIRECT_URI=https://personal.fitnesssyncer.com/

Make sure the API server loads these when starting!

