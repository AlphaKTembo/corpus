import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { IngestService } from '../services/ingest.service';
import { ManifestService } from '../services/manifest.service';
import { StatusService } from '../services/status.service';

export class IngestCommand {
  private ingestService: IngestService;
  private manifestService: ManifestService;
  private statusService: StatusService;

  constructor() {
    this.ingestService = new IngestService();
    this.manifestService = new ManifestService();
    this.statusService = new StatusService();
  }

  async sync(): Promise<void> {
    console.log('Starting ingestion sync...');
    
    // Ensure directories exist
    const { InitService } = await import('../services/init.service');
    const initService = new InitService();
    await initService.ensureDirectories();
    
    await this.statusService.setStatus({
      status: 'running',
      started_at_utc: new Date().toISOString(),
      processed_files_count: 0,
      new_files_count: 0,
      errors: [],
    });

    try {
      const manifest = await this.manifestService.loadManifest();
      const driveSyncRoot = process.env.DRIVE_SYNC_ROOT || '/data/drive_sync/TrainingPeaks';
      const corpusRoot = process.env.CORPUS_ROOT || '/data/corpus';

      // Scan for CSV files
      const csvFiles = await this.scanFiles(driveSyncRoot, '.csv');
      const fitFiles = await this.scanFiles(driveSyncRoot, '.fit');

      let newFilesCount = 0;
      let processedFilesCount = 0;
      const errors: Array<{ file: string; message: string; stack?: string }> = [];

      // Process CSV files
      for (const filePath of csvFiles) {
        try {
          const fileInfo = await this.getFileInfo(filePath);
          const existingFile = manifest.files.find((f) => f.path === filePath);

          if (!existingFile || existingFile.hash !== fileInfo.hash) {
            // Copy to raw/csv
            const relativePath = path.relative(driveSyncRoot, filePath);
            const destPath = path.join(corpusRoot, 'raw', 'csv', relativePath);
            await this.copyFile(filePath, destPath);

            // Update manifest
            manifest.files = manifest.files.filter((f) => f.path !== filePath);
            manifest.files.push({
              path: filePath,
              hash: fileInfo.hash,
              size: fileInfo.size,
              mtime: fileInfo.mtime,
              type: 'csv',
              ingested_at_utc: new Date().toISOString(),
              processed: false,
              errors: [],
            });

            newFilesCount++;
          }
        } catch (error: any) {
          errors.push({
            file: filePath,
            message: error.message,
            stack: error.stack,
          });
        }
      }

      // Process FIT files
      for (const filePath of fitFiles) {
        try {
          const fileInfo = await this.getFileInfo(filePath);
          const existingFile = manifest.files.find((f) => f.path === filePath);

          if (!existingFile || existingFile.hash !== fileInfo.hash) {
            // Copy to raw/fit
            const relativePath = path.relative(driveSyncRoot, filePath);
            const destPath = path.join(corpusRoot, 'raw', 'fit', relativePath);
            await this.copyFile(filePath, destPath);

            // Update manifest
            manifest.files = manifest.files.filter((f) => f.path !== filePath);
            manifest.files.push({
              path: filePath,
              hash: fileInfo.hash,
              size: fileInfo.size,
              mtime: fileInfo.mtime,
              type: 'fit',
              ingested_at_utc: new Date().toISOString(),
              processed: false,
              errors: [],
            });

            newFilesCount++;
          }
        } catch (error: any) {
          errors.push({
            file: filePath,
            message: error.message,
            stack: error.stack,
          });
        }
      }

      // Initialize ingest service
      await this.ingestService.initialize();

      // Process unprocessed files
      const unprocessedFiles = manifest.files.filter((f) => !f.processed);
      for (const file of unprocessedFiles) {
        try {
          await this.ingestService.processFile(file, corpusRoot);
          file.processed = true;
          processedFilesCount++;
        } catch (error: any) {
          file.errors.push({
            message: error.message,
            stack: error.stack,
          });
          errors.push({
            file: file.path,
            message: error.message,
            stack: error.stack,
          });
        }
      }

      // Recompute derived datasets
      await this.ingestService.recomputeDerived(corpusRoot);

      // Close ingest service
      await this.ingestService.close();

      // Update manifest
      manifest.last_successful_run_utc = new Date().toISOString();
      await this.manifestService.saveManifest(manifest);

      // Update status
      const currentStatus = await this.statusService.getStatus();
      await this.statusService.setStatus({
        status: 'success',
        started_at_utc: currentStatus.started_at_utc,
        finished_at_utc: new Date().toISOString(),
        processed_files_count: processedFilesCount,
        new_files_count: newFilesCount,
        errors,
      });

      console.log(`Sync completed: ${newFilesCount} new files, ${processedFilesCount} processed`);
    } catch (error: any) {
      const currentStatus = await this.statusService.getStatus();
      await this.statusService.setStatus({
        status: 'failed',
        started_at_utc: currentStatus.started_at_utc,
        finished_at_utc: new Date().toISOString(),
        errors: [{ file: 'system', message: error.message, stack: error.stack }],
      });
      throw error;
    }
  }

  async rebuild(): Promise<void> {
    console.log('Starting full rebuild...');
    
    const corpusRoot = process.env.CORPUS_ROOT || '/data/corpus';
    
    // Delete canonical and derived directories
    const canonicalPath = path.join(corpusRoot, 'canonical');
    const derivedPath = path.join(corpusRoot, 'derived');
    
    if (fs.existsSync(canonicalPath)) {
      fs.rmSync(canonicalPath, { recursive: true, force: true });
    }
    if (fs.existsSync(derivedPath)) {
      fs.rmSync(derivedPath, { recursive: true, force: true });
    }
    
    // Recreate directories
    fs.mkdirSync(canonicalPath, { recursive: true });
    fs.mkdirSync(derivedPath, { recursive: true });
    
    // Process all files from raw
    const manifest = await this.manifestService.loadManifest();
    const rawFiles = manifest.files.filter((f) => f.type === 'csv' || f.type === 'fit');
    
    for (const file of rawFiles) {
      file.processed = false;
      file.errors = [];
    }
    
    // Run sync to process everything
    await this.sync();
  }

  private async scanFiles(dir: string, extension: string): Promise<string[]> {
    const files: string[] = [];
    
    if (!fs.existsSync(dir)) {
      return files;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await this.scanFiles(fullPath, extension);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  private async getFileInfo(filePath: string): Promise<{
    hash: string;
    size: number;
    mtime: string;
  }> {
    const content = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const stats = fs.statSync(filePath);
    
    return {
      hash,
      size: stats.size,
      mtime: stats.mtime.toISOString(),
    };
  }

  private async copyFile(src: string, dest: string): Promise<void> {
    const destDir = path.dirname(dest);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

