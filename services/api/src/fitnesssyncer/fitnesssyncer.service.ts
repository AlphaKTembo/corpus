import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DuckdbService } from '../duckdb/duckdb.service';
import * as fs from 'fs';
import * as path from 'path';
import * as querystring from 'querystring';
import * as https from 'https';

@Injectable()
export class FitnessSyncerService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private baseUrl = 'https://api.fitnesssyncer.com/api';
  private corpusRoot: string;

  constructor(
    private configService: ConfigService,
    private duckdbService: DuckdbService,
  ) {
    // Read from environment variables - Docker Compose sets these from .env file
    // ConfigService reads from process.env by default, which Docker Compose sets
    // Use process.env directly as fallback to ensure we get the values
    const envClientId = process.env.FITNESSSYNCER_CLIENT_ID;
    const envClientSecret = process.env.FITNESSSYNCER_CLIENT_SECRET;
    const configClientId = this.configService.get<string>('FITNESSSYNCER_CLIENT_ID');
    const configClientSecret = this.configService.get<string>('FITNESSSYNCER_CLIENT_SECRET');
    
    // Prefer process.env (direct) over ConfigService to ensure we get Docker Compose values
    this.clientId = envClientId || configClientId || '';
    this.clientSecret = envClientSecret || configClientSecret || '';
    
    // Validate credentials are set
    if (!this.clientId || !this.clientSecret) {
      const errorMsg = 'FitnessSyncer credentials not configured. Please set FITNESSSYNCER_CLIENT_ID and FITNESSSYNCER_CLIENT_SECRET environment variables in the .env file located in the infra directory.';
      console.error('[FitnessSyncer]', errorMsg);
      console.error('[FitnessSyncer] Debug info:', {
        processEnvClientId: envClientId ? `SET (${envClientId.substring(0, 10)}...)` : 'NOT SET',
        processEnvClientSecret: envClientSecret ? 'SET' : 'NOT SET',
        configServiceClientId: configClientId ? `SET (${configClientId.substring(0, 10)}...)` : 'NOT SET',
        configServiceClientSecret: configClientSecret ? 'SET' : 'NOT SET',
        envFileLocation: 'infra/.env',
      });
    } else {
      console.log('[FitnessSyncer] Credentials loaded successfully');
    }
    // IMPORTANT: For personal applications, FitnessSyncer uses a hard-coded redirect URL
    // We MUST use https://personal.fitnesssyncer.com/ - we cannot change this
    // After authorization, FitnessSyncer will redirect to their URL with the code
    // The user needs to copy the code from that URL and navigate to /fitnesssyncer/callback?code=XXX
    this.redirectUri = this.configService.get<string>(
      'FITNESSSYNCER_REDIRECT_URI', 
      'https://personal.fitnesssyncer.com/' // FitnessSyncer's hard-coded URL for personal apps
    );
    // Use relative path from project root, or absolute if specified
    const defaultRoot = path.join(process.cwd(), 'data', 'corpus');
    this.corpusRoot = this.configService.get<string>('CORPUS_ROOT', defaultRoot);
  }

  getAuthorizationUrl(): string {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('FitnessSyncer credentials not configured. Please set FITNESSSYNCER_CLIENT_ID and FITNESSSYNCER_CLIENT_SECRET environment variables.');
    }
    const params = {
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'Sources', // FitnessSyncer uses "Sources" (capitalized) as the scope
      state: 'default',
    };
    return `https://www.fitnesssyncer.com/api/oauth/authorize?${querystring.stringify(params)}`;
  }

  async exchangeCodeForToken(code: string): Promise<{ access_token: string; refresh_token: string }> {
    // Clean the code - remove any whitespace or URL encoding issues
    const cleanCode = code.trim();
    
    console.log(`[FitnessSyncer] Exchanging code (length: ${cleanCode.length}), redirect_uri: ${this.redirectUri}`);
    
    const data = querystring.stringify({
      grant_type: 'authorization_code',
      code: cleanCode,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    console.log(`[FitnessSyncer] Request data: grant_type=authorization_code&code=${cleanCode.substring(0, 20)}...&redirect_uri=${this.redirectUri}&client_id=${this.clientId.substring(0, 10)}...`);

    return this.makeRequest<{ access_token: string; refresh_token: string }>('/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data, 'utf8').toString(),
      },
      data,
    });
  }

  async saveToken(accessToken: string, refreshToken: string, userId = 'default'): Promise<void> {
    try {
      const userRoot = path.join(this.corpusRoot, userId);
      const metadataPath = path.join(userRoot, 'metadata');
      if (!fs.existsSync(metadataPath)) {
        fs.mkdirSync(metadataPath, { recursive: true });
      }
      
      const tokenPath = path.join(metadataPath, 'fitnesssyncer_tokens.json');
      fs.writeFileSync(tokenPath, JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        updated_at: new Date().toISOString(),
      }, null, 2));
      
      console.log(`[FitnessSyncer] Tokens saved to: ${tokenPath}`);
    } catch (error: any) {
      console.error(`[FitnessSyncer] Error saving tokens:`, error);
      throw new Error(`Failed to save tokens: ${error.message}`);
    }
  }

  async loadToken(userId = 'default'): Promise<{ accessToken: string; refreshToken: string } | null> {
    const tokenPath = path.join(this.corpusRoot, userId, 'metadata', 'fitnesssyncer_tokens.json');
    
    if (!fs.existsSync(tokenPath)) {
      return null;
    }

    const data = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string }> {
    console.log('[FitnessSyncer] Refreshing access token...');
    
    const data = querystring.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const result = await this.makeRequest<{ access_token: string; refresh_token: string }>('/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data, 'utf8').toString(),
      },
      data,
    });

    // Save the new tokens
    await this.saveToken(result.access_token, result.refresh_token || refreshToken);
    console.log('[FitnessSyncer] Token refreshed successfully');
    return result;
  }

  private makeRequest<T>(path: string, options: {
    method: string;
    headers: Record<string, string>;
    data?: string;
  }): Promise<T> {
    return new Promise((resolve, reject) => {
      // Construct full URL - ensure path is properly joined with baseUrl
      const fullPath = path.startsWith('/') ? `${this.baseUrl}${path}` : `${this.baseUrl}/${path}`;
      const url = new URL(fullPath);
      
      const requestOptions: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: options.method,
        headers: options.headers,
        // Allow self-signed certificates in development (FitnessSyncer may have SSL issues)
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      };
      
      console.log(`[FitnessSyncer] Making ${options.method} request to: https://${requestOptions.hostname}${requestOptions.path}`);

      const req = https.request(requestOptions, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            console.log(`[FitnessSyncer] Response status: ${res.statusCode}, body: ${responseData.substring(0, 200)}`);
            
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(responseData) as T);
            } else {
              // Try to parse error response from FitnessSyncer
              let errorMessage = `HTTP ${res.statusCode}`;
              try {
                const errorData = JSON.parse(responseData);
                errorMessage = errorData.error_description || errorData.error || errorMessage;
                console.error(`[FitnessSyncer] API Error:`, errorData);
              } catch {
                errorMessage = responseData || errorMessage;
              }
              
              const error = new Error(errorMessage);
              (error as any).statusCode = res.statusCode;
              (error as any).response = { data: responseData };
              reject(error);
            }
          } catch (error) {
            console.error(`[FitnessSyncer] Parse error:`, error);
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (options.data) {
        req.write(options.data);
      }

      req.end();
    });
  }

  // Fetch data from FitnessSyncer API with automatic token refresh on 401
  private async fetchFromFitnessSyncer<T>(endpoint: string, accessToken: string, retryOnExpired: boolean = true): Promise<T> {
    console.log(`[FitnessSyncer] Fetching from endpoint: ${endpoint}`);
    try {
      const result = await this.makeRequest<T>(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      console.log(`[FitnessSyncer] Response from ${endpoint}:`, JSON.stringify(result).substring(0, 500));
      return result;
    } catch (error: any) {
      // If token expired and we haven't retried yet, refresh and retry
      if (retryOnExpired && (error.message?.includes('Expired') || error.message?.includes('401') || error.message?.includes('Unauthorized'))) {
        console.log('[FitnessSyncer] Token expired, refreshing...');
        const tokens = await this.loadToken();
        if (tokens) {
          const newTokens = await this.refreshAccessToken(tokens.refreshToken);
          // Retry with new token
          return this.fetchFromFitnessSyncer<T>(endpoint, newTokens.access_token, false);
        }
      }
      throw error;
    }
  }

  async syncData(accessToken: string, userId = 'default'): Promise<{ activities: number; vitals: number; sleep: number; bodyMetrics: number }> {
    console.log('[FitnessSyncer] Starting data sync...');

    let activitiesCount = 0;
    let vitalsCount = 0;
    let sleepCount = 0;
    let bodyMetricsCount = 0;

    // Use a variable to track the current token (may be refreshed during sync)
    let currentToken = accessToken;

    try {
      // Get sources - use the same endpoint structure as worker
      // fetchFromFitnessSyncer will automatically refresh token if expired
      const sourcesResponse = await this.fetchFromFitnessSyncer<{ items: any[] }>('/providers/sources/', currentToken);
      
      // Reload token in case it was refreshed during the call above
      const tokens = await this.loadToken(userId);
      if (tokens) {
        currentToken = tokens.accessToken;
      }
      
      const sourceItems = sourcesResponse.items || [];
      console.log(`[FitnessSyncer] Found ${sourceItems.length} sources:`, sourceItems.map((s: any) => ({ id: s.id, type: s.type, enabled: s.enabled })));

      // Activities, sleep, and body metrics now sync from intervals.icu.
      // FitnessSyncer is used only for blood pressure vitals.
      // Garmin may be used as fallback for specific data points not in intervals.icu.
      // Fetch vitals
      const vitalsSources = sourceItems.filter((s: any) => s.type === 'BloodPressure' && s.enabled);
      console.log(`[FitnessSyncer] Found ${vitalsSources.length} vitals sources`);
      const allVitals: any[] = [];
      for (const source of vitalsSources) {
        console.log(`[FitnessSyncer] Fetching items from vitals source: ${source.id} (type: ${source.type})`);
        const itemsResponse = await this.fetchFromFitnessSyncer<{ items: any[] }>(`/providers/sources/${source.id}/items/?offset=0&limit=100`, currentToken);
        
        // Reload token in case it was refreshed
        const refreshedTokens = await this.loadToken(userId);
        if (refreshedTokens) {
          currentToken = refreshedTokens.accessToken;
        }
        const items = itemsResponse.items || [];
        console.log(`[FitnessSyncer] Got ${items.length} items from vitals source ${source.id}`);
        allVitals.push(...items);
      }
      console.log(`[FitnessSyncer] Total vitals fetched: ${allVitals.length}`);
      
      if (allVitals.length > 0) {
        console.log(`[FitnessSyncer] Sample RAW vital:`, JSON.stringify(allVitals[0]));
        const canonicalVitals = allVitals.map((v: any) => {
          // Handle date - can be timestamp (number) or ISO string
          let dateStr: string;
          if (typeof v.date === 'number') {
            dateStr = new Date(v.date).toISOString().split('T')[0];
          } else if (typeof v.date === 'string') {
            dateStr = v.date.split('T')[0];
          } else {
            dateStr = new Date().toISOString().split('T')[0];
          }
          
          return {
            date: dateStr,
            systolic_bp: v.systolic,
            diastolic_bp: v.diastolic,
            source: 'fitnesssyncer',
          };
        });
        console.log(`[FitnessSyncer] Sample MAPPED vital:`, JSON.stringify(canonicalVitals[0]));
        
        // Count how many have blood pressure data
        const withBP = canonicalVitals.filter(v => v.systolic_bp || v.diastolic_bp).length;
        console.log(`[FitnessSyncer] Vitals with blood pressure: ${withBP}/${canonicalVitals.length}`);
        
        // Save to CSV file
        await this.saveToCSV('vitals_bp', canonicalVitals, userId);
        vitalsCount = canonicalVitals.length;
      }

      console.log(`[FitnessSyncer] Sync completed: ${vitalsCount} blood pressure records`);
      
      return { activities: activitiesCount, vitals: vitalsCount, sleep: sleepCount, bodyMetrics: bodyMetricsCount };
    } catch (error: any) {
      console.error('[FitnessSyncer] Error syncing data:', error);
      throw error;
    }
  }

  // Save data to CSV file (append mode with deduplication)
  private async saveToCSV(tableName: string, newData: any[], userId = 'default'): Promise<void> {
    if (newData.length === 0) return;

    const canonicalDir = path.join(this.corpusRoot, userId, 'canonical');
    if (!fs.existsSync(canonicalDir)) {
      fs.mkdirSync(canonicalDir, { recursive: true });
    }

    const csvPath = path.join(canonicalDir, `${tableName}.csv`);
    console.log(`[FitnessSyncer] Saving to CSV: ${csvPath}`);
    
    // Read existing data if file exists
    let existingData: any[] = [];
    let existingHeaders: string[] = [];
    
    if (fs.existsSync(csvPath)) {
      try {
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const lines = csvContent.trim().split('\n');
        if (lines.length > 0) {
          existingHeaders = lines[0].split(',');
          for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            const row: any = {};
            existingHeaders.forEach((header, idx) => {
              row[header.trim()] = values[idx]?.trim() || '';
            });
            existingData.push(row);
          }
        }
      } catch (error) {
        console.warn(`[FitnessSyncer] Error reading existing CSV ${csvPath}:`, error);
      }
    }

    // Determine unique key for deduplication
    const uniqueKey = this.getUniqueKey(tableName);
    
    // Merge and deduplicate
    const merged = [...existingData, ...newData];
    const deduplicated = uniqueKey
      ? Array.from(new Map(merged.map((item) => [item[uniqueKey], item])).values())
      : merged;

    // Get ALL unique headers from all rows (both old and new data)
    const headersSet = new Set<string>();
    [...existingData, ...newData].forEach(row => {
      Object.keys(row).forEach(key => headersSet.add(key));
    });
    const headers = Array.from(headersSet);
    
    // Convert to CSV
    const csvRows = deduplicated.map((row) => {
      return headers.map((header) => {
        const value = row[header];
        // Escape commas and quotes in CSV
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
    });

    // Write CSV file
    const csvContent = [
      headers.join(','),
      ...csvRows.map((row) => row.join(','))
    ].join('\n');

    fs.writeFileSync(csvPath, csvContent, 'utf-8');
    console.log(`[FitnessSyncer] Saved ${deduplicated.length} rows to ${csvPath} (${newData.length} new)`);
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  private getUniqueKey(tableName: string): string | null {
    const keys: Record<string, string> = {
      activities: 'activity_id',
      vitals_daily: 'date',
      vitals_bp: 'date',
      sleep_daily: 'date',
      body_metrics: 'date',
    };
    return keys[tableName] || null;
  }

  /**
   * Estimate TSS based on sport type and duration
   * These are conservative estimates assuming moderate intensity without heart rate/power data
   * TSS = (hours × intensity_factor²) × 100
   * For moderate intensity (IF ~0.7): TSS ≈ hours × 50
   */
  private estimateTSS(sport: string, durationS: number): number {
    const durationHours = durationS / 3600;
    const sportLower = sport.toLowerCase();
    
    // TSS per hour estimates for moderate intensity
    let tssPerHour = 50; // Default
    
    if (sportLower.includes('run')) {
      tssPerHour = 55; // Running is typically higher intensity
    } else if (sportLower.includes('bike') || sportLower.includes('cycle')) {
      tssPerHour = 60; // Cycling
    } else if (sportLower.includes('swim')) {
      tssPerHour = 65; // Swimming is intense
    } else if (sportLower.includes('walk') || sportLower.includes('hike')) {
      tssPerHour = 30; // Walking is lower intensity
    } else if (sportLower.includes('strength') || sportLower.includes('gym')) {
      tssPerHour = 40; // Strength training
    }
    
    const estimatedTSS = Math.round(durationHours * tssPerHour);
    return estimatedTSS;
  }
}
