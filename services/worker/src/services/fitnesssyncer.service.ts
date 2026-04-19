/// <reference types="node" />
import * as https from 'https';
import * as http from 'http';
import * as querystring from 'querystring';

export interface FitnessSyncerToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface FitnessSyncerActivity {
  id: string;
  date: string;
  type: string;
  duration?: number;
  distance?: number;
  calories?: number;
  [key: string]: any;
}

export class FitnessSyncerService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private baseUrl = 'https://api.fitnesssyncer.com/api';

  constructor() {
    this.clientId = process.env.FITNESSSYNCER_CLIENT_ID || '';
    this.clientSecret = process.env.FITNESSSYNCER_CLIENT_SECRET || '';
    this.redirectUri = process.env.FITNESSSYNCER_REDIRECT_URI || 'http://localhost:3000/auth/callback';
  }

  getAuthorizationUrl(state?: string): string {
    const params = {
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'Sources', // FitnessSyncer uses "Sources" (capitalized) as the scope
      state: state || 'default',
    };
    return `https://www.fitnesssyncer.com/api/oauth/authorize?${querystring.stringify(params)}`;
  }

  async exchangeCodeForToken(code: string): Promise<FitnessSyncerToken> {
    const data = querystring.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    return this.makeRequest<FitnessSyncerToken>('/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': data.length.toString(),
      },
      data,
    });
  }

  async refreshToken(refreshToken: string): Promise<FitnessSyncerToken> {
    const data = querystring.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri, // Required for refresh according to docs
    });

    return this.makeRequest<FitnessSyncerToken>('/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': data.length.toString(),
      },
      data,
    });
  }

  // List all data sources
  async getSources(accessToken: string): Promise<any[]> {
    const response = await this.makeRequest<{ items: any[] }>('/providers/sources/', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.items || [];
  }

  // Get items from a specific source
  async getSourceItems(accessToken: string, sourceId: string, offset: number = 0, limit: number = 100): Promise<any[]> {
    const params: any = { offset, limit };
    const query = `?${querystring.stringify(params)}`;
    const response = await this.makeRequest<{ items: any[] }>(`/providers/sources/${sourceId}/items/${query}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.items || [];
  }

  // Convenience methods that fetch from all Activity sources
  async getActivities(accessToken: string, from?: string, to?: string): Promise<FitnessSyncerActivity[]> {
    const sources = await this.getSources(accessToken);
    const activitySources = sources.filter((s: any) => s.type === 'Activity' && s.enabled);
    
    const allActivities: FitnessSyncerActivity[] = [];
    for (const source of activitySources) {
      const items = await this.getSourceItems(accessToken, source.id);
      allActivities.push(...items.map((item: any) => ({
        id: item.itemId || item.id,
        date: new Date(item.date).toISOString(),
        type: item.activity || item.fitnessSyncerActivity || 'Unknown',
        duration: item.duration,
        distance: item.distanceKM,
        calories: item.calories,
        ...item,
      })));
    }
    return allActivities;
  }

  // Get vitals (Weight, Blood Pressure, etc.) from sources
  async getVitals(accessToken: string, from?: string, to?: string): Promise<any[]> {
    const sources = await this.getSources(accessToken);
    const vitalsSources = sources.filter((s: any) => 
      ['Weight', 'BloodPressure', 'Cholesterol', 'Glucose', 'Temperature'].includes(s.type) && s.enabled
    );
    
    const allVitals: any[] = [];
    for (const source of vitalsSources) {
      const items = await this.getSourceItems(accessToken, source.id);
      allVitals.push(...items.map((item: any) => ({
        ...item,
        sourceType: source.type,
      })));
    }
    return allVitals;
  }

  // Get sleep data from Sleep sources
  async getSleep(accessToken: string, from?: string, to?: string): Promise<any[]> {
    const sources = await this.getSources(accessToken);
    const sleepSources = sources.filter((s: any) => s.type === 'Sleep' && s.enabled);
    
    const allSleep: any[] = [];
    for (const source of sleepSources) {
      const items = await this.getSourceItems(accessToken, source.id);
      allSleep.push(...items.map((item: any) => ({
        ...item,
        date: new Date(item.date).toISOString().split('T')[0],
        total_minutes: item.sleepingMinutes,
        rem_minutes: item.remSleepMinutes,
        deep_minutes: item.deepSleepMinutes,
        wake_minutes: item.awakeMinutes,
        efficiency: item.efficiency,
      })));
    }
    return allSleep;
  }

  // Get body metrics (Weight) from Weight sources
  async getBodyMetrics(accessToken: string, from?: string, to?: string): Promise<any[]> {
    const sources = await this.getSources(accessToken);
    const weightSources = sources.filter((s: any) => s.type === 'Weight' && s.enabled);
    
    const allMetrics: any[] = [];
    for (const source of weightSources) {
      const items = await this.getSourceItems(accessToken, source.id);
      allMetrics.push(...items.map((item: any) => ({
        date: new Date(item.date).toISOString().split('T')[0],
        weight: item.weight,
        body_fat: item.fatRatio ? item.fatRatio * 100 : undefined,
        ...item,
      })));
    }
    return allMetrics;
  }

  private makeRequest<T>(path: string, options: {
    method: string;
    headers: Record<string, string>;
    data?: string;
  }): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const requestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: options.method,
        headers: options.headers,
      };

      const req = https.request(requestOptions, (res: http.IncomingMessage) => {
        let data = '';

        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });

        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(data) as T);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error: Error) => {
        reject(error);
      });

      if (options.data) {
        req.write(options.data);
      }

      req.end();
    });
  }
}

