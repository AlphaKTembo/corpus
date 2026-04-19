# How to Get FitnessSyncer OAuth2 Credentials

## Quick Answer

**For Personal Applications**: Create credentials in the FitnessSyncer Developer Console  
**For Other Use Cases**: Contact FitnessSyncer support

## Step-by-Step Guide

### Option 1: Personal Applications (Recommended for Individual Use)

1. **Access Developer Console**
   - Visit: https://www.fitnesssyncer.com
   - Look for "Developer" or "Developer Console" section
   - Or navigate directly to the developer portal (check their website)

2. **Create Personal Application**
   - Click "Create Application" or similar
   - Fill in application details:
     - **Application Name**: "Corpus" (or your preferred name)
     - **Application Type**: "Personal Application"
     - **Description**: "Self-hosted personal health data platform"

3. **Get Your Credentials**
   After creation, you'll receive:
   - **Client ID**: Public identifier for your application
   - **Client Secret**: Secret key (keep this secure!)
   - **Redirect URL**: Note the redirect URL format (see below)

4. **Important Notes for Personal Applications**
   - Personal applications have a **hard-coded Redirect URL**
   - When the OAuth flow redirects to that URL, you can edit it in the browser to redirect to your actual callback URL
   - You only need to do this once

### Option 2: Contact FitnessSyncer (For Business/Enterprise)

If you need a custom application or have specific requirements:

1. **Contact FitnessSyncer**
   - Email: Check their website for developer contact
   - Support Form: Use their contact form
   - Mention: You want API access for a self-hosted application

2. **Provide Information**
   - Application name and purpose
   - Redirect URI: `http://localhost:3000/api/v1/fitnesssyncer/callback` (dev) or your production URL
   - Use case: Personal health data aggregation

3. **Receive Credentials**
   - Client ID
   - Client Secret
   - Custom Redirect URL (if applicable)

## OAuth2 Configuration Details

### Authorization URL
```
https://www.fitnesssyncer.com/api/oauth/authorize
```

### Required Parameters
- `response_type`: `"code"`
- `client_id`: Your Client ID
- `redirect_uri`: Your Redirect URL (must match exactly)
- `scope`: `"Sources"` (or `"sources"`)
- `state`: Any state value (optional, returned on redirect)

### Token Exchange URL
```
https://api.fitnesssyncer.com/api/oauth/access_token
```

### Redirect URL Requirements
- **Must be SSL-based** (HTTPS) for production
- **Case sensitive** - must match exactly what's registered
- **Development example**: `http://localhost:3000/api/v1/fitnesssyncer/callback`
- **Production example**: `https://your-domain.com/api/v1/fitnesssyncer/callback`

## Configure Your Environment

Once you have credentials, add to your `.env` file:

```bash
# FitnessSyncer OAuth2 Credentials
FITNESSSYNCER_CLIENT_ID=your_client_id_here
FITNESSSYNCER_CLIENT_SECRET=your_client_secret_here

# Redirect URI (must match what you registered)
# For local development:
FITNESSSYNCER_REDIRECT_URI=http://localhost:3000/api/v1/fitnesssyncer/callback

# For production (must be HTTPS):
# FITNESSSYNCER_REDIRECT_URI=https://your-domain.com/api/v1/fitnesssyncer/callback
```

## API Endpoints Reference

Based on the FitnessSyncer API documentation:

- **Base URL**: `https://api.fitnesssyncer.com/api`
- **Authorization**: `https://www.fitnesssyncer.com/api/oauth/authorize`
- **Token Exchange**: `https://api.fitnesssyncer.com/api/oauth/access_token`
- **Token Refresh**: `https://api.fitnesssyncer.com/api/oauth/access_token` (with `grant_type=refresh_token`)
- **Token Revoke**: `https://api.fitnesssyncer.com/api/oauth/revoke_token`

## Testing Without Credentials

If you don't have credentials yet, you can:

1. **Use CSV File Import**: Place CSV files in `/data/drive_sync/TrainingPeaks/`
2. **Test Other Features**: Dashboard, activities, metrics all work independently
3. **Skip FitnessSyncer**: The system is fully functional without it

The FitnessSyncer integration is **optional** - your system works perfectly with just CSV file imports.

## Next Steps After Getting Credentials

1. ✅ Add credentials to `.env` file
2. ✅ Restart API server: `docker compose restart api` or restart dev server
3. ✅ Navigate to `/fitnesssyncer` in web dashboard
4. ✅ Click "Connect FitnessSyncer Account"
5. ✅ Authorize on FitnessSyncer's website
6. ✅ Start syncing data!

## Troubleshooting

**"FitnessSyncer credentials not configured"**
- Make sure environment variables are set
- Restart the API server after adding variables
- Check variable names match exactly (case-sensitive)

**"Invalid redirect_uri"**
- The redirect URI must **exactly match** what you registered
- Check for trailing slashes, http vs https, port numbers
- For personal apps, you may need to manually edit the redirect URL in browser

**"Invalid client_id"**
- Verify the Client ID is correct (no extra spaces)
- Make sure your application is approved/active

**"403 Forbidden" when refreshing token**
- User may have revoked permissions
- Need to re-authenticate from the beginning

## API Scope

The scope parameter should be set to `"Sources"` (capitalized) according to the documentation. This grants access to:
- Activities
- Sleep
- Weight
- Blood Pressure
- Cholesterol
- Glucose
- Nutrition
- Oxygen
- Temperature
- And other health data types

## References

- **FitnessSyncer API Documentation**: Provided in your query
- **Developer Console**: Check FitnessSyncer website for access
- **OAuth2 Specification**: https://oauth.net/2/
- **Support**: Contact FitnessSyncer for developer support
