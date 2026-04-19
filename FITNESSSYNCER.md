# FitnessSyncer Integration Guide

FitnessSyncer provides an API to access aggregated health and fitness data from over 50 sources. This guide explains how to integrate FitnessSyncer into the Corpus system.

## Overview

FitnessSyncer uses OAuth2 for authentication and provides endpoints to:
- Access activities, sleep, nutrition, and other health data
- Manage data sources and destinations
- Synchronize data from multiple platforms

## Integration Steps

### 1. Register Application

1. Contact FitnessSyncer to register your application
2. Obtain OAuth2 credentials:
   - Client ID
   - Client Secret
   - Redirect URL

### 2. Implement OAuth2 Flow

Add OAuth2 authentication to the worker service:

**File**: `services/worker/src/services/fitnesssyncer.service.ts`

```typescript
import axios from 'axios';

export class FitnessSyncerService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private baseUrl = 'https://api.fitnesssyncer.com';

  async getAccessToken(authorizationCode: string): Promise<string> {
    const response = await axios.post(`${this.baseUrl}/oauth/token`, {
      grant_type: 'authorization_code',
      code: authorizationCode,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
    });
    return response.data.access_token;
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    const response = await axios.post(`${this.baseUrl}/oauth/token`, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    return response.data.access_token;
  }

  async getActivities(accessToken: string, from?: Date, to?: Date) {
    const params: any = {};
    if (from) params.from = from.toISOString();
    if (to) params.to = to.toISOString();

    const response = await axios.get(`${this.baseUrl}/v1/activities`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params,
    });
    return response.data;
  }

  async getSleep(accessToken: string, from?: Date, to?: Date) {
    const params: any = {};
    if (from) params.from = from.toISOString();
    if (to) params.to = to.toISOString();

    const response = await axios.get(`${this.baseUrl}/v1/sleep`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params,
    });
    return response.data;
  }

  // Add other endpoints as needed
}
```

### 3. Add to Worker Ingestion

Modify `services/worker/src/services/ingest.service.ts` to include FitnessSyncer:

```typescript
import { FitnessSyncerService } from './fitnesssyncer.service';

export class IngestService {
  private fitnessSyncer: FitnessSyncerService;

  async syncFromFitnessSyncer() {
    const accessToken = await this.getFitnessSyncerToken();
    
    // Fetch activities
    const activities = await this.fitnessSyncer.getActivities(accessToken);
    
    // Map to canonical schema
    const canonicalActivities = activities.map(this.mapToCanonical);
    
    // Write to Parquet (via DuckDB)
    await this.writeToParquet('activities', canonicalActivities);
    
    // Fetch sleep, vitals, etc.
    // ...
  }

  private mapToCanonical(fsActivity: any) {
    // Map FitnessSyncer activity to Corpus canonical schema
    return {
      activity_id: fsActivity.id,
      start_time_utc: fsActivity.start_time,
      sport: fsActivity.type,
      duration_s: fsActivity.duration,
      // ... map other fields
      source: 'fitnesssyncer',
    };
  }
}
```

### 4. Add API Endpoint for Authorization

Add an endpoint in the API to initiate OAuth2 flow:

**File**: `services/api/src/fitnesssyncer/fitnesssyncer.controller.ts`

```typescript
@Controller('fitnesssyncer')
@UseGuards(JwtAuthGuard)
export class FitnessSyncerController {
  @Get('authorize')
  authorize() {
    const authUrl = `https://www.fitnesssyncer.com/oauth/authorize?` +
      `client_id=${process.env.FITNESSSYNCER_CLIENT_ID}&` +
      `redirect_uri=${process.env.FITNESSSYNCER_REDIRECT_URI}&` +
      `response_type=code&scope=read`;
    
    return { authUrl };
  }

  @Post('callback')
  async callback(@Body() dto: { code: string }) {
    // Exchange code for token
    // Store token securely
    // Trigger initial sync
  }
}
```

### 5. Environment Variables

Add to `.env`:

```bash
FITNESSSYNCER_CLIENT_ID=your_client_id
FITNESSSYNCER_CLIENT_SECRET=your_client_secret
FITNESSSYNCER_REDIRECT_URI=http://your-domain/api/v1/fitnesssyncer/callback
```

### 6. Scheduled Sync

Add FitnessSyncer sync to worker cron job:

```bash
# Sync from FitnessSyncer daily at 6 AM
0 6 * * * cd /path/to/corpus/infra && docker compose run --rm worker fitnesssyncer --sync
```

## Data Mapping

FitnessSyncer data should be mapped to Corpus canonical schema:

- **Activities**: Map to `activities.parquet`
- **Sleep**: Map to `sleep_daily.parquet`
- **Vitals**: Map to `vitals_daily.parquet`
- **Body Metrics**: Map to `body_metrics.parquet`

See `services/worker/src/config/mapping_rules.example.yml` for mapping patterns.

## Security Considerations

1. Store OAuth2 tokens securely (encrypted at rest)
2. Implement token refresh logic
3. Handle token expiration gracefully
4. Rate limit API calls to FitnessSyncer
5. Log all sync operations for debugging

## References

- FitnessSyncer API Documentation: https://www.fitnesssyncer.com/api/documentation.html
- OAuth2 Specification: https://oauth.net/2/

