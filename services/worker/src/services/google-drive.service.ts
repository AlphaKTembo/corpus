import * as fs from 'fs';
import * as path from 'path';
import { google, drive_v3 } from 'googleapis';

interface DriveFileInfo {
  id: string;
  name: string;
  relativePath: string;
  mimeType?: string | null;
  md5Checksum?: string | null;
  size?: string | null;
  modifiedTime?: string | null;
}

interface DriveManifestEntry {
  id: string;
  name: string;
  path: string;
  mimeType?: string | null;
  md5Checksum?: string | null;
  size?: string | null;
  modifiedTime?: string | null;
  synced_at_utc: string;
}

interface DriveManifest {
  last_sync_utc?: string;
  files: DriveManifestEntry[];
}

export class GoogleDriveService {
  private corpusRoot: string;
  private syncRoot: string;
  private folderId: string;
  private manifestPath: string;
  private drive: drive_v3.Drive | null = null;

  constructor() {
    this.corpusRoot = process.env.CORPUS_ROOT || '/data/corpus';
    this.syncRoot = process.env.MEDICAL_DRIVE_SYNC_ROOT || '/data/drive_sync/Medicals';
    this.folderId = process.env.GOOGLE_DRIVE_MEDICAL_FOLDER_ID || '';
    this.manifestPath = path.join(this.corpusRoot, 'metadata', 'gdrive_medical_manifest.json');
  }

  async syncMedicalReports(): Promise<{
    totalFiles: number;
    downloadedFiles: number;
    skippedFiles: number;
    removedFiles: number;
  }> {
    if (!this.folderId) {
      throw new Error('GOOGLE_DRIVE_MEDICAL_FOLDER_ID is not set');
    }

    fs.mkdirSync(this.syncRoot, { recursive: true });
    fs.mkdirSync(path.dirname(this.manifestPath), { recursive: true });

    const drive = await this.getDriveClient();
    const files = await this.listFolderRecursive(drive, this.folderId, '');
    const manifest = this.loadManifest();

    const manifestById = new Map(manifest.files.map((file) => [file.id, file]));
    const updatedManifest: DriveManifestEntry[] = [];
    const seenIds = new Set<string>();

    let downloadedFiles = 0;
    let skippedFiles = 0;

    for (const file of files) {
      if (!file.id || !file.relativePath) {
        continue;
      }

      const existing = manifestById.get(file.id);
      const isUnchanged =
        existing &&
        existing.md5Checksum === file.md5Checksum &&
        existing.modifiedTime === file.modifiedTime;

      const destPath = path.join(this.syncRoot, file.relativePath);
      if (!isUnchanged || !fs.existsSync(destPath)) {
        await this.downloadFile(drive, file.id, destPath);
        downloadedFiles++;
      } else {
        skippedFiles++;
      }

      updatedManifest.push({
        id: file.id,
        name: file.name,
        path: file.relativePath,
        mimeType: file.mimeType,
        md5Checksum: file.md5Checksum,
        size: file.size,
        modifiedTime: file.modifiedTime,
        synced_at_utc: new Date().toISOString(),
      });
      seenIds.add(file.id);
    }

    const removedFiles = this.pruneMissingFiles(manifest.files, seenIds);

    this.saveManifest({
      last_sync_utc: new Date().toISOString(),
      files: updatedManifest,
    });

    return {
      totalFiles: files.length,
      downloadedFiles,
      skippedFiles,
      removedFiles,
    };
  }

  private loadManifest(): DriveManifest {
    if (!fs.existsSync(this.manifestPath)) {
      return { files: [] };
    }

    try {
      const content = fs.readFileSync(this.manifestPath, 'utf-8');
      const parsed = JSON.parse(content) as DriveManifest;
      if (!parsed.files) {
        return { files: [] };
      }
      return parsed;
    } catch (error) {
      return { files: [] };
    }
  }

  private saveManifest(manifest: DriveManifest): void {
    fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2));
  }

  private pruneMissingFiles(existingFiles: DriveManifestEntry[], seenIds: Set<string>): number {
    const pruneMissing = (process.env.GOOGLE_DRIVE_PRUNE_MISSING || '').toLowerCase() === 'true';
    if (!pruneMissing) {
      return 0;
    }

    let removed = 0;
    for (const file of existingFiles) {
      if (!seenIds.has(file.id)) {
        const localPath = path.join(this.syncRoot, file.path);
        if (fs.existsSync(localPath)) {
          fs.rmSync(localPath, { force: true });
          removed++;
        }
      }
    }

    return removed;
  }

  private async getDriveClient(): Promise<drive_v3.Drive> {
    if (this.drive) {
      return this.drive;
    }

    const serviceAccountPath = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
      const auth = new google.auth.GoogleAuth({
        keyFile: serviceAccountPath,
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      });
      this.drive = google.drive({ version: 'v3', auth });
      return this.drive;
    }

    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI || 'http://localhost';
    const refreshToken = this.loadRefreshToken();

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Google Drive OAuth credentials are not configured');
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    this.drive = google.drive({ version: 'v3', auth: oauth2Client });
    return this.drive;
  }

  private loadRefreshToken(): string | null {
    if (process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
      return process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
    }

    const tokenPath = path.join(this.corpusRoot, 'metadata', 'google_drive_tokens.json');
    if (!fs.existsSync(tokenPath)) {
      return null;
    }

    try {
      const data = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      return data.refresh_token || null;
    } catch (error) {
      return null;
    }
  }

  private async listFolderRecursive(
    drive: drive_v3.Drive,
    folderId: string,
    currentPath: string,
  ): Promise<DriveFileInfo[]> {
    const items: DriveFileInfo[] = [];
    let pageToken: string | undefined;

    do {
      const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, md5Checksum, size, modifiedTime)',
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const files = response.data.files || [];
      for (const file of files) {
        if (!file.id || !file.name) {
          continue;
        }

        if (file.mimeType === 'application/vnd.google-apps.folder') {
          const folderPath = path.posix.join(currentPath, file.name);
          const nested = await this.listFolderRecursive(drive, file.id, folderPath);
          items.push(...nested);
          continue;
        }

        if (!this.isPdfFile(file)) {
          continue;
        }

        const relativePath = path.posix.join(currentPath, file.name);
        items.push({
          id: file.id,
          name: file.name,
          relativePath,
          mimeType: file.mimeType,
          md5Checksum: file.md5Checksum,
          size: file.size,
          modifiedTime: file.modifiedTime,
        });
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return items;
  }

  private isPdfFile(file: drive_v3.Schema$File): boolean {
    const name = file.name ? file.name.toLowerCase() : '';
    return file.mimeType === 'application/pdf' || name.endsWith('.pdf');
  }

  private async downloadFile(drive: drive_v3.Drive, fileId: string, destPath: string): Promise<void> {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    const response = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' },
    );

    await new Promise<void>((resolve, reject) => {
      const destStream = fs.createWriteStream(destPath);
      response.data.on('error', reject);
      destStream.on('error', reject);
      destStream.on('finish', resolve);
      response.data.pipe(destStream);
    });
  }
}
