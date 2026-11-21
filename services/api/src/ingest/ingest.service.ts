import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync, readFileSync, statSync } from 'fs';

export interface IngestStatus {
  status: 'idle' | 'running' | 'failed' | 'success';
  startedAtUtc?: string;
  finishedAtUtc?: string;
  latestDataUpdatedAt?: string;
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
    const latestDataUpdatedAt = this.getLatestDataUpdatedAt(userId);
    try {
      const statusPath = join(this.corpusRoot, userId, 'metadata', 'ingest_status.json');
      const content = readFileSync(statusPath, 'utf-8');
      const raw = JSON.parse(content);
      return {
        // Keep the raw keys for backward compatibility: the worker writes
        // snake_case (started_at_utc, ...), while this API's contract and the
        // web/mobile clients use camelCase.
        ...raw,
        ...this.normalizeStatus(raw),
        latestDataUpdatedAt,
      };
    } catch (error) {
      // Return default status if file doesn't exist
      return {
        status: 'idle',
        latestDataUpdatedAt,
      };
    }
  }

  private normalizeStatus(raw: Record<string, any>): Partial<IngestStatus> {
    const pick = <T>(camel: string, snake: string): T | undefined =>
      (raw?.[camel] ?? raw?.[snake]) as T | undefined;
    const normalized: Partial<IngestStatus> = {
      startedAtUtc: pick<string>('startedAtUtc', 'started_at_utc'),
      finishedAtUtc: pick<string>('finishedAtUtc', 'finished_at_utc'),
      processedFilesCount: pick<number>('processedFilesCount', 'processed_files_count'),
      newFilesCount: pick<number>('newFilesCount', 'new_files_count'),
    };
    for (const key of Object.keys(normalized) as Array<keyof IngestStatus>) {
      if (normalized[key] === undefined) delete normalized[key];
    }
    return normalized;
  }

  private getLatestDataUpdatedAt(userId: string): string | undefined {
    const candidatePaths = [
      join(this.corpusRoot, userId, 'canonical', 'activities.csv'),
      join(this.corpusRoot, userId, 'canonical', 'vitals_daily.csv'),
      join(this.corpusRoot, userId, 'canonical', 'vitals_bp.csv'),
      join(this.corpusRoot, userId, 'canonical', 'sleep_daily.csv'),
      join(this.corpusRoot, userId, 'canonical', 'body_metrics.csv'),
      join(this.corpusRoot, userId, 'canonical', 'blood_results.csv'),
      join(this.corpusRoot, userId, 'canonical', 'dna_results.csv'),
      join(this.corpusRoot, userId, 'canonical', 'records_results.csv'),
    ];

    let latestMtimeMs = 0;
    for (const filePath of candidatePaths) {
      if (!existsSync(filePath)) continue;
      const mtimeMs = statSync(filePath).mtimeMs;
      if (mtimeMs > latestMtimeMs) latestMtimeMs = mtimeMs;
    }

    if (!latestMtimeMs) return undefined;
    return new Date(latestMtimeMs).toISOString();
  }
}

