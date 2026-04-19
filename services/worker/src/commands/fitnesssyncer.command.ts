import * as fs from 'fs';
import * as path from 'path';
import { IngestService } from '../services/ingest.service';
import { FitnessSyncerService } from '../services/fitnesssyncer.service';

export class FitnessSyncerCommand {
  private ingestService: IngestService;
  private fitnessSyncer: FitnessSyncerService;

  constructor() {
    this.ingestService = new IngestService();
    this.fitnessSyncer = new FitnessSyncerService();
  }

  async sync(accessToken: string): Promise<void> {
    console.log('Starting FitnessSyncer sync...');
    
    await this.ingestService.initialize();
    try {
      await this.ingestService.syncFromFitnessSyncer(accessToken);
      await this.ingestService.recomputeDerived(process.env.CORPUS_ROOT || '/data/corpus');
      console.log('FitnessSyncer sync completed');
    } finally {
      await this.ingestService.close();
    }
  }

  getAuthUrl(): string {
    return this.fitnessSyncer.getAuthorizationUrl();
  }

  async exchangeCode(code: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokens = await this.fitnessSyncer.exchangeCodeForToken(code);
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    };
  }

  async refreshToken(refreshToken: string): Promise<string> {
    const tokens = await this.fitnessSyncer.refreshToken(refreshToken);
    return tokens.access_token;
  }

  async saveToken(accessToken: string, refreshToken: string): Promise<void> {
    const corpusRoot = process.env.CORPUS_ROOT || '/data/corpus';
    const metadataPath = path.join(corpusRoot, 'metadata');
    fs.mkdirSync(metadataPath, { recursive: true });
    
    const tokenPath = path.join(metadataPath, 'fitnesssyncer_tokens.json');
    fs.writeFileSync(tokenPath, JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
      updated_at: new Date().toISOString(),
    }, null, 2));
  }

  async loadToken(): Promise<{ accessToken: string; refreshToken: string } | null> {
    const corpusRoot = process.env.CORPUS_ROOT || '/data/corpus';
    const tokenPath = path.join(corpusRoot, 'metadata', 'fitnesssyncer_tokens.json');
    
    if (!fs.existsSync(tokenPath)) {
      return null;
    }

    const data = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };
  }
}

