import * as fs from 'fs';
import * as path from 'path';

export interface ManifestFile {
  path: string;
  hash: string;
  size: number;
  mtime: string;
  type: 'csv' | 'fit';
  ingested_at_utc: string;
  processed: boolean;
  errors: Array<{ message: string; stack?: string }>;
}

export interface Manifest {
  version: string;
  files: ManifestFile[];
  last_successful_run_utc?: string;
}

export class ManifestService {
  private corpusRoot: string;
  private manifestPath: string;

  constructor() {
    this.corpusRoot = process.env.CORPUS_ROOT || '/data/corpus';
    this.manifestPath = path.join(this.corpusRoot, 'metadata', 'manifest.json');
  }

  async loadManifest(): Promise<Manifest> {
    if (!fs.existsSync(this.manifestPath)) {
      return {
        version: '1.0.0',
        files: [],
      };
    }

    const content = fs.readFileSync(this.manifestPath, 'utf-8');
    return JSON.parse(content);
  }

  async saveManifest(manifest: Manifest): Promise<void> {
    const metadataDir = path.dirname(this.manifestPath);
    fs.mkdirSync(metadataDir, { recursive: true });
    
    const content = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(this.manifestPath, content, 'utf-8');
  }
}

