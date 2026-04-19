import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { FitnessSyncerCommand } from '../commands/fitnesssyncer.command';
import { GoogleDriveCommand } from '../commands/google-drive.command';
import { IngestCommand } from '../commands/ingest.command';

export class SchedulerService {
  private corpusRoot: string;
  private fitnessSyncerCommand: FitnessSyncerCommand;
  private googleDriveCommand: GoogleDriveCommand;
  private ingestCommand: IngestCommand;

  constructor() {
    this.corpusRoot = process.env.CORPUS_ROOT || '/data/corpus';
    this.fitnessSyncerCommand = new FitnessSyncerCommand();
    this.googleDriveCommand = new GoogleDriveCommand();
    this.ingestCommand = new IngestCommand();
  }

  async runScheduledSyncs(): Promise<void> {
    console.log('Running scheduled syncs...');
    
    // Sync CSV/FIT files
    try {
      await this.ingestCommand.sync();
      console.log('File sync completed');
    } catch (error: any) {
      console.error('File sync error:', error);
    }

    // Sync Google Drive medical reports if configured
    try {
      await this.googleDriveCommand.sync();
      console.log('Google Drive sync completed');
      await this.syncMedicalIndex();
    } catch (error: any) {
      console.error('Google Drive sync error:', error);
    }

    // Sync FitnessSyncer if connected
    try {
      const tokens = await this.fitnessSyncerCommand.loadToken();
      if (tokens) {
        await this.fitnessSyncerCommand.sync(tokens.accessToken);
        console.log('FitnessSyncer sync completed');
      } else {
        console.log('FitnessSyncer not connected, skipping');
      }
    } catch (error: any) {
      console.error('FitnessSyncer sync error:', error);
    }
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

