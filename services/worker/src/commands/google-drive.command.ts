import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { google } from 'googleapis';
import { GoogleDriveService } from '../services/google-drive.service';

export class GoogleDriveCommand {
  private googleDriveService: GoogleDriveService;
  private corpusRoot: string;

  constructor() {
    this.googleDriveService = new GoogleDriveService();
    this.corpusRoot = process.env.CORPUS_ROOT || '/data/corpus';
  }

  async sync(): Promise<void> {
    if (!process.env.GOOGLE_DRIVE_MEDICAL_FOLDER_ID) {
      console.log('Google Drive folder not configured, skipping');
      return;
    }

    const hasServiceAccount = !!process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON;
    const hasOAuthEnv =
      !!process.env.GOOGLE_DRIVE_CLIENT_ID &&
      !!process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
      !!process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
    const hasStoredToken = !!(await this.loadToken());

    if (!hasServiceAccount && !hasOAuthEnv && !hasStoredToken) {
      console.log('Google Drive credentials not configured, skipping');
      return;
    }

    console.log('Starting Google Drive medical sync...');
    const result = await this.googleDriveService.syncMedicalReports();
    console.log(
      `Google Drive sync completed: ${result.totalFiles} files, ` +
        `${result.downloadedFiles} downloaded, ${result.skippedFiles} skipped`,
    );
    await this.syncMedicalIndex();
  }

  getAuthUrl(): string {
    const { clientId, clientSecret, redirectUri } = this.loadOAuthConfig();
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/drive.readonly'],
    });
  }

  async exchangeCode(code: string): Promise<{ accessToken: string; refreshToken?: string }> {
    const { clientId, clientSecret, redirectUri } = this.loadOAuthConfig();
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);

    return {
      accessToken: tokens.access_token || '',
      refreshToken: tokens.refresh_token || undefined,
    };
  }

  async saveToken(accessToken: string, refreshToken?: string): Promise<void> {
    const metadataPath = path.join(this.corpusRoot, 'metadata');
    fs.mkdirSync(metadataPath, { recursive: true });

    const tokenPath = path.join(metadataPath, 'google_drive_tokens.json');
    fs.writeFileSync(
      tokenPath,
      JSON.stringify(
        {
          access_token: accessToken,
          refresh_token: refreshToken,
          updated_at: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }

  async loadToken(): Promise<{ accessToken: string; refreshToken?: string } | null> {
    const tokenPath = path.join(this.corpusRoot, 'metadata', 'google_drive_tokens.json');
    if (!fs.existsSync(tokenPath)) {
      return null;
    }

    const data = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };
  }

  private loadOAuthConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI || 'http://localhost';

    if (!clientId || !clientSecret) {
      throw new Error('GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET are required');
    }

    return { clientId, clientSecret, redirectUri };
  }

  private async syncMedicalIndex(): Promise<void> {
    const baseUrl = process.env.MEDICALS_API_BASE_URL;
    if (!baseUrl) {
      console.log('Medicals API base URL not configured, skipping');
      return;
    }

    try {
      await axios.post(`${baseUrl.replace(/\/$/, '')}/medicals/sync/local`, {});
      console.log('Medical documents indexed');
    } catch (error: any) {
      console.error('Medical index sync error:', error?.message || error);
    }
  }
}
