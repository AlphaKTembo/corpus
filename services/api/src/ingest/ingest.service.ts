import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { join } from 'path';
import { readFileSync } from 'fs';

export interface IngestStatus {
  status: 'idle' | 'running' | 'failed' | 'success';
  startedAtUtc?: string;
  finishedAtUtc?: string;
  processedFilesCount?: number;
  newFilesCount?: number;
  errors?: Array<{ file: string; message: string; stack?: string }>;
}

@Injectable()
export class IngestService {
  private corpusRoot: string;

  constructor(private configService: ConfigService) {
    this.corpusRoot = this.configService.get<string>('CORPUS_ROOT', '/data/corpus');
  }

  async triggerSync(): Promise<{ jobId: string }> {
    const workerPath = this.configService.get<string>(
      'WORKER_PATH',
      '/app/services/worker/dist/cli.js',
    );
    
    const jobId = `job-${Date.now()}`;
    
    // Spawn worker process
    const worker = spawn('node', [workerPath, 'ingest', '--sync'], {
      detached: true,
      stdio: 'ignore',
    });
    
    worker.unref();
    
    return { jobId };
  }

  async getStatus(userId = 'default'): Promise<IngestStatus> {
    try {
      const statusPath = join(this.corpusRoot, userId, 'metadata', 'ingest_status.json');
      const content = readFileSync(statusPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      // Return default status if file doesn't exist
      return {
        status: 'idle',
      };
    }
  }
}

