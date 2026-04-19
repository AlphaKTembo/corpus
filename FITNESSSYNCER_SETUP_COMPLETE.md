# FitnessSyncer Setup - Your Credentials

## Your Credentials

✅ **Client ID**: `df950ab8fe90414d96c8d480bd8823b1`  
✅ **Client Secret**: `2f4aed980b3b46f786149151508bf3ae`  
✅ **Redirect URL**: `https://personal.fitnesssyncer.com/` (FitnessSyncer's hard-coded URL for personal apps)

## Important Note About Redirect URL

For **Personal Applications**, FitnessSyncer uses a hard-coded redirect URL (`https://personal.fitnesssyncer.com/`). 

**However**, when making the OAuth request, you should still use your own callback URL. FitnessSyncer will redirect to their hard-coded URL first, but the authorization code will work with your callback endpoint.

## Configuration Steps

### 1. Add to Environment Variables

Add these to your `.env` file (or set as environment variables):

```bash
# FitnessSyncer OAuth2 Credentials
FITNESSSYNCER_CLIENT_ID=df950ab8fe90414d96c8d480bd8823b1
FITNESSSYNCER_CLIENT_SECRET=2f4aed980b3b46f786149151508bf3ae

# Redirect URI - Use your callback URL (FitnessSyncer will handle the redirect)
FITNESSSYNCER_REDIRECT_URI=http://localhost:3000/api/v1/fitnesssyncer/callback
```

**For Production:**
```bash
FITNESSSYNCER_REDIRECT_URI=https://your-domain.com/api/v1/fitnesssyncer/callback
```

### 2. Restart Your API Server

After adding the environment variables:

```bash
# If using Docker
docker compose restart api

# If running locally
# Stop and restart your API server
```

### 3. Connect Your Account

1. Navigate to `/fitnesssyncer` in your web dashboard
2. Click "Connect FitnessSyncer Account"
3. You'll be redirected to FitnessSyncer to authorize
4. After authorization, FitnessSyncer will redirect to their hard-coded URL
5. **Manually edit the URL** in your browser to: `http://localhost:3000/api/v1/fitnesssyncer/callback?code=YOUR_CODE`
6. Or copy the `code` parameter from the FitnessSyncer redirect URL and paste it into your callback

### 4. Alternative: Use the API Directly

You can also connect via API:

1. Get authorization URL:
   ```bash
   curl http://localhost:3000/api/v1/fitnesssyncer/authorize
   ```

2. Visit the URL in browser and authorize

3. Extract the `code` from the redirect URL

4. Exchange code for token:
   ```bash
   curl -X POST http://localhost:3000/api/v1/fitnesssyncer/callback \
     -H "Content-Type: application/json" \
     -d '{"code": "YOUR_CODE_HERE"}'
   ```

## Testing the Connection

After connecting, you can test by:

1. **Check Status**:
   ```bash
   curl http://localhost:3000/api/v1/fitnesssyncer/status
   ```

2. **Sync Data** (via worker):
   ```bash
   docker compose run --rm worker fitnesssyncer --sync
   ```

## Troubleshooting

**"Invalid redirect_uri"**
- For personal applications, FitnessSyncer may accept any redirect_uri or require it to match their hard-coded one
- Try using `https://personal.fitnesssyncer.com/` as the redirect_uri if your callback doesn't work
- The code will still work - you'll just need to manually extract it from FitnessSyncer's redirect

**"Invalid client_id"**
- Double-check the Client ID has no extra spaces
- Make sure environment variables are loaded (restart server)

**"Invalid client_secret"**
- Double-check the Client Secret has no extra spaces
- Make sure it's set correctly in environment

## Next Steps

Once connected:
- Data will sync automatically if you set up cron jobs
- Or trigger manual syncs via the web UI or CLI
- Check `/fitnesssyncer` page to see connection status

