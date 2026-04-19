import * as fs from 'fs';
import * as path from 'path';

export interface IngestStatus {
  status: 'idle' | 'running' | 'failed' | 'success';
  started_at_utc?: string;
  finished_at_utc?: string;
  processed_files_count?: number;
  new_files_count?: number;
  errors?: Array<{ file: string; message: string; stack?: string }>;
}

export class StatusService {
  private corpusRoot: string;
  private statusPath: string;

  constructor() {
    this.corpusRoot = process.env.CORPUS_ROOT || '/data/corpus';
    this.statusPath = path.join(this.corpusRoot, 'metadata', 'ingest_status.json');
  }

  async getStatus(): Promise<IngestStatus> {
    if (!fs.existsSync(this.statusPath)) {
      return { status: 'idle' };
    }

    const content = fs.readFileSync(this.statusPath, 'utf-8');
    return JSON.parse(content);
  }

  async setStatus(status: IngestStatus): Promise<void> {
    const metadataDir = path.dirname(this.statusPath);
    fs.mkdirSync(metadataDir, { recursive: true });
    
    const content = JSON.stringify(status, null, 2);
    fs.writeFileSync(this.statusPath, content, 'utf-8');
  }
}

