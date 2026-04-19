import * as fs from 'fs';
import * as path from 'path';

export class InitService {
  private corpusRoot: string;
  private driveSyncRoot: string;
  private medicalDriveSyncRoot: string;

  constructor() {
    this.corpusRoot = process.env.CORPUS_ROOT || '/data/corpus';
    this.driveSyncRoot = process.env.DRIVE_SYNC_ROOT || '/data/drive_sync/TrainingPeaks';
    this.medicalDriveSyncRoot = process.env.MEDICAL_DRIVE_SYNC_ROOT || '/data/drive_sync/Medicals';
  }

  async ensureDirectories(): Promise<void> {
    console.log('Ensuring all required directories exist...');

    // Corpus root directories
    const corpusDirs = [
      'raw/csv',
      'raw/fit',
      'canonical',
      'derived',
      'metadata',
    ];

    for (const dir of corpusDirs) {
      const fullPath = path.join(this.corpusRoot, dir);
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`✓ Created: ${fullPath}`);
    }

    // Drive sync root (if it doesn't exist, create it)
    if (!fs.existsSync(this.driveSyncRoot)) {
      fs.mkdirSync(this.driveSyncRoot, { recursive: true });
      console.log(`✓ Created: ${this.driveSyncRoot}`);
    }

    if (!fs.existsSync(this.medicalDriveSyncRoot)) {
      fs.mkdirSync(this.medicalDriveSyncRoot, { recursive: true });
      console.log(`✓ Created: ${this.medicalDriveSyncRoot}`);
    }

    // Create default mapping rules if they don't exist
    const mappingRulesPath = path.join(this.corpusRoot, 'metadata', 'mapping_rules.yml');
    if (!fs.existsSync(mappingRulesPath)) {
      const examplePath = path.join(__dirname, '../../config/mapping_rules.example.yml');
      if (fs.existsSync(examplePath)) {
        fs.copyFileSync(examplePath, mappingRulesPath);
        console.log(`✓ Created default mapping rules: ${mappingRulesPath}`);
      }
    }

    console.log('Directory initialization complete!');
  }
}

