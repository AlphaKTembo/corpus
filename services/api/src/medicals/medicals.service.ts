import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import AdmZip = require('adm-zip');
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as pdfParse from 'pdf-parse';
import PDFDocument = require('pdfkit');
import type { drive_v3 } from 'googleapis';
import { ActivitiesService } from '../activities/activities.service';
import { MetricsService } from '../metrics/metrics.service';
import { SummaryService } from '../summary/summary.service';
import { anthropicErrorFields, anthropicUsage, recordAiUsage } from '../common/ai-usage';
import {
  BloodCategory,
  BloodResult,
  MedicalAskRequest,
  MedicalAskResponse,
  MedicalDocument,
  MedicalDocumentType,
} from './medicals.types';

type SyncResult = {
  added: number;
  skipped: number;
  errors: Array<{ name: string; message: string }>;
};

@Injectable()
export class MedicalsService {
  private corpusRoot: string;

  constructor(
    private configService: ConfigService,
    private activitiesService: ActivitiesService,
    private metricsService: MetricsService,
    private summaryService: SummaryService,
  ) {
    this.corpusRoot = this.configService.get<string>('CORPUS_ROOT', '/data/corpus');
  }

  private paths(userId = 'default') {
    const root = path.join(this.corpusRoot, userId);
    const medicalRoot = path.join(root, 'medical');
    return {
      root,
      medicalRoot,
      medicalTextDir: path.join(medicalRoot, 'text'),
      medicalSummaryDir: path.join(medicalRoot, 'summary'),
      medicalDocsPath: path.join(root, 'metadata', 'medical_documents.json'),
      bloodResultsPath: path.join(root, 'metadata', 'blood_results.csv'),
      dnaResultsPath: path.join(root, 'metadata', 'dna_records.csv'),
      recordsResultsPath: path.join(root, 'metadata', 'medical_records.csv'),
      bloodCategoriesPath: path.join(root, 'metadata', 'blood_categories.json'),
      lactateThresholdPath: path.join(root, 'metadata', 'lactate_threshold.csv'),
      ftpPath: path.join(root, 'metadata', 'ftp.csv'),
      coverLetterPath: path.join(medicalRoot, 'cover_letter.txt'),
    };
  }

  async uploadDocument(
    file: Express.Multer.File,
    dto: {
      type: MedicalDocumentType;
      date?: string;
      notes?: string;
    },
    userId = 'default',
  ): Promise<MedicalDocument> {
    userId = userId || 'default';
    const p = this.paths(userId);
    this.ensureDirectories(userId);
    const hash = this.hashBuffer(file.buffer);
    const existing = this.getDocuments(undefined, undefined, undefined, userId).find((doc) => doc.hash === hash);
    if (existing) {
      return existing;
    }

    const originalExt = file.originalname.includes('.')
      ? file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase()
      : '.pdf';
    const isPdf = originalExt === '.pdf';
    let text = '';
    try {
      if (isPdf) {
        text = await this.extractTextFromPdf(file.buffer);
      }
    } catch {
      text = '';
    }
    const docDate =
      dto.date || this.resolveDocumentDateFromText(text, file.originalname) || this.todayString();
    const docId = this.createDocumentId(hash, docDate);
    const typeDir = path.join(p.medicalRoot, dto.type);
    const filename = `${docId}${originalExt}`;
    const filePath = path.join(typeDir, filename);
    const textPath = path.join(p.medicalTextDir, `${docId}.txt`);

    fs.writeFileSync(filePath, file.buffer);
    fs.writeFileSync(textPath, text);

    const document: MedicalDocument = {
      id: docId,
      type: dto.type,
      date: docDate,
      filename,
      originalName: file.originalname,
      source: 'manual',
      hash,
      textPath,
      filePath,
      createdAt: new Date().toISOString(),
      notes: dto.notes,
    };

    this.saveDocument(document, userId);
    if (dto.type === 'bloods') {
      this.extractAndStoreBloodResults(text, docDate, docId, undefined, p);
    }
    if (dto.type === 'dna') {
      this.extractAndStoreDnaResults(text, docDate, docId, file.originalname, p);
    }
    if (dto.type === 'records' || dto.type === 'reports') {
      this.extractAndStoreMedicalRecord(text, docDate, docId, file.originalname, p);
    }

    return document;
  }

  async syncFromGoogleDrive(
    params: { folderId?: string; type?: MedicalDocumentType },
    userId = 'default',
  ): Promise<SyncResult> {
    const p = this.paths(userId);
    this.ensureDirectories(userId);
    const folderId = params.folderId || this.getDriveFolderId(params.type);
    if (!folderId) {
      throw new Error('Google Drive folder ID is not configured.');
    }

    const credentialsPath = this.configService.get<string>('GOOGLE_APPLICATION_CREDENTIALS');
    if (!credentialsPath || !fs.existsSync(credentialsPath)) {
      throw new Error('Google credentials are missing. Set GOOGLE_APPLICATION_CREDENTIALS.');
    }

    const { google } = await import('googleapis');
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    const drive = google.drive({ version: 'v3', auth });

    const files = await this.listDriveFolderRecursive(drive, folderId, '');
    const result: SyncResult = { added: 0, skipped: 0, errors: [] };

    for (const file of files) {
      try {
        const download = await drive.files.get(
          { fileId: file.id, alt: 'media', supportsAllDrives: true },
          { responseType: 'arraybuffer' },
        );
        const buffer = Buffer.from(download.data as ArrayBuffer);
        const relativePath = file.relativePath || file.name;
        const localMirrorRoot = this.configService.get<string>(
          'MEDICAL_DRIVE_SYNC_ROOT',
          '/data/drive_sync/Medicals',
        );
        const localPath = path.join(localMirrorRoot, relativePath);
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, buffer);
        const inferredType = this.resolveTypeFromPath(relativePath, params.type);
        const added = await this.processIncomingPdf({
          buffer,
          name: path.basename(relativePath),
          source: 'google_drive',
          sourceRef: relativePath,
          type: inferredType,
          modifiedTime: file.modifiedTime || undefined,
          userId,
        });
        if (added) {
          result.added += 1;
        } else {
          result.skipped += 1;
        }
      } catch (error: any) {
        result.errors.push({ name: file.name, message: error?.message || 'Unknown error' });
      }
    }

    return result;
  }

  async syncFromDropbox(
    params: { folderPath?: string; type?: MedicalDocumentType },
    userId = 'default',
  ): Promise<SyncResult> {
    const p = this.paths(userId);
    this.ensureDirectories(userId);
    const token = this.configService.get<string>('DROPBOX_ACCESS_TOKEN');
    if (!token) {
      throw new Error('DROPBOX_ACCESS_TOKEN is not configured.');
    }
    const folderPath = params.folderPath || this.configService.get<string>('DROPBOX_FOLDER_PATH', '');
    if (!folderPath) {
      throw new Error('Dropbox folder path is not configured.');
    }

    const listResponse = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: folderPath, recursive: false }),
    });

    if (!listResponse.ok) {
      throw new Error(`Dropbox list failed: ${listResponse.status}`);
    }

    const listData = await listResponse.json();
    const entries = listData.entries || [];
    const result: SyncResult = { added: 0, skipped: 0, errors: [] };

    for (const entry of entries) {
      if (entry['.tag'] !== 'file') continue;
      if (!entry.name || !entry.name.toLowerCase().endsWith('.pdf')) continue;
      try {
        const downloadResponse = await fetch('https://content.dropboxapi.com/2/files/download', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Dropbox-API-Arg': JSON.stringify({ path: entry.path_lower }),
          },
        });
        if (!downloadResponse.ok) {
          throw new Error(`Download failed: ${downloadResponse.status}`);
        }
        const buffer = Buffer.from(await downloadResponse.arrayBuffer());
        const added = await this.processIncomingPdf({
          buffer,
          name: entry.name,
          source: 'dropbox',
          sourceRef: entry.id || entry.path_lower,
          type: params.type || 'bloods',
          modifiedTime: entry.client_modified,
          userId,
        });
        if (added) {
          result.added += 1;
        } else {
          result.skipped += 1;
        }
      } catch (error: any) {
        result.errors.push({ name: entry.name, message: error?.message || 'Unknown error' });
      }
    }

    return result;
  }

  async syncFromLocalFolder(
    params: { rootPath?: string; type?: MedicalDocumentType },
    userId = 'default',
  ): Promise<SyncResult> {
    const p = this.paths(userId);
    this.ensureDirectories(userId);
    const rootPath =
      params.rootPath ||
      this.configService.get<string>('MEDICAL_DRIVE_SYNC_ROOT', '/data/drive_sync/Medicals');

    if (!fs.existsSync(rootPath)) {
      throw new Error(`Local medical sync folder not found: ${rootPath}`);
    }

    const files = this.scanPdfFiles(rootPath);
    const result: SyncResult = { added: 0, skipped: 0, errors: [] };

    for (const filePath of files) {
      try {
        const buffer = fs.readFileSync(filePath);
        const relativePath = path.relative(rootPath, filePath);
        const inferredType = this.resolveTypeFromPath(relativePath, params.type);
        const added = await this.processIncomingPdf({
          buffer,
          name: path.basename(filePath),
          source: 'google_drive',
          sourceRef: relativePath,
          type: inferredType,
          modifiedTime: fs.statSync(filePath).mtime.toISOString(),
          userId,
        });
        if (added) {
          result.added += 1;
        } else {
          result.skipped += 1;
        }
      } catch (error: any) {
        result.errors.push({ name: path.basename(filePath), message: error?.message || 'Unknown error' });
      }
    }

    return result;
  }

  listLocalFiles(params: {
    rootPath?: string;
    type?: MedicalDocumentType;
    includeContent?: boolean;
    maxBytes?: number;
    includeChunks?: boolean;
    chunkBytes?: number;
  }): Array<{
    path: string;
    size: number;
    modifiedTime: string;
    type: MedicalDocumentType;
    contentBase64?: string;
    contentBytes?: number;
    contentSkipped?: 'too_large';
    contentChunks?: Array<{ index: number; offset: number; bytes: number; base64: string }>;
    chunkBytes?: number;
    totalChunks?: number;
  }> {
    const rootPath =
      params.rootPath ||
      this.configService.get<string>('MEDICAL_DRIVE_SYNC_ROOT', '/data/drive_sync/Medicals');

    if (!fs.existsSync(rootPath)) {
      throw new Error(`Local medical sync folder not found: ${rootPath}`);
    }

    const files = this.scanPdfFiles(rootPath);
    const maxBytes = params.maxBytes && params.maxBytes > 0 ? params.maxBytes : 5 * 1024 * 1024;
    const chunkBytes = params.chunkBytes && params.chunkBytes > 0 ? params.chunkBytes : 2 * 1024 * 1024;
    return files.map((filePath) => {
      const stats = fs.statSync(filePath);
      const relativePath = path.relative(rootPath, filePath);
      const entry: {
        path: string;
        size: number;
        modifiedTime: string;
        type: MedicalDocumentType;
        contentBase64?: string;
        contentBytes?: number;
        contentSkipped?: 'too_large';
        contentChunks?: Array<{ index: number; offset: number; bytes: number; base64: string }>;
        chunkBytes?: number;
        totalChunks?: number;
      } = {
        path: relativePath.split(path.sep).join(path.posix.sep),
        size: stats.size,
        modifiedTime: stats.mtime.toISOString(),
        type: this.resolveTypeFromPath(relativePath, params.type),
      };
      if (params.includeContent) {
        if (stats.size <= maxBytes) {
          const buffer = fs.readFileSync(filePath);
          entry.contentBase64 = buffer.toString('base64');
          entry.contentBytes = buffer.length;
        } else if (params.includeChunks) {
          const fd = fs.openSync(filePath, 'r');
          try {
            const totalChunks = Math.ceil(stats.size / chunkBytes);
            const chunks: Array<{ index: number; offset: number; bytes: number; base64: string }> = [];
            let offset = 0;
            let index = 0;
            while (offset < stats.size) {
              const bytesToRead = Math.min(chunkBytes, stats.size - offset);
              const buffer = Buffer.alloc(bytesToRead);
              const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, offset);
              if (bytesRead <= 0) break;
              chunks.push({
                index,
                offset,
                bytes: bytesRead,
                base64: buffer.subarray(0, bytesRead).toString('base64'),
              });
              offset += bytesRead;
              index += 1;
            }
            entry.contentChunks = chunks;
            entry.chunkBytes = chunkBytes;
            entry.totalChunks = totalChunks;
          } finally {
            fs.closeSync(fd);
          }
        } else {
          entry.contentSkipped = 'too_large';
        }
      }
      return entry;
    });
  }

  resolveLocalFilePath(params: { rootPath?: string; relativePath: string }): string {
    const rootPath =
      params.rootPath ||
      this.configService.get<string>('MEDICAL_DRIVE_SYNC_ROOT', '/data/drive_sync/Medicals');
    const resolvedRoot = path.resolve(rootPath);
    const resolvedFile = path.resolve(rootPath, params.relativePath);

    if (!resolvedFile.startsWith(`${resolvedRoot}${path.sep}`) && resolvedFile !== resolvedRoot) {
      throw new Error('Invalid file path.');
    }
    if (!resolvedFile.toLowerCase().endsWith('.pdf')) {
      throw new Error('Only PDF files are allowed.');
    }
    if (!fs.existsSync(resolvedFile) || !fs.statSync(resolvedFile).isFile()) {
      throw new Error('File not found.');
    }

    return resolvedFile;
  }

  assertSyncToken(token?: string) {
    const expected = this.configService.get<string>('MEDICAL_SYNC_TOKEN');
    if (expected && token !== expected) {
      throw new ForbiddenException('Invalid sync token.');
    }
  }

  getDocuments(type?: MedicalDocumentType, from?: string, to?: string, userId = 'default'): MedicalDocument[] {
    const p = this.paths(userId);
    let docs = this.loadDocuments(userId);
    if (type) {
      if (type === 'records' || type === 'reports') {
        docs = docs.filter((doc) => doc.type === 'records' || doc.type === 'reports');
      } else {
        docs = docs.filter((doc) => doc.type === type);
      }
    }
    if (from) {
      docs = docs.filter((doc) => doc.date >= from);
    }
    if (to) {
      docs = docs.filter((doc) => doc.date <= to);
    }
    return docs.sort((a, b) => b.date.localeCompare(a.date));
  }

  getBloodResults(from?: string, to?: string, category?: string, userId = 'default'): BloodResult[] {
    const p = this.paths(userId);
    if (!fs.existsSync(p.bloodResultsPath)) {
      return [];
    }
    const lines = fs.readFileSync(p.bloodResultsPath, 'utf-8').trim().split('\n');
    if (lines.length <= 1) return [];
    const headers = lines[0].split(',').map((header) => header.trim());
    const results: BloodResult[] = [];

    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) continue;
      const values = this.parseCsvLine(line);
      const row: any = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx];
      });
      const result: BloodResult = {
        date: row.date,
        category: row.category,
        raw_name: row.raw_name,
        value: parseFloat(row.value),
        unit: row.unit || undefined,
        source_doc_id: row.source_doc_id,
      };
      results.push(result);
    }

    let filtered = results;
    if (from) filtered = filtered.filter((result) => result.date >= from);
    if (to) filtered = filtered.filter((result) => result.date <= to);
    if (category) filtered = filtered.filter((result) => result.category === category);
    return filtered.sort((a, b) => a.date.localeCompare(b.date));
  }

  async rebuildMedicalCsvs(userId = 'default'): Promise<{ bloods: number; dna: number; records: number }> {
    const p = this.paths(userId);
    this.ensureDirectories(userId);
    if (fs.existsSync(p.bloodResultsPath)) fs.unlinkSync(p.bloodResultsPath);
    if (fs.existsSync(p.dnaResultsPath)) fs.unlinkSync(p.dnaResultsPath);
    if (fs.existsSync(p.recordsResultsPath)) fs.unlinkSync(p.recordsResultsPath);

    const documents = this.loadDocuments(userId);
    let bloodCount = 0;
    let dnaCount = 0;
    let recordCount = 0;

    for (const doc of documents) {
      const text = await this.loadDocumentText(doc);
      if (!text) continue;
      const fallbackName = doc.originalName || doc.filename || doc.sourceRef;
      const resolvedDate = this.resolveDocumentDateFromText(text, fallbackName) || doc.date;
      if (doc.type === 'bloods') {
        this.extractAndStoreBloodResults(text, resolvedDate, doc.id, undefined, p);
        bloodCount += 1;
      } else if (doc.type === 'dna' || this.isDnaDocument(doc)) {
        this.extractAndStoreDnaResults(text, resolvedDate, doc.id, doc.originalName, p);
        dnaCount += 1;
      } else if (doc.type === 'records' || doc.type === 'reports') {
        this.extractAndStoreMedicalRecord(text, resolvedDate, doc.id, doc.originalName, p);
        recordCount += 1;
      }
    }

    return { bloods: bloodCount, dna: dnaCount, records: recordCount };
  }

  async extractPendingMedicalCsvs(
    userId = 'default',
  ): Promise<{ extracted: { bloods: number; dna: number; records: number }; skipped: number; retyped: number }> {
    const p = this.paths(userId);
    this.ensureDirectories(userId);

    const extractedByType = {
      bloods: new Set(this.readCsvRows(p.bloodResultsPath).map((r) => (r.source_doc_id || '').trim()).filter(Boolean)),
      dna: new Set(this.readCsvRows(p.dnaResultsPath).map((r) => (r.source_doc_id || '').trim()).filter(Boolean)),
      records: new Set(this.readCsvRows(p.recordsResultsPath).map((r) => (r.source_doc_id || '').trim()).filter(Boolean)),
    };

    const documents = this.loadDocuments(userId);
    const extracted = { bloods: 0, dna: 0, records: 0 };
    let skipped = 0;
    let retyped = 0;
    let docsChanged = false;

    for (const doc of documents) {
      const fallbackName = doc.originalName || doc.filename || doc.sourceRef || '';
      const inferredType = this.inferUploadType(fallbackName, doc.type);
      const targetType: 'bloods' | 'dna' | 'records' = inferredType === 'reports' ? 'records' : inferredType;
      if (doc.type !== inferredType) {
        (doc as any).type = inferredType;
        docsChanged = true;
        retyped += 1;
      }

      if (extractedByType[targetType].has(doc.id)) {
        skipped += 1;
        continue;
      }

      const text = await this.loadDocumentText(doc);
      if (!text) {
        skipped += 1;
        continue;
      }

      const resolvedDate = this.resolveDocumentDateFromText(text, fallbackName) || doc.date;
      if (targetType === 'bloods') {
        this.extractAndStoreBloodResults(text, resolvedDate, doc.id, undefined, p);
        extractedByType.bloods.add(doc.id);
        extracted.bloods += 1;
      } else if (targetType === 'dna' || this.isDnaDocument(doc)) {
        this.extractAndStoreDnaResults(text, resolvedDate, doc.id, doc.originalName, p);
        extractedByType.dna.add(doc.id);
        extracted.dna += 1;
      } else {
        this.extractAndStoreMedicalRecord(text, resolvedDate, doc.id, doc.originalName, p);
        extractedByType.records.add(doc.id);
        extracted.records += 1;
      }
    }

    if (docsChanged) {
      fs.writeFileSync(p.medicalDocsPath, JSON.stringify(documents, null, 2));
      this.recalcFolderCounts(userId);
    }

    return { extracted, skipped, retyped };
  }

  private getAnthropicApiKey(): string {
    const apiKey =
      this.configService.get<string>('ANTHROPIC_API_KEY') ||
      this.configService.get<string>('CLAUDE_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY (or CLAUDE_API_KEY) is not configured.');
    }
    return apiKey;
  }

  private getAnthropicModel(): string {
    return (
      this.configService.get<string>('ANTHROPIC_MODEL') ||
      this.configService.get<string>('CLAUDE_MODEL') ||
      'claude-3-5-sonnet-latest'
    );
  }

  private getContextCharLimit(): number {
    const raw =
      this.configService.get<string>('ANTHROPIC_MAX_CONTEXT_CHARS') ||
      this.configService.get<string>('OPENAI_MAX_CONTEXT_CHARS') ||
      '24000';
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 24000;
  }

  private getAnthropicMaxTokens(): number {
    const raw = this.configService.get<string>('ANTHROPIC_MAX_TOKENS', '2400');
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 2400;
  }

  private getMedicalSummaryMaxTokens(): number {
    const globalMax = this.getAnthropicMaxTokens();
    const fallback = Math.min(globalMax, 1800);
    const raw = this.configService.get<string>('MEDICAL_SUMMARY_MAX_TOKENS', String(fallback));
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, globalMax);
  }

  private getMedicalSummaryContextCharLimit(): number {
    const globalMax = this.getContextCharLimit();
    const fallback = Math.min(globalMax, 30000);
    const raw = this.configService.get<string>('MEDICAL_SUMMARY_MAX_CONTEXT_CHARS', String(fallback));
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, globalMax);
  }

  private extractAnthropicText(content: unknown): string {
    if (!Array.isArray(content)) return '';
    return content
      .filter((block) => block && (block as any).type === 'text' && typeof (block as any).text === 'string')
      .map((block) => (block as any).text.trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  private async callAnthropicForText(params: Parameters<MedicalsService['callAnthropicForTextRaw']>[0]): Promise<string> {
    const startedAt = Date.now();
    try {
      const { text, data } = await this.callAnthropicForTextRaw(params);
      recordAiUsage(this.corpusRoot, {
        ok: true, feature: 'medicals', model: data?.model || this.getAnthropicModel(),
        ...anthropicUsage(data), ms: Date.now() - startedAt,
      });
      return text;
    } catch (err) {
      recordAiUsage(this.corpusRoot, {
        ok: false, feature: 'medicals', model: this.getAnthropicModel(),
        ...anthropicErrorFields(err), ms: Date.now() - startedAt,
      });
      throw err;
    }
  }

  private async callAnthropicForTextRaw(params: {
    system: string;
    user: string;
    fallback?: string;
    maxTokens?: number;
  }): Promise<{ text: string; data: any }> {
    const maxTokens = params.maxTokens && params.maxTokens > 0
      ? Math.min(params.maxTokens, this.getAnthropicMaxTokens())
      : this.getAnthropicMaxTokens();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.getAnthropicApiKey(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.getAnthropicModel(),
        max_tokens: maxTokens,
        system: params.system,
        messages: [{ role: 'user', content: params.user }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic request failed: ${response.status} ${errorText}`);
    }
    const data = await response.json();
    const text = this.extractAnthropicText((data as any).content);
    return { text: text || params.fallback || 'No response.', data };
  }

  async askMedicals(dto: MedicalAskRequest, userId = 'default'): Promise<MedicalAskResponse> {
    const p = this.paths(userId);
    const maxChars = this.getContextCharLimit();

    const documents = this.selectDocumentsForQuestion(dto, userId);
    const csvContext = this.buildCsvContext(maxChars, p);
    const documentContext = this.buildContextFromDocuments(documents, maxChars);
    const context = csvContext || documentContext;

    const answer = await this.callAnthropicForText({
      system: 'You are a medical insights assistant. Use only the provided documents. If information is missing, say so.',
      user: `Question: ${dto.question}\n\nDocuments:\n${context}`,
    });

    return {
      question: dto.question,
      answer,
      sources: documents.map((doc) => ({ id: doc.id, date: doc.date, filename: doc.filename })),
    };
  }

  async generateDailySummary(
    dateOverride?: string,
    options?: { payloadMaxChars?: number; payloadMaxCharsPerDoc?: number },
    userId = 'default',
  ): Promise<{
    date: string;
    text: string;
    pdfPath: string;
    jsonPath: string;
    payloadPath: string;
    payloadUrl: string;
    payloadShareUrl: string;
  }> {
    const p = this.paths(userId);
    const maxChars = this.getMedicalSummaryContextCharLimit();

    const documents = this.selectDocumentsForQuestion({ question: 'summary' }, userId);
    const csvContext = this.buildCsvContext(maxChars, p);
    const csvPayload = this.buildCsvPayload(p);
    const documentContext = this.buildContextFromDocuments(documents, maxChars);
    const context = csvContext || documentContext;
    const fullDocumentPayload = this.buildFullDocumentPayload(documents, {
      maxTotalChars: options?.payloadMaxChars,
      maxPerDoc: options?.payloadMaxCharsPerDoc,
    });
    const date = dateOverride || this.todayString();
    const lactateThresholds = this.getLactateThresholds(userId);
    const lactateThresholdBlock = this.buildLactateThresholdBlock(lactateThresholds);
    const ftpRecords = this.getFtpRecords(userId);
    const ftpBlock = this.buildFtpBlock(ftpRecords);
    const coverLetterBody = this.getCoverLetterBody(p);
    const summaryPrompt =
      'Generate a detailed daily summary of all medical documents, highlighting key findings, trends, and follow-ups. ' +
      'Include key lab values with units and dates when available. Use plain text with simple bullet points. ' +
      'Do not use markdown headings. Follow the exact structure template provided.';
    const fitnessMetricsBlock = await this.buildFitnessSyncerMetricsBlock(date, userId);
    const assistantContext = await this.buildAssistantContext({ days: 30, activityLimit: 80, userId });
    const activityZones = await this.activitiesService.getZoneSummary(userId);
    const activityZonesBlock = this.buildActivityZonesBlock(activityZones);
    const assistantContextWithCsv = {
      ...assistantContext,
      csvRecords: csvPayload,
      activityZones,
      lactateThresholds,
      ftpRecords,
      coverLetter: coverLetterBody,
    };

    const summarySystemPrompt =
      'You are a medical insights assistant. Use only the provided documents. If information is missing, say so.';
    const summaryUserPrompt = [
        `Task: ${summaryPrompt}`,
        '',
        'Output format (use plain text, blank lines between sections):',
        `Date: ${date} (daily medical summary based on the documents provided)`,
        '',
        'Data source note (for context): intervals.icu provides activities, vitals (HRV/RHR), body metrics, and sleep; FitnessSyncer provides blood pressure.',
        '',
        'Key updates since the last available labs / logs',
        '- <bullet list of 2-6 key changes, or "Not available.">',
        '',
        'Main abnormal finding: <one sentence summary or "Not available.">',
        '',
        'Kidney markers: <one sentence summary or "Not available.">',
        'Blood pressure: <one sentence summary or "Not available.">',
        'Recovery markers: <one sentence summary or "Not available.">',
        '',
        'Document <doc_id> (<type>; collected <date if known>, reported <date if known>)',
        '',
        '<Section title (e.g., Electrolytes / renal function)>',
        '- <metric: value unit (flag)>',
        '',
        '<Repeat document blocks for each relevant document>',
        '',
        'Fitness metrics (most recent 30 days; BP from FitnessSyncer, other vitals from intervals.icu)',
        'Vitals trend',
        '- <date: key vitals line>',
        'Sleep trend',
        '- <date: key sleep line>',
        'Body metrics',
        '- <date: key body metrics line>',
        'Activity load',
        '- <date: key activity line>',
        '',
        'Activity zones (aggregated from activities)',
        '- Heart rate zones: <zone breakdown or "Not available.">',
        '- Power zones: <zone breakdown or "Not available.">',
        '',
        'Manual inputs',
        '- Lactate threshold: <date: value unit> or "Not available.">',
        '',
        'CK (Creatine Kinase) trend across the provided records',
        '- <date: value unit (flag)>',
        '',
        'Kidney function trend',
        '- <date: creatinine/eGFR values>',
        '',
        'DNA reports (long-term context, not a daily change)',
        '- <brief highlights or "Not available.">',
        '',
        'Missing/blank documents (content not available to summarise)',
        '- <doc id(s) or "None.">',
        '',
        'Follow-ups to consider (based on abnormalities + trends seen here)',
        '- <action items or "Not available.">',
        '',
        'Documents:',
        context || 'No medical documents available.',
        '',
        'Fitness Metrics (intervals.icu vitals/body/sleep/activity; BP from FitnessSyncer; most recent 30 days):',
        fitnessMetricsBlock || 'No fitness metrics available.',
        '',
        'Activity zones (aggregated from activities):',
        activityZonesBlock || 'No activity zone data available.',
        '',
        'Manual inputs (from CSV):',
        lactateThresholdBlock || 'No manual inputs available.',
      ].join('\n');
    const payload = {
      provider: 'anthropic',
      model: this.getAnthropicModel(),
      system: summarySystemPrompt,
      user: summaryUserPrompt,
      temperature: 0.2,
    };

    const summaryText = await this.callAnthropicForText({
      system: summarySystemPrompt,
      user: summaryUserPrompt,
      fallback: 'No summary generated.',
      maxTokens: this.getMedicalSummaryMaxTokens(),
    });
    const coverLetter = this.buildCoverLetter(date, p);
    const syncStatus = this.getSyncStatus(p);
    const syncStatusBlock = this.buildSyncStatusBlock(syncStatus);
    const manualInputsBlockParts = [
      lactateThresholdBlock ? ['Lactate threshold (manual):', lactateThresholdBlock].join('\n') : '',
      ftpBlock ? ['FTP (manual):', ftpBlock].join('\n') : '',
    ].filter(Boolean);
    const manualInputsBlock = manualInputsBlockParts.length
      ? ['Manual inputs (from CSV):', ...manualInputsBlockParts].join('\n')
      : 'Manual inputs (from CSV):\n- Not available.';
    const manualInputsSection =
      summaryText.toLowerCase().includes('manual inputs') ? '' : `\n\n${manualInputsBlock}`;
    const text = `${coverLetter}\n\n${summaryText}${manualInputsSection}\n\n${syncStatusBlock}`;

    fs.mkdirSync(p.medicalSummaryDir, { recursive: true });
    const jsonPath = path.join(p.medicalSummaryDir, `summary_${date}.json`);
    const pdfPath = path.join(p.medicalSummaryDir, `summary_${date}.pdf`);
    const payloadPath = path.join(p.medicalSummaryDir, `summary_${date}_payload.json`);
    const payloadTextPath = path.join(p.medicalSummaryDir, `summary_${date}_payload.txt`);
    const payloadUrl = `/v1/medicals/summary/payload?date=${date}`;
    const payloadShareUrl = this.buildShareableUrl(payloadUrl);

    fs.writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          date,
          createdAt: new Date().toISOString(),
          text,
          sourceCount: documents.length,
          fitnessMetricsIncluded: Boolean(fitnessMetricsBlock),
          syncStatus,
          coverLetter,
          lactateThresholds,
          documents: documents.map((doc) => ({
            id: doc.id,
            date: doc.date,
            type: doc.type,
            filename: doc.filename,
            originalName: doc.originalName,
            source: doc.source,
            sourceRef: doc.sourceRef,
          })),
        },
        null,
        2,
      ),
    );

    await this.writeSummaryPdf(pdfPath, text, date);
    fs.writeFileSync(
      payloadPath,
      JSON.stringify(
        {
          date,
          createdAt: new Date().toISOString(),
          payload,
          csvContextUsed: csvContext,
          csvRecords: csvPayload,
          fitnessMetrics: fitnessMetricsBlock,
          activityZones,
          contextUsed: context,
          documents: fullDocumentPayload,
          assistantContext: assistantContextWithCsv,
          syncStatus,
          coverLetter,
          manualInputs: {
            lactateThresholds,
            ftpRecords,
          },
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      payloadTextPath,
      [
        `Medical Summary (${date})`,
        '',
        text,
        '',
        `Payload URL: ${payloadShareUrl}`,
        '',
        'CSV Context:',
        csvContext || 'No CSV context available.',
        '',
        'CSV Records:',
        JSON.stringify(csvPayload, null, 2),
        '',
        'Activity Zones:',
        activityZonesBlock || 'No activity zone data available.',
        '',
        'Manual inputs:',
        lactateThresholdBlock || 'No manual inputs available.',
        '',
        'FTP (manual):',
        ftpBlock || 'No FTP manual inputs available.',
        '',
        'Latest data sync timestamps:',
        ...syncStatusBlock.split('\n').slice(1),
        '',
        'Sources:',
        ...documents.map((doc) => `- ${doc.date} [${doc.type}] ${doc.originalName || doc.filename}`),
      ].join('\n'),
    );

    return { date, text, pdfPath, jsonPath, payloadPath, payloadUrl, payloadShareUrl };
  }

  getLatestSummary(userId = 'default'): { date: string; text: string } | null {
    const p = this.paths(userId);
    if (!fs.existsSync(p.medicalSummaryDir)) return null;
    const files = fs.readdirSync(p.medicalSummaryDir).filter((name) => name.startsWith('summary_') && name.endsWith('.json'));
    if (files.length === 0) return null;
    files.sort();
    const latest = files[files.length - 1];
    const content = JSON.parse(fs.readFileSync(path.join(p.medicalSummaryDir, latest), 'utf-8'));
    return { date: content.date, text: content.text };
  }

  getCoverLetter(userId = 'default'): { text: string } {
    const p = this.paths(userId);
    this.ensureDirectories(userId);
    return { text: this.getCoverLetterBody(p) };
  }

  updateCoverLetter(text: string, userId = 'default'): { text: string } {
    const p = this.paths(userId);
    this.ensureDirectories(userId);
    const body = (text || '').trim();
    fs.writeFileSync(p.coverLetterPath, body);
    return { text: body };
  }

  getLactateThresholds(userId = 'default'): Array<Record<string, string>> {
    const p = this.paths(userId);
    return this.readCsvRows(p.lactateThresholdPath);
  }

  getFtpRecords(userId = 'default'): Array<Record<string, string>> {
    const p = this.paths(userId);
    return this.readCsvRows(p.ftpPath);
  }

  addLactateThreshold(params: { userId?: string;
    date?: string;
    value: string | number;
    unit?: string;
    notes?: string;
  }): Record<string, string> {
    const p = this.paths(params.userId || 'default');
    this.ensureDirectories(params.userId || 'default');
    const date = this.normalizeDate(params.date) || this.todayString();
    const value = String(params.value ?? '').trim();
    if (!value) {
      throw new Error('Lactate threshold value is required.');
    }
    const record: Record<string, string> = {
      date,
      value,
      unit: params.unit?.trim() || 'mmol/L',
      notes: params.notes?.trim() || '',
      source: 'manual',
      created_at: new Date().toISOString(),
    };
    this.appendCsvRow(p.lactateThresholdPath, ['date', 'value', 'unit', 'notes', 'source', 'created_at'], record);
    return record;
  }

  addFtp(params: { date?: string; value: string | number; unit?: string; notes?: string; userId?: string }): Record<string, string> {
    const p = this.paths(params.userId || 'default');
    this.ensureDirectories();
    const date = this.normalizeDate(params.date) || this.todayString();
    const value = String(params.value ?? '').trim();
    if (!value) {
      throw new Error('FTP value is required.');
    }
    const record: Record<string, string> = {
      date,
      value,
      unit: params.unit?.trim() || 'W',
      notes: params.notes?.trim() || '',
      source: 'manual',
      created_at: new Date().toISOString(),
    };
    this.appendCsvRow(p.ftpPath, ['date', 'value', 'unit', 'notes', 'source', 'created_at'], record);
    return record;
  }

  getSummaryPdfPath(date?: string, userId = 'default'): string | null {
    const p = this.paths(userId);
    if (!fs.existsSync(p.medicalSummaryDir)) return null;
    if (date) {
      const filePath = path.join(p.medicalSummaryDir, `summary_${date}.pdf`);
      return fs.existsSync(filePath) ? filePath : null;
    }
    const files = fs.readdirSync(p.medicalSummaryDir).filter((name) => name.startsWith('summary_') && name.endsWith('.pdf'));
    if (files.length === 0) return null;
    files.sort();
    return path.join(p.medicalSummaryDir, files[files.length - 1]);
  }

  getSummaryJsonPath(date?: string, userId = 'default'): string | null {
    const p = this.paths(userId);
    if (!fs.existsSync(p.medicalSummaryDir)) return null;
    if (date) {
      const filePath = path.join(p.medicalSummaryDir, `summary_${date}.json`);
      return fs.existsSync(filePath) ? filePath : null;
    }
    const files = fs.readdirSync(p.medicalSummaryDir).filter((name) => name.startsWith('summary_') && name.endsWith('.json'));
    if (files.length === 0) return null;
    files.sort();
    return path.join(p.medicalSummaryDir, files[files.length - 1]);
  }

  getSummaryPayloadPath(date?: string, userId = 'default'): string | null {
    const p = this.paths(userId);
    if (!fs.existsSync(p.medicalSummaryDir)) return null;
    if (date) {
      const jsonPath = path.join(p.medicalSummaryDir, `summary_${date}_payload.json`);
      if (fs.existsSync(jsonPath)) return jsonPath;
      const textPath = path.join(p.medicalSummaryDir, `summary_${date}_payload.txt`);
      return fs.existsSync(textPath) ? textPath : null;
    }
    const files = fs
      .readdirSync(p.medicalSummaryDir)
      .filter((name) => name.startsWith('summary_') && name.endsWith('_payload.json'));
    if (files.length === 0) return null;
    files.sort();
    const jsonPath = path.join(p.medicalSummaryDir, files[files.length - 1]);
    if (fs.existsSync(jsonPath)) return jsonPath;
    const textFiles = fs
      .readdirSync(p.medicalSummaryDir)
      .filter((name) => name.startsWith('summary_') && name.endsWith('_payload.txt'));
    if (textFiles.length === 0) return null;
    textFiles.sort();
    return path.join(p.medicalSummaryDir, textFiles[textFiles.length - 1]);
  }

  getPayloadShareUrl(date: string): string {
    return this.buildShareableUrl(`/v1/medicals/summary/payload?date=${date}`);
  }

  private getSyncStatus(p: ReturnType<MedicalsService['paths']>): Array<{ label: string; path: string; updatedAt?: string }> {
    const entries: Array<{ label: string; path: string }> = [
      { label: 'Activities', path: path.join(p.root, 'canonical', 'activities.csv') },
      { label: 'Vitals (daily)', path: path.join(p.root, 'canonical', 'vitals_daily.csv') },
      { label: 'Vitals (BP)', path: path.join(p.root, 'canonical', 'vitals_bp.csv') },
      { label: 'Sleep', path: path.join(p.root, 'canonical', 'sleep_daily.csv') },
      { label: 'Body metrics', path: path.join(p.root, 'canonical', 'body_metrics.csv') },
      { label: 'Body battery', path: path.join(p.root, 'metadata', 'body_battery.csv') },
      { label: 'HRV (Garmin fallback)', path: path.join(p.root, 'metadata', 'hrv_garmin.csv') },
      { label: 'Blood results', path: p.bloodResultsPath },
      { label: 'DNA records', path: p.dnaResultsPath },
      { label: 'Medical records', path: p.recordsResultsPath },
      { label: 'Lactate threshold (manual)', path: p.lactateThresholdPath },
      { label: 'FTP (manual)', path: p.ftpPath },
    ];

    return entries.map((entry) => {
      if (!fs.existsSync(entry.path)) {
        return { label: entry.label, path: entry.path };
      }
      const stats = fs.statSync(entry.path);
      return {
        label: entry.label,
        path: entry.path,
        updatedAt: stats.mtime.toISOString(),
      };
    });
  }

  private buildSyncStatusBlock(
    entries: Array<{ label: string; path: string; updatedAt?: string }>,
  ): string {
    const lines = entries.map(
      (entry) => `- ${entry.label}: ${entry.updatedAt || 'Not available'}`,
    );
    return ['Latest data sync timestamps:', ...lines].join('\n');
  }

  private buildLactateThresholdBlock(records: Array<Record<string, string>>): string {
    if (!records || records.length === 0) {
      return '';
    }
    const sorted = [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return sorted
      .slice(0, 10)
      .map((row) => {
        const value = row.value ? row.value : 'n/a';
        const unit = row.unit ? ` ${row.unit}` : '';
        return `- ${row.date || 'unknown'}: ${value}${unit}`;
      })
      .join('\n');
  }

  private buildFtpBlock(records: Array<Record<string, string>>): string {
    if (!records || records.length === 0) {
      return '';
    }
    const sorted = [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return sorted
      .slice(0, 10)
      .map((row) => {
        const value = row.value ? row.value : 'n/a';
        const unit = row.unit ? ` ${row.unit}` : '';
        const notes = this.truncateText(row.notes || '', 140);
        return `- ${row.date || 'unknown'}: ${value}${unit}${notes ? ` | ${notes}` : ''}`;
      })
      .join('\n');
  }

  private buildContextFromDocuments(documents: MedicalDocument[], maxChars: number): string {
    const contextBlocks: string[] = [];
    for (const doc of documents) {
      if (!fs.existsSync(doc.textPath)) continue;
      const text = fs.readFileSync(doc.textPath, 'utf-8');
      contextBlocks.push(`Document ${doc.id} (${doc.date}, ${doc.type}):\n${text}`);
    }
    let context = contextBlocks.join('\n\n');
    if (context.length > maxChars) {
      context = context.slice(0, maxChars);
    }
    return context;
  }

  private buildCsvContext(maxChars: number, p: ReturnType<MedicalsService['paths']>): string {
    const blocks: string[] = [];
    const maxBloodRows = 50;
    const maxDnaRows = 12;
    const maxRecordRows = 30;
    const maxLactateRows = 10;
    const maxFtpRows = 10;

    const bloodRows = this.readCsvRows(p.bloodResultsPath);
    if (bloodRows.length > 0) {
      const sorted = [...bloodRows].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const recent = sorted.slice(0, maxBloodRows);
      blocks.push('Blood results (latest first):');
      recent.forEach((row) => {
        const value = row.value ? row.value : 'n/a';
        const unit = row.unit ? ` ${row.unit}` : '';
        const label = row.raw_name || row.category || 'Result';
        blocks.push(`- ${row.date || 'unknown'}: ${label} ${value}${unit}`);
      });
    } else {
      blocks.push('Blood results: none.');
    }

    const lactateRows = this.readCsvRows(p.lactateThresholdPath);
    if (lactateRows.length > 0) {
      const sorted = [...lactateRows].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      blocks.push('', 'Lactate threshold (manual inputs):');
      sorted.slice(0, maxLactateRows).forEach((row) => {
        const value = row.value ? row.value : 'n/a';
        const unit = row.unit ? ` ${row.unit}` : '';
        const notes = this.truncateText(row.notes || '', 140);
        blocks.push(`- ${row.date || 'unknown'}: ${value}${unit}${notes ? ` | ${notes}` : ''}`);
      });
    } else {
      blocks.push('', 'Lactate threshold (manual inputs): none.');
    }

    const ftpRows = this.readCsvRows(p.ftpPath);
    if (ftpRows.length > 0) {
      const sorted = [...ftpRows].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      blocks.push('', 'FTP (manual inputs):');
      sorted.slice(0, maxFtpRows).forEach((row) => {
        const value = row.value ? row.value : 'n/a';
        const unit = row.unit ? ` ${row.unit}` : '';
        const notes = this.truncateText(row.notes || '', 140);
        blocks.push(`- ${row.date || 'unknown'}: ${value}${unit}${notes ? ` | ${notes}` : ''}`);
      });
    } else {
      blocks.push('', 'FTP (manual inputs): none.');
    }

    const dnaRows = this.readCsvRows(p.dnaResultsPath);
    if (dnaRows.length > 0) {
      blocks.push('', 'DNA reports:');
      dnaRows.slice(0, maxDnaRows).forEach((row) => {
        const name = row.report_name || row.title || 'DNA report';
        const finding = this.truncateText(row.key_findings || row.notes || '', 220);
        blocks.push(`- ${row.date || 'unknown'}: ${name}${finding ? ` | ${finding}` : ''}`);
      });
    } else {
      blocks.push('', 'DNA reports: none.');
    }

    const recordRows = this.readCsvRows(p.recordsResultsPath);
    if (recordRows.length > 0) {
      blocks.push('', 'Medical records (latest first):');
      const sorted = [...recordRows].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      sorted.slice(0, maxRecordRows).forEach((row) => {
        const title = row.title || row.report_name || 'Medical record';
        const diagnosis = this.truncateText(row.diagnosis || '', 160);
        const notes = this.truncateText(row.notes || '', 200);
        const parts = [diagnosis, notes].filter(Boolean);
        blocks.push(`- ${row.date || 'unknown'}: ${title}${parts.length ? ` | ${parts.join(' | ')}` : ''}`);
      });
    } else {
      blocks.push('', 'Medical records: none.');
    }

    let context = blocks.join('\n');
    if (context.length > maxChars) {
      context = context.slice(0, maxChars);
    }
    return context.trim();
  }

  private buildCsvPayload(p: ReturnType<MedicalsService['paths']>): {
    bloods: Array<Record<string, string>>;
    dna: Array<Record<string, string>>;
    records: Array<Record<string, string>>;
    lactateThresholds: Array<Record<string, string>>;
    ftp: Array<Record<string, string>>;
  } {
    return {
      bloods: this.readCsvRows(p.bloodResultsPath),
      dna: this.readCsvRows(p.dnaResultsPath),
      records: this.readCsvRows(p.recordsResultsPath),
      lactateThresholds: this.readCsvRows(p.lactateThresholdPath),
      ftp: this.readCsvRows(p.ftpPath),
    };
  }

  private buildFullDocumentPayload(
    documents: MedicalDocument[],
    overrides?: { maxTotalChars?: number; maxPerDoc?: number },
  ): Array<{
    id: string;
    date: string;
    type: MedicalDocumentType;
    filename: string;
    originalName?: string;
    source?: string;
    sourceRef?: string;
    text: string;
    truncated: boolean;
  }> {
    const maxTotalChars =
      overrides?.maxTotalChars ??
      parseInt(this.configService.get<string>('MEDICAL_PAYLOAD_MAX_CHARS', '60000'), 10);
    const maxPerDoc =
      overrides?.maxPerDoc ??
      parseInt(this.configService.get<string>('MEDICAL_PAYLOAD_MAX_CHARS_PER_DOC', '8000'), 10);

    const payload: Array<{
      id: string;
      date: string;
      type: MedicalDocumentType;
      filename: string;
      originalName?: string;
      source?: string;
      sourceRef?: string;
      text: string;
      truncated: boolean;
    }> = [];

    let totalChars = 0;
    for (const doc of documents) {
      if (!fs.existsSync(doc.textPath)) continue;
      if (totalChars >= maxTotalChars) break;

      const rawText = fs.readFileSync(doc.textPath, 'utf-8');
      const maxAllowed = Math.min(maxPerDoc, Math.max(0, maxTotalChars - totalChars));
      const text = rawText.length > maxAllowed ? rawText.slice(0, maxAllowed) : rawText;
      const truncated = rawText.length > text.length;
      totalChars += text.length;

      payload.push({
        id: doc.id,
        date: doc.date,
        type: doc.type,
        filename: doc.filename,
        originalName: doc.originalName,
        source: doc.source,
        sourceRef: doc.sourceRef,
        text,
        truncated,
      });
    }

    return payload;
  }

  private readCsvRows(filePath: string): Array<Record<string, string>> {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) return [];
    const lines = raw.split('\n');
    if (lines.length <= 1) return [];
    const headers = this.parseCsvLine(lines[0]).map((header) => header.trim());
    const rows: Array<Record<string, string>> = [];
    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) continue;
      const values = this.parseCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      rows.push(row);
    }
    return rows;
  }

  private truncateText(value: string, maxLength: number): string {
    if (!value) return '';
    if (value.length <= maxLength) return value;
    return `${value.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
  }

  private async buildAssistantContext(params?: { days?: number; activityLimit?: number; userId?: string }) {
    const userId = params?.userId || 'default';
    const p = this.paths(userId);
    const days = params?.days && params.days > 0 ? params.days : 30;
    const activityLimit = params?.activityLimit && params.activityLimit > 0 ? params.activityLimit : 80;

    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    const from = start.toISOString().slice(0, 10);

    const [todayBrief, rollingSummary, vitals, sleep, bodyMetrics, activities, latestSummary, activityZones] =
      await Promise.all([
        this.summaryService.getTodayBrief(userId),
        this.summaryService.getRollingSummary(days, userId),
        this.metricsService.getVitals(from, undefined, userId),
        this.metricsService.getSleep(from, undefined, userId),
        this.metricsService.getBodyMetrics(from, undefined, userId),
        this.activitiesService.findActivities({ limit: activityLimit }, userId),
        Promise.resolve(this.getLatestSummary(userId)),
        this.activitiesService.getZoneSummary(userId),
      ]);

    const medicalSummary =
      latestSummary && latestSummary.date
        ? {
            ...latestSummary,
            payloadShareUrl: this.getPayloadShareUrl(latestSummary.date),
          }
        : null;

    const activityRecommendations = this.buildActivityRecommendations(activities.activities, todayBrief);
    const lactateThresholds = this.getLactateThresholds(userId);
    const ftpRecords = this.getFtpRecords(userId);
    const coverLetter = this.getCoverLetterBody(p);

    return {
      generatedAt: new Date().toISOString(),
      window: { days, from },
      todayBrief,
      rollingSummary,
      vitals,
      sleep,
      bodyMetrics,
      activities: activities.activities,
      recommendations: activityRecommendations,
      activityZones,
      medicalSummary,
      manualInputs: {
        lactateThresholds,
        ftpRecords,
      },
      coverLetter,
    };
  }

  private buildActivityRecommendations(
    activities: Array<{ start_time_utc?: string; sport?: string; distance_m?: number }>,
    todayBrief: { recovery?: { status?: string } } | null,
  ) {
    const now = new Date();
    const days28 = 28;
    const days7 = 7;
    const start28 = new Date(now);
    start28.setDate(start28.getDate() - days28);
    const start7 = new Date(now);
    start7.setDate(start7.getDate() - days7);

    const runningActivities = (activities || []).filter((activity) => {
      if (!activity.start_time_utc || !activity.sport) return false;
      const start = new Date(activity.start_time_utc);
      if (Number.isNaN(start.getTime())) return false;
      if (start < start28) return false;
      const sport = activity.sport.toLowerCase();
      return sport.includes('run');
    });

    if (runningActivities.length === 0) {
      return {
        runKm: null,
        note: 'Not enough recent running data for a recommendation.',
      };
    }

    const kmByDate = runningActivities.map((activity) => ({
      start: new Date(activity.start_time_utc as string),
      km: activity.distance_m ? activity.distance_m / 1000 : 0,
    }));

    const total28 = kmByDate.reduce((sum, item) => sum + item.km, 0);
    const total7 = kmByDate
      .filter((item) => item.start >= start7)
      .reduce((sum, item) => sum + item.km, 0);
    const longest28 = kmByDate.reduce((max, item) => Math.max(max, item.km), 0);

    const avgWeekly = total28 / 4;
    const base = avgWeekly / 4; // assume ~4 runs per week

    let readinessFactor = 1;
    const recoveryStatus = todayBrief?.recovery?.status;
    if (recoveryStatus === 'red') readinessFactor = 0.35;
    else if (recoveryStatus === 'yellow') readinessFactor = 0.65;

    const cappedBase = Math.min(base * readinessFactor, longest28 * 0.6);
    const target = Math.max(0, cappedBase);
    const min = Math.max(0, target * 0.6);
    const max = Math.max(0, target * 1.3);

    return {
      runKm: {
        min: Number(min.toFixed(1)),
        target: Number(target.toFixed(1)),
        max: Number(max.toFixed(1)),
      },
      basis: {
        recoveryStatus: recoveryStatus || 'unknown',
        totalKmLast7: Number(total7.toFixed(1)),
        totalKmLast28: Number(total28.toFixed(1)),
        longestRunLast28: Number(longest28.toFixed(1)),
      },
      note:
        recoveryStatus === 'red'
          ? 'Low readiness: keep it very easy or rest.'
          : 'Rule-based recommendation based on recent running volume and recovery status.',
    };
  }

  private async writeSummaryPdf(pdfPath: string, text: string, date: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(pdfPath);
      doc.pipe(stream);
      doc.fontSize(18).text(`Medical Summary - ${date}`, { align: 'left' });
      doc.moveDown();
      doc.fontSize(11).text(text, { align: 'left' });
      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  private buildCoverLetter(date: string, p?: ReturnType<MedicalsService['paths']>): string {
    const formattedDate = this.formatCoverLetterDate(date);
    const body = this.getCoverLetterBody(p);
    if (!body) {
      return `Written ${formattedDate}.`;
    }
    if (body.includes('{{date}}') || body.includes('{date}')) {
      return body.replace(/{{date}}|{date}/g, formattedDate);
    }
    return [`Written ${formattedDate}.`, '', body].join('\n');
  }

  private getCoverLetterBody(p?: ReturnType<MedicalsService['paths']>): string {
    if (!p) p = this.paths('default');
    if (fs.existsSync(p.coverLetterPath)) {
      return fs.readFileSync(p.coverLetterPath, 'utf-8').trim();
    }
    return this.getDefaultCoverLetterBody();
  }

  private getDefaultCoverLetterBody(): string {
    return '';
  }

  private formatCoverLetterDate(date: string): string {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return date;
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    const day = parsed.getUTCDate();
    const month = months[parsed.getUTCMonth()];
    const year = parsed.getUTCFullYear();
    return `${day} ${month} ${year}`;
  }

  private buildShareableUrl(relativePath: string): string {
    const baseUrl = this.configService.get<string>('PUBLIC_BASE_URL');
    if (!baseUrl) return relativePath;
    try {
      const normalizedBase = baseUrl.replace(/\/+$/, '');
      const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
      return `${normalizedBase}${normalizedPath}`;
    } catch (error) {
      console.warn('Invalid PUBLIC_BASE_URL, falling back to relative URL:', error);
      return relativePath;
    }
  }

  private isFitnessSyncerSource(source?: string): boolean {
    if (!source) return false;
    return source.toLowerCase().includes('fitness');
  }

  private formatNumeric(value?: number, digits: number = 1): string {
    if (value === undefined || Number.isNaN(value)) return 'n/a';
    return value.toFixed(digits);
  }

  private buildActivityZonesBlock(zoneSummary?: {
    power?: { ftp?: number; zones: Array<{ label: string; pct: number; range: string }> } | null;
    heartRate?: { maxHr?: number; zones: Array<{ label: string; pct: number; range: string }> } | null;
  }): string {
    if (!zoneSummary?.power && !zoneSummary?.heartRate) {
      return 'No activity zone data available.';
    }

    const lines: string[] = [];
    if (zoneSummary.heartRate) {
      lines.push(`Heart Rate Zones (Max HR: ${zoneSummary.heartRate.maxHr ?? 'n/a'} bpm):`);
      zoneSummary.heartRate.zones.forEach((zone) => {
        lines.push(`- ${zone.label} ${zone.range}: ${this.formatNumeric(zone.pct, 1)}%`);
      });
      lines.push('');
    }

    if (zoneSummary.power) {
      lines.push(`Power Zones (FTP: ${zoneSummary.power.ftp ?? 'n/a'} W):`);
      zoneSummary.power.zones.forEach((zone) => {
        lines.push(`- ${zone.label} ${zone.range}: ${this.formatNumeric(zone.pct, 1)}%`);
      });
    }

    return lines.join('\n').trim();
  }

  private async buildFitnessSyncerMetricsBlock(date: string, userId = 'default'): Promise<string> {
    try {
      const end = new Date(date);
      const start = new Date(end);
      start.setDate(start.getDate() - 30);
      const from = start.toISOString().slice(0, 10);

      const [vitals, sleep, bodyMetrics, activities] = await Promise.all([
        this.metricsService.getVitals(from, undefined, userId),
        this.metricsService.getSleep(from, undefined, userId),
        this.metricsService.getBodyMetrics(from, undefined, userId),
        this.activitiesService.findActivities({ limit: 80 }, userId),
      ]);

      const lines: string[] = [];

      const vitalsByDate = new Map<string, any>();
      vitals.forEach((v) => {
        if (!v?.date) return;
        if (!vitalsByDate.has(v.date)) vitalsByDate.set(v.date, {});
        const entry = vitalsByDate.get(v.date);
        entry.resting_hr_bpm = v.resting_hr_bpm ?? entry.resting_hr_bpm;
        entry.hrv_ms = v.hrv_ms ?? entry.hrv_ms;
        entry.body_temp_c = v.body_temp_c ?? entry.body_temp_c;
        if (v.systolic_bp !== undefined || v.diastolic_bp !== undefined) {
          entry.systolic_bp = v.systolic_bp ?? entry.systolic_bp;
          entry.diastolic_bp = v.diastolic_bp ?? entry.diastolic_bp;
        }
      });

      const vitalsDates = Array.from(vitalsByDate.keys()).sort().slice(-30).reverse();
      lines.push('Vitals:');
      if (vitalsDates.length === 0) {
        lines.push('- none');
      } else {
        vitalsDates.forEach((dateKey) => {
          const v = vitalsByDate.get(dateKey);
          lines.push(
            `- ${dateKey}: RHR ${this.formatNumeric(v.resting_hr_bpm, 0)} bpm, ` +
              `HRV ${this.formatNumeric(v.hrv_ms, 0)} ms, ` +
              `Temp ${this.formatNumeric(v.body_temp_c)} C, ` +
              `BP ${this.formatNumeric(v.systolic_bp, 0)}/${this.formatNumeric(v.diastolic_bp, 0)} mmHg`,
          );
        });
      }

      const fitnessSleep = sleep.filter(s => !this.isFitnessSyncerSource(s.source)).slice(0, 30);
      lines.push('', 'Sleep:');
      if (fitnessSleep.length === 0) {
        lines.push('- none');
      } else {
        fitnessSleep.forEach((s) => {
          lines.push(
            `- ${s.date}: total ${this.formatNumeric(s.sleep_total_min, 0)} min, ` +
              `REM ${this.formatNumeric(s.rem_min, 0)} min, deep ${this.formatNumeric(s.deep_min, 0)} min, ` +
              `awake ${this.formatNumeric(s.wake_min, 0)} min, eff ${this.formatNumeric(s.efficiency_pct, 0)}%, ` +
              `awakenings ${this.formatNumeric(s.awakenings, 0)}`,
          );
        });
      }

      const fitnessBody = bodyMetrics.filter(b => !this.isFitnessSyncerSource(b.source)).slice(0, 30);
      lines.push('', 'Body Metrics:');
      if (fitnessBody.length === 0) {
        lines.push('- none');
      } else {
        fitnessBody.forEach((b) => {
          lines.push(
            `- ${b.date}: weight ${this.formatNumeric(b.weight_kg)} kg, ` +
              `body fat ${this.formatNumeric(b.body_fat_pct)}%, ` +
              `FFM ${this.formatNumeric(b.fat_free_mass_kg)} kg, ` +
              `muscle ${this.formatNumeric(b.muscle_mass_kg)} kg, ` +
              `bone ${this.formatNumeric(b.bone_mass_kg)} kg, ` +
              `water ${this.formatNumeric(b.body_water_kg)} kg`,
          );
        });
      }

      const fitnessActivities = activities.activities
        .filter(a => !this.isFitnessSyncerSource(a.source))
        .slice(0, 20);
      lines.push('', 'Activities (latest 20):');
      if (fitnessActivities.length === 0) {
        lines.push('- none');
      } else {
        fitnessActivities.forEach((a) => {
          const dateLabel = new Date(a.start_time_utc).toISOString().slice(0, 10);
          lines.push(
            `- ${dateLabel} ${a.sport}: ${this.formatNumeric(a.duration_s / 60, 0)} min, ` +
              `dist ${this.formatNumeric(a.distance_m ? a.distance_m / 1000 : undefined, 2)} km, ` +
              `TSS ${this.formatNumeric(a.tss, 0)}, ` +
              `HR ${this.formatNumeric(a.avg_hr_bpm, 0)}/${this.formatNumeric(a.max_hr_bpm, 0)} bpm, ` +
              `power ${this.formatNumeric(a.avg_power_w, 0)} W, IF ${this.formatNumeric(a.if, 2)}`,
          );
        });
      }

      return lines.join('\n').trim();
    } catch (error) {
      console.warn('Failed to build FitnessSyncer metrics block:', error);
      return '';
    }
  }

  private async processIncomingPdf(params: {
    buffer: Buffer;
    name: string;
    source: 'google_drive' | 'dropbox';
    sourceRef?: string;
    type: MedicalDocumentType;
    modifiedTime?: string;
    userId?: string;
  }): Promise<boolean> {
    const p = this.paths(params.userId || 'default');
    const hash = this.hashBuffer(params.buffer);
    const existingBySourceRef = params.sourceRef
      ? this.getDocuments(undefined, undefined, undefined, params.userId || 'default').find(
          (doc) => doc.source === params.source && doc.sourceRef === params.sourceRef,
        )
      : undefined;
    if (existingBySourceRef) return false;

    const text = await this.extractTextFromPdf(params.buffer);
    const docDate =
      this.resolveDocumentDateFromText(text, params.name) ||
      this.normalizeDate(params.modifiedTime) ||
      this.todayString();
    let docId = this.createDocumentId(hash, docDate);
    if (this.getDocuments().some((doc) => doc.id === docId)) {
      const sourceSuffix = params.sourceRef
        ? crypto.createHash('sha256').update(params.sourceRef).digest('hex').slice(0, 4)
        : Date.now().toString().slice(-4);
      docId = `${docId}_${sourceSuffix}`;
    }
    const typeDir = path.join(p.medicalRoot, params.type);
    const filename = `${docId}.pdf`;
    const filePath = path.join(typeDir, filename);
    const textPath = path.join(p.medicalTextDir, `${docId}.txt`);

    fs.writeFileSync(filePath, params.buffer);
    fs.writeFileSync(textPath, text);

    const document: MedicalDocument = {
      id: docId,
      type: params.type,
      date: docDate,
      filename,
      originalName: params.name,
      source: params.source,
      sourceRef: params.sourceRef,
      hash,
      textPath,
      filePath,
      createdAt: new Date().toISOString(),
    };

    this.saveDocument(document, params.userId || 'default');
    if (params.type === 'bloods') {
      this.extractAndStoreBloodResults(text, docDate, docId, undefined, p);
    }
    if (params.type === 'dna') {
      this.extractAndStoreDnaResults(text, docDate, docId, params.name, p);
    }
    if (params.type === 'records' || params.type === 'reports') {
      this.extractAndStoreMedicalRecord(text, docDate, docId, params.name, p);
    }
    return true;
  }

  private selectDocumentsForQuestion(dto: MedicalAskRequest, userId = 'default'): MedicalDocument[] {
    let docs = this.getDocuments(dto.type, dto.from, dto.to, userId);
    if (dto.docIds && dto.docIds.length > 0) {
      docs = docs.filter((doc) => dto.docIds?.includes(doc.id));
    }
    return docs.slice(0, 20);
  }

  private extractAndStoreBloodResults(text: string, date: string, docId: string, _unused?: unknown, p?: ReturnType<MedicalsService['paths']>) {
    if (!p) p = this.paths('default');
    const categories = this.loadCategories(p);
    const results = this.parseBloodResults(text, date, docId, categories);
    if (results.length === 0) return;
    this.appendBloodResults(results, p);
    this.saveCategories(categories, p);
  }

  private parseBloodResults(
    text: string,
    date: string,
    docId: string,
    categories: BloodCategory[],
  ): BloodResult[] {
    const lines = text
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .map((line) => line.replace(/^[-*>•]+\s*/, '').trim())
      .filter(Boolean);

    const results: BloodResult[] = [];
    for (const line of lines) {
      if (this.isNoiseLine(line)) continue;
      const match = line.match(
        /^([A-Za-z][A-Za-z0-9\s\-()%/.,]+?)\s+(-?\d+(?:\.\d+)?)\s*([A-Za-zµ/%]+)?/,
      );
      if (!match) continue;
      const rawName = match[1].trim();
      const value = parseFloat(match[2]);
      if (Number.isNaN(value)) continue;
      const unit = match[3]?.trim();
      const category = this.getOrCreateCategory(rawName, categories);
      results.push({
        date,
        category,
        raw_name: rawName,
        value,
        unit,
        source_doc_id: docId,
      });
    }

    return results;
  }

  private isNoiseLine(line: string): boolean {
    const lowered = line.toLowerCase();
    if (lowered.includes('reference')) return true;
    if (lowered.includes('range')) return true;
    if (
      lowered.includes('authorised on') ||
      lowered.includes('signed out') ||
      lowered.includes('preliminary') ||
      lowered.includes('report date') ||
      lowered.includes('collection date') ||
      lowered.includes('received date') ||
      lowered.includes('requested') ||
      lowered.includes('spec #') ||
      lowered.includes('specimen') ||
      lowered.includes('lab ref') ||
      lowered.includes('patient') ||
      lowered.includes('doctor') ||
      lowered.includes('medaid') ||
      lowered.includes('guarantor') ||
      lowered.includes('tel') ||
      lowered.includes('id num')
    ) {
      return true;
    }
    if (
      lowered.includes('avenue') ||
      lowered.includes('street') ||
      lowered.includes('road') ||
      lowered.includes('drive') ||
      lowered.includes('depot') ||
      lowered.includes('harare') ||
      lowered.includes('zimbabwe') ||
      /\bave\b/.test(lowered) ||
      /\brd\b/.test(lowered) ||
      /\bst\b/.test(lowered)
    ) {
      return true;
    }
    if (/\bcnr\b/.test(lowered) && (/\bave\b/.test(lowered) || lowered.includes('road'))) {
      return true;
    }
    if (lowered.startsWith('page ')) return true;
    if (lowered.length < 4) return true;
    return false;
  }

  private getOrCreateCategory(rawName: string, categories: BloodCategory[]): string {
    const normalized = this.normalizeLabel(rawName);
    for (const category of categories) {
      if (category.synonyms.some((syn) => this.normalizeLabel(syn) === normalized)) {
        category.updatedAt = new Date().toISOString();
        if (!category.synonyms.includes(rawName)) {
          category.synonyms.push(rawName);
        }
        return category.canonical;
      }
    }

    const best = this.findClosestCategory(rawName, categories);
    if (best) {
      best.updatedAt = new Date().toISOString();
      if (!best.synonyms.includes(rawName)) {
        best.synonyms.push(rawName);
      }
      return best.canonical;
    }

    const canonical = this.titleCase(rawName);
    const newCategory: BloodCategory = {
      id: `cat_${Date.now()}`,
      canonical,
      synonyms: [rawName],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    categories.push(newCategory);
    return canonical;
  }

  private findClosestCategory(rawName: string, categories: BloodCategory[]): BloodCategory | undefined {
    const tokens = this.tokenize(rawName);
    let best: { category: BloodCategory; score: number } | undefined;
    for (const category of categories) {
      const categoryTokens = this.tokenize(category.canonical);
      const score = this.jaccard(tokens, categoryTokens);
      if (!best || score > best.score) {
        best = { category, score };
      }
    }
    if (best && best.score >= 0.65) {
      return best.category;
    }
    return undefined;
  }

  private tokenize(value: string): Set<string> {
    return new Set(this.normalizeLabel(value).split(' ').filter(Boolean));
  }

  private jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const token of a) {
      if (b.has(token)) intersection += 1;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  private normalizeLabel(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private titleCase(value: string): string {
    return value
      .toLowerCase()
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private appendBloodResults(results: BloodResult[], p: ReturnType<MedicalsService['paths']>) {
    const headers = ['date', 'category', 'raw_name', 'value', 'unit', 'source_doc_id'];
    const rows = results.map((result) =>
      [
        result.date,
        result.category,
        result.raw_name,
        result.value.toString(),
        result.unit || '',
        result.source_doc_id,
      ]
        .map((value) => this.escapeCsv(value))
        .join(','),
    );

    const exists = fs.existsSync(p.bloodResultsPath);
    const content = `${exists ? '' : `${headers.join(',')}\n`}${rows.join('\n')}\n`;
    fs.appendFileSync(p.bloodResultsPath, content);
  }

  private extractAndStoreDnaResults(text: string, date: string, docId: string, originalName?: string, p?: ReturnType<MedicalsService['paths']>) {
    if (!p) p = this.paths('default');
    const headers = [
      'date',
      'report_name',
      'company',
      'sample_date',
      'report_date',
      'key_findings',
      'source_doc_id',
    ];
    const rowObj = this.buildDnaRecordRow(text, date, docId, originalName);
    if (!rowObj) return;
    const row = [
      rowObj.date || '',
      rowObj.report_name || '',
      rowObj.company || '',
      rowObj.sample_date || '',
      rowObj.report_date || '',
      rowObj.key_findings || '',
      rowObj.source_doc_id || '',
    ]
      .map((value) => this.escapeCsv(String(value)))
      .join(',');

    const exists = fs.existsSync(p.dnaResultsPath);
    const content = `${exists ? '' : `${headers.join(',')}\n`}${row}\n`;
    fs.appendFileSync(p.dnaResultsPath, content);
  }

  private extractAndStoreMedicalRecord(text: string, date: string, docId: string, originalName?: string, p?: ReturnType<MedicalsService['paths']>) {
    if (!p) p = this.paths('default');
    const headers = [
      'date',
      'title',
      'provider',
      'visit_date',
      'diagnosis',
      'procedure',
      'medications',
      'notes',
      'source_doc_id',
    ];
    const rowObj = this.buildMedicalRecordRow(text, date, docId, originalName);
    if (!rowObj) return;
    const row = [
      rowObj.date || '',
      rowObj.title || '',
      rowObj.provider || '',
      rowObj.visit_date || '',
      rowObj.diagnosis || '',
      rowObj.procedure || '',
      rowObj.medications || '',
      rowObj.notes || '',
      rowObj.source_doc_id || '',
    ]
      .map((value) => this.escapeCsv(String(value)))
      .join(',');

    const exists = fs.existsSync(p.recordsResultsPath);
    const content = `${exists ? '' : `${headers.join(',')}\n`}${row}\n`;
    fs.appendFileSync(p.recordsResultsPath, content);
  }

  private loadCategories(p?: ReturnType<MedicalsService['paths']>): BloodCategory[] {
    if (!p) p = this.paths('default');
    if (!fs.existsSync(p.bloodCategoriesPath)) {
      const defaults = this.defaultCategories();
      fs.writeFileSync(p.bloodCategoriesPath, JSON.stringify(defaults, null, 2));
      return defaults;
    }
    const raw = fs.readFileSync(p.bloodCategoriesPath, 'utf-8');
    return JSON.parse(raw) as BloodCategory[];
  }

  private saveCategories(categories: BloodCategory[], p?: ReturnType<MedicalsService['paths']>) {
    if (!p) p = this.paths('default');
    fs.writeFileSync(p.bloodCategoriesPath, JSON.stringify(categories, null, 2));
  }

  private defaultCategories(): BloodCategory[] {
    const now = new Date().toISOString();
    return [
      { id: 'cat_hemoglobin', canonical: 'Hemoglobin', synonyms: ['Hb', 'HGB'], createdAt: now, updatedAt: now },
      { id: 'cat_hematocrit', canonical: 'Hematocrit', synonyms: ['HCT'], createdAt: now, updatedAt: now },
      { id: 'cat_creatinine', canonical: 'Creatinine', synonyms: ['CREA'], createdAt: now, updatedAt: now },
      { id: 'cat_alt', canonical: 'ALT', synonyms: ['Alanine aminotransferase'], createdAt: now, updatedAt: now },
      { id: 'cat_ast', canonical: 'AST', synonyms: ['Aspartate aminotransferase'], createdAt: now, updatedAt: now },
      { id: 'cat_glucose', canonical: 'Glucose', synonyms: ['Blood glucose'], createdAt: now, updatedAt: now },
      { id: 'cat_cholesterol', canonical: 'Cholesterol', synonyms: ['Total cholesterol'], createdAt: now, updatedAt: now },
      { id: 'cat_hdl', canonical: 'HDL Cholesterol', synonyms: ['HDL'], createdAt: now, updatedAt: now },
      { id: 'cat_ldl', canonical: 'LDL Cholesterol', synonyms: ['LDL'], createdAt: now, updatedAt: now },
      { id: 'cat_triglycerides', canonical: 'Triglycerides', synonyms: ['TG'], createdAt: now, updatedAt: now },
    ];
  }

  private getDriveFolderId(type?: MedicalDocumentType): string | undefined {
    if (type === 'records' || type === 'reports') {
      return (
        this.configService.get<string>('MEDICALS_DRIVE_RECORDS_FOLDER_ID') ||
        this.configService.get<string>('MEDICALS_DRIVE_REPORTS_FOLDER_ID') ||
        this.configService.get<string>('GOOGLE_DRIVE_MEDICAL_FOLDER_ID')
      );
    }
    if (type === 'bloods') {
      return (
        this.configService.get<string>('MEDICALS_DRIVE_BLOODS_FOLDER_ID') ||
        this.configService.get<string>('GOOGLE_DRIVE_MEDICAL_FOLDER_ID')
      );
    }
    if (type === 'dna') {
      return (
        this.configService.get<string>('MEDICALS_DRIVE_DNA_FOLDER_ID') ||
        this.configService.get<string>('GOOGLE_DRIVE_MEDICAL_FOLDER_ID')
      );
    }
    return (
      this.configService.get<string>('MEDICALS_DRIVE_FOLDER_ID') ||
      this.configService.get<string>('GOOGLE_DRIVE_MEDICAL_FOLDER_ID')
    );
  }

  private scanPdfFiles(rootPath: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(rootPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.scanPdfFiles(fullPath));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  private resolveTypeFromPath(relativePath: string, fallback?: MedicalDocumentType): MedicalDocumentType {
    if (fallback) return fallback;
    const lowered = relativePath.toLowerCase();
    if (lowered.includes('blood')) return 'bloods';
    if (lowered.includes('dna') || lowered.includes('genetic') || lowered.includes('genome')) return 'dna';
    if (lowered.includes('record') || lowered.includes('report') || lowered.includes('medical')) return 'records';
    return 'records';
  }

  private async listDriveFolderRecursive(
    drive: drive_v3.Drive,
    folderId: string,
    currentPath: string,
  ): Promise<Array<{ id: string; name: string; relativePath: string; modifiedTime?: string | null }>> {
    const items: Array<{ id: string; name: string; relativePath: string; modifiedTime?: string | null }> = [];
    let pageToken: string | undefined;

    do {
      const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
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
          const nested = await this.listDriveFolderRecursive(drive, file.id, folderPath);
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

  private resolveDocumentDateFromText(text?: string, fallbackText?: string): string | undefined {
    if (text) {
      const lines = text.split('\n');
      const labelMatchers = [
        'collection date',
        'collected',
        'sample date',
        'report date',
        'received date',
        'result date',
        'visit date',
        'encounter date',
        'consultation date',
      ];
      for (const line of lines) {
        const lowered = line.toLowerCase();
        if (lowered.includes('dob') || lowered.includes('age/sex/dob')) continue;
        if (!labelMatchers.some((label) => lowered.includes(label))) continue;
        const parsed = this.parseDateFromString(line, 2000);
        if (parsed) return parsed;
      }
      for (const line of lines) {
        const lowered = line.toLowerCase();
        if (lowered.includes('dob') || lowered.includes('age/sex/dob')) continue;
        const parsed = this.parseDateFromString(line, 2000);
        if (parsed) return parsed;
      }
    }
    if (fallbackText) {
      return this.parseDateFromString(fallbackText, 2000);
    }
    return undefined;
  }

  private parseDateFromString(value: string, minYear: number = 1900): string | undefined {
    const isoMatch = value.match(/(\d{4})[/-](\d{2})[/-](\d{2})/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      if (year < minYear) return undefined;
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    const dmyMatch = value.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
    if (dmyMatch) {
      const year = parseInt(dmyMatch[3], 10);
      if (year < minYear) return undefined;
      return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
    }
    const dmyShortMatch = value.match(/(\d{2})[/-](\d{2})[/-](\d{2})/);
    if (dmyShortMatch) {
      const yearNum = parseInt(dmyShortMatch[3], 10);
      const year = yearNum >= 70 ? 1900 + yearNum : 2000 + yearNum;
      if (year < minYear) return undefined;
      return `${year}-${dmyShortMatch[2]}-${dmyShortMatch[1]}`;
    }
    const monthMatch = value.match(
      /(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s*(\d{2,4})/i,
    );
    if (monthMatch) {
      const day = monthMatch[1].padStart(2, '0');
      const monthToken = monthMatch[2].toLowerCase();
      const yearToken = monthMatch[3];
      const yearNum = parseInt(yearToken, 10);
      const year = yearToken.length === 2 ? (yearNum >= 70 ? 1900 + yearNum : 2000 + yearNum) : yearNum;
      if (year < minYear) return undefined;
      const monthMap: Record<string, string> = {
        jan: '01',
        feb: '02',
        mar: '03',
        apr: '04',
        may: '05',
        jun: '06',
        jul: '07',
        aug: '08',
        sep: '09',
        sept: '09',
        oct: '10',
        nov: '11',
        dec: '12',
      };
      const month = monthMap[monthToken];
      if (month) {
        return `${year}-${month}-${day}`;
      }
    }
    const compactMatches = value.match(/(\d{8})/g) || [];
    for (const token of compactMatches) {
      const yearFirst = parseInt(token.slice(0, 4), 10);
      const monthMid = parseInt(token.slice(4, 6), 10);
      const dayLast = parseInt(token.slice(6, 8), 10);
      if (
        yearFirst >= minYear &&
        yearFirst <= 2100 &&
        monthMid >= 1 &&
        monthMid <= 12 &&
        dayLast >= 1 &&
        dayLast <= 31
      ) {
        return `${token.slice(0, 4)}-${token.slice(4, 6)}-${token.slice(6, 8)}`;
      }
      const dayFirst = parseInt(token.slice(0, 2), 10);
      const monthNext = parseInt(token.slice(2, 4), 10);
      const yearLast = parseInt(token.slice(4, 8), 10);
      if (
        yearLast >= minYear &&
        yearLast <= 2100 &&
        monthNext >= 1 &&
        monthNext <= 12 &&
        dayFirst >= 1 &&
        dayFirst <= 31
      ) {
        return `${token.slice(4, 8)}-${token.slice(2, 4)}-${token.slice(0, 2)}`;
      }
    }
    return undefined;
  }

  private normalizeDate(value?: string): string | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString().slice(0, 10);
  }

  private todayString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private createDocumentId(hash: string, date: string): string {
    return `${date.replace(/-/g, '')}_${hash.slice(0, 8)}`;
  }

  private hashBuffer(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private async extractTextFromPdf(buffer: Buffer): Promise<string> {
    const data = await pdfParse(buffer);
    return data.text || '';
  }

  private ensureDirectories(userId = 'default') {
    const p = this.paths(userId);
    const localMirrorRoot = this.configService.get<string>('MEDICAL_DRIVE_SYNC_ROOT', '/data/drive_sync/Medicals');
    const directories = [
      p.medicalRoot,
      path.join(p.medicalRoot, 'records'),
      path.join(p.medicalRoot, 'reports'),
      path.join(p.medicalRoot, 'bloods'),
      path.join(p.medicalRoot, 'dna'),
      p.medicalTextDir,
      p.medicalSummaryDir,
      path.join(p.root, 'metadata'),
      localMirrorRoot,
    ];
    directories.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }


  private loadDocuments(userId = 'default'): MedicalDocument[] {
    const p = this.paths(userId);
    if (!fs.existsSync(p.medicalDocsPath)) {
      return [];
    }
    const raw = fs.readFileSync(p.medicalDocsPath, 'utf-8');
    return JSON.parse(raw) as MedicalDocument[];
  }

  private saveDocument(document: MedicalDocument, userId = 'default') {
    const p = this.paths(userId);
    const documents = this.loadDocuments(userId);
    documents.push(document);
    fs.writeFileSync(p.medicalDocsPath, JSON.stringify(documents, null, 2));
  }

  // ── Folder management ─────────────────────────────────────────────────

  getFolders(userId = 'default'): import('./medicals.types').MedicalFolder[] {
    const p = this.paths(userId);
    const foldersPath = path.join(p.root, 'metadata', 'medical_folders.json');
    if (!fs.existsSync(foldersPath)) return [];
    try {
      return JSON.parse(fs.readFileSync(foldersPath, 'utf-8'));
    } catch {
      return [];
    }
  }

  createFolder(name: string, userId = 'default'): import('./medicals.types').MedicalFolder {
    const p = this.paths(userId);
    const foldersPath = path.join(p.root, 'metadata', 'medical_folders.json');
    const folders = this.getFolders(userId);
    const safeName = name.trim().replace(/[^a-zA-Z0-9 _\-().]/g, '').trim();
    if (!safeName) throw new Error('Invalid folder name');
    if (folders.find(f => f.name.toLowerCase() === safeName.toLowerCase())) {
      throw new Error('Folder already exists');
    }
    const folder: import('./medicals.types').MedicalFolder = {
      name: safeName,
      createdAt: new Date().toISOString(),
      documentCount: 0,
    };
    folders.push(folder);
    if (!fs.existsSync(path.dirname(foldersPath))) {
      fs.mkdirSync(path.dirname(foldersPath), { recursive: true });
    }
    fs.writeFileSync(foldersPath, JSON.stringify(folders, null, 2));
    return folder;
  }

  renameFolder(oldName: string, newName: string, userId = 'default'): void {
    const p = this.paths(userId);
    const foldersPath = path.join(p.root, 'metadata', 'medical_folders.json');
    const folders = this.getFolders(userId);
    const idx = folders.findIndex(f => f.name === oldName);
    if (idx === -1) throw new Error('Folder not found');
    const safeName = newName.trim().replace(/[^a-zA-Z0-9 _\-().]/g, '').trim();
    if (!safeName) throw new Error('Invalid folder name');
    folders[idx].name = safeName;
    fs.writeFileSync(foldersPath, JSON.stringify(folders, null, 2));
    // Update all docs in this folder
    const docs = this.loadDocuments(userId).map(d =>
      d.folder === oldName ? { ...d, folder: safeName } : d
    );
    fs.writeFileSync(p.medicalDocsPath, JSON.stringify(docs, null, 2));
  }

  deleteFolder(name: string, userId = 'default'): void {
    const p = this.paths(userId);
    const foldersPath = path.join(p.root, 'metadata', 'medical_folders.json');
    // Delete all docs in this folder
    const allDocs = this.loadDocuments(userId);
    const docsToDelete = allDocs.filter(d => d.folder === name);
    for (const doc of docsToDelete) {
      if (fs.existsSync(doc.filePath)) fs.unlinkSync(doc.filePath);
      if (fs.existsSync(doc.textPath)) fs.unlinkSync(doc.textPath);
    }
    const remaining = allDocs.filter(d => d.folder !== name);
    fs.writeFileSync(p.medicalDocsPath, JSON.stringify(remaining, null, 2));
    // Remove folder from index
    const folders = this.getFolders(userId).filter(f => f.name !== name);
    fs.writeFileSync(foldersPath, JSON.stringify(folders, null, 2));
  }

  deleteDocument(docId: string, userId = 'default'): void {
    const p = this.paths(userId);
    const docs = this.loadDocuments(userId);
    const doc = docs.find(d => d.id === docId);
    if (!doc) throw new Error('Document not found');
    if (fs.existsSync(doc.filePath)) fs.unlinkSync(doc.filePath);
    if (fs.existsSync(doc.textPath)) fs.unlinkSync(doc.textPath);
    const updated = docs.filter(d => d.id !== docId);
    fs.writeFileSync(p.medicalDocsPath, JSON.stringify(updated, null, 2));
    // Update folder document counts
    this.recalcFolderCounts(userId);
  }

  getDocumentFile(docId: string, userId = 'default'): { filePath: string; originalName: string } {
    const docs = this.loadDocuments(userId);
    const doc = docs.find(d => d.id === docId);
    if (!doc) throw new Error('Document not found');
    if (!fs.existsSync(doc.filePath)) throw new Error('File not found on disk');
    return { filePath: doc.filePath, originalName: doc.originalName };
  }

  async uploadToFolder(
    file: Express.Multer.File,
    dto: { folder: string; type?: MedicalDocumentType; date?: string; notes?: string },
    userId = 'default',
  ): Promise<{ document?: MedicalDocument; documents?: MedicalDocument[]; extracted?: number; skipped?: number }> {
    const ext = (file.originalname.includes('.')
      ? file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase()
      : '');

    if (ext === '.zip') {
      return this.extractZipToFolder(file, dto, userId);
    }

    const docType: MedicalDocumentType = this.inferUploadType(file.originalname, dto.type);
    const doc = await this.uploadDocument(file, { type: docType, date: dto.date, notes: dto.notes }, userId);
    const p = this.paths(userId);
    const docs = this.loadDocuments(userId);
    const idx = docs.findIndex(d => d.id === doc.id);
    if (idx !== -1) {
      docs[idx].folder = dto.folder;
      fs.writeFileSync(p.medicalDocsPath, JSON.stringify(docs, null, 2));
    }
    this.recalcFolderCounts(userId);
    return { document: { ...doc, folder: dto.folder } };
  }

  async previewExtraction(
    file: Express.Multer.File,
    dto: { type?: MedicalDocumentType; date?: string },
    userId = 'default',
  ): Promise<{
    type: MedicalDocumentType;
    date: string;
    sourceDocId: string;
    extractedRows: number;
    sampleRows: Array<Record<string, string | number>>;
    warning?: string;
  }> {
    const p = this.paths(userId);
    this.ensureDirectories(userId);
    const ext = (file.originalname.includes('.')
      ? file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase()
      : '');
    if (ext === '.zip') {
      throw new Error('Preview is not supported for ZIP archives. Upload individual documents to review extracted rows first.');
    }

    const type: MedicalDocumentType = this.inferUploadType(file.originalname, dto.type);
    const hash = this.hashBuffer(file.buffer);
    const text = ext === '.pdf' ? await this.extractTextFromPdf(file.buffer) : '';
    const date = dto.date || this.resolveDocumentDateFromText(text, file.originalname) || this.todayString();
    const sourceDocId = this.createDocumentId(hash, date);

    if (type === 'bloods') {
      const categories = this.loadCategories(p);
      const rows = this.parseBloodResults(text, date, sourceDocId, categories).map((row) => ({
        date: row.date,
        category: row.category,
        raw_name: row.raw_name,
        value: row.value,
        unit: row.unit || '',
        source_doc_id: row.source_doc_id,
      }));
      return {
        type,
        date,
        sourceDocId,
        extractedRows: rows.length,
        sampleRows: rows.slice(0, 20),
        warning: !text ? 'No PDF text extracted from this file.' : undefined,
      };
    }

    if (type === 'dna') {
      const row = this.buildDnaRecordRow(text, date, sourceDocId, file.originalname);
      return {
        type,
        date,
        sourceDocId,
        extractedRows: row ? 1 : 0,
        sampleRows: row ? [row] : [],
        warning: !text ? 'No PDF text extracted from this file.' : undefined,
      };
    }

    const row = this.buildMedicalRecordRow(text, date, sourceDocId, file.originalname);
    return {
      type,
      date,
      sourceDocId,
      extractedRows: row ? 1 : 0,
      sampleRows: row ? [row] : [],
      warning: !text ? 'No PDF text extracted from this file.' : undefined,
    };
  }

  private async extractZipToFolder(
    file: Express.Multer.File,
    dto: { folder: string; type?: MedicalDocumentType; date?: string; notes?: string },
    userId = 'default',
  ): Promise<{ documents: MedicalDocument[]; extracted: number; skipped: number }> {
    let zip: AdmZip;
    try {
      // Copy buffer to ensure it starts at byteOffset 0 — adm-zip can fail on sub-views
      const buf = Buffer.from(file.buffer.buffer, file.buffer.byteOffset, file.buffer.byteLength);
      zip = new AdmZip(buf);
    } catch (err: any) {
      throw new Error(`Invalid or corrupt ZIP file: ${err?.message ?? err}`);
    }

    const entries = zip.getEntries();
    const uploaded: MedicalDocument[] = [];
    let skipped = 0;
    const skippedExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.ds_store', '.thumbs_db'];

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const entryName = path.basename(entry.entryName);
      // Skip macOS metadata folders (anywhere in path) and hidden files
      if (entry.entryName.includes('__MACOSX') || entryName.startsWith('.')) { skipped++; continue; }
      const entryExt = entryName.includes('.')
        ? entryName.slice(entryName.lastIndexOf('.')).toLowerCase()
        : '';
      if (skippedExts.includes(entryExt)) { skipped++; continue; }

      let buffer: Buffer;
      try {
        buffer = entry.getData();
      } catch { skipped++; continue; }

      if (!buffer || buffer.length === 0) { skipped++; continue; }

      const multerFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: entryName,
        encoding: '7bit',
        mimetype: 'application/octet-stream',
        buffer,
        size: buffer.length,
        stream: null as any,
        destination: '',
        filename: entryName,
        path: '',
      };

      try {
        const docType: MedicalDocumentType = this.inferUploadType(entryName, dto.type);
        const doc = await this.uploadDocument(multerFile, { type: docType, date: dto.date, notes: dto.notes }, userId);
        const p = this.paths(userId);
        const docs = this.loadDocuments(userId);
        const idx = docs.findIndex(d => d.id === doc.id);
        if (idx !== -1) {
          docs[idx].folder = dto.folder;
          fs.writeFileSync(p.medicalDocsPath, JSON.stringify(docs, null, 2));
        }
        uploaded.push({ ...doc, folder: dto.folder });
      } catch { skipped++; }
    }

    this.recalcFolderCounts(userId);
    return { documents: uploaded, extracted: uploaded.length, skipped };
  }

  private recalcFolderCounts(userId = 'default'): void {
    const p = this.paths(userId);
    const foldersPath = path.join(p.root, 'metadata', 'medical_folders.json');
    if (!fs.existsSync(foldersPath)) return;
    const folders = this.getFolders(userId);
    const docs = this.loadDocuments(userId);
    const updated = folders.map(f => ({
      ...f,
      documentCount: docs.filter(d => d.folder === f.name).length,
    }));
    fs.writeFileSync(foldersPath, JSON.stringify(updated, null, 2));
  }

  getDocumentsInFolder(folder: string, userId = 'default'): MedicalDocument[] {
    return this.loadDocuments(userId)
      .filter(d => d.folder === folder)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private appendCsvRow(filePath: string, headers: string[], row: Record<string, string>) {
    const exists = fs.existsSync(filePath);
    if (!exists) {
      fs.writeFileSync(filePath, `${headers.join(',')}\n`);
    }
    const line = headers.map((header) => this.escapeCsv(row[header] ?? '')).join(',');
    fs.appendFileSync(filePath, `${line}\n`);
  }

  private normalizeFileTitle(filename?: string): string | undefined {
    if (!filename) return undefined;
    const base = filename.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ').trim();
    return base || undefined;
  }

  private extractFieldFromLabels(text: string, labels: string[]): string | undefined {
    if (!text) return undefined;
    for (const label of labels) {
      const pattern = new RegExp(`${this.escapeRegex(label)}\\s*[:\\-]\\s*([^\n]+)`, 'i');
      const match = text.match(pattern);
      if (match?.[1]) {
        const value = match[1].replace(/\s+/g, ' ').trim();
        if (value) return value;
      }
    }
    return undefined;
  }

  private extractLineByKeywords(text: string, keywords: string[]): string | undefined {
    const lines = this.cleanTextLines(text);
    const loweredKeywords = keywords.map((keyword) => keyword.toLowerCase());
    const line = lines.find((candidate) =>
      loweredKeywords.some((keyword) => candidate.toLowerCase().includes(keyword)),
    );
    return line || undefined;
  }

  private extractImportantLines(text: string, keywords: string[], maxLines: number): string | undefined {
    const lines = this.cleanTextLines(text);
    const loweredKeywords = keywords.map((keyword) => keyword.toLowerCase());
    const matches = lines.filter((candidate) =>
      loweredKeywords.some((keyword) => candidate.toLowerCase().includes(keyword)),
    );
    const unique = Array.from(new Set(matches));
    if (unique.length === 0) return undefined;
    return unique.slice(0, maxLines).join(' | ');
  }

  private extractDnaFindings(text: string): string | undefined {
    const primary = this.extractImportantLines(
      text,
      [
        'variant',
        'mutation',
        'gene',
        'risk',
        'carrier',
        'allele',
        'genotype',
        'pathogenic',
        'benign',
        'likely',
        'interpretation',
        'summary',
        'conclusion',
        'recommendation',
        'result',
        'polygenic',
      ],
      6,
    );
    const summary = this.extractImportantLines(
      text,
      ['summary', 'conclusion', 'interpretation', 'recommendation', 'result'],
      3,
    );
    const combined = [summary, primary].filter(Boolean).join(' | ');
    return this.cleanDnaFindings(combined);
  }

  private normalizeDateField(value?: string): string | undefined {
    if (!value) return undefined;
    return this.parseDateFromString(value, 2000);
  }

  private inferUploadType(originalName: string, preferred?: MedicalDocumentType): MedicalDocumentType {
    const name = (originalName || '').toLowerCase();
    if (preferred === 'bloods' || preferred === 'dna') return preferred;
    if (preferred === 'reports') return 'records';

    // Blood-lab filename patterns (Pathcare/Lab refs and common blood panel terms)
    if (
      /(?:^|[^a-z])(br|hr|is|bs)\d{5}/i.test(originalName) ||
      /(blood|pathcare|ck result|creatinine|cholesterol|hba1c|lipid|egfr|urea|potassium|sodium)/i.test(name)
    ) {
      return 'bloods';
    }

    // DNA/genetics report patterns
    if (/(dna|genetic|genome|mitochond|mtseq|mtdel)/i.test(name)) {
      return 'dna';
    }

    return 'records';
  }

  private buildDnaRecordRow(
    text: string,
    date: string,
    docId: string,
    originalName?: string,
  ): Record<string, string> | null {
    const reportName =
      this.extractFieldFromLabels(text, ['Report Name', 'Report', 'Test Name', 'Test', 'Panel']) ||
      this.normalizeFileTitle(originalName);
    const cleanedReportName = reportName?.replace(/^testreport\s*/i, '').trim();
    const company = this.extractFieldFromLabels(text, ['Company', 'Laboratory', 'Provider', 'Lab']);
    const sampleDate = this.normalizeDateField(
      this.extractFieldFromLabels(text, ['Sample Date', 'Collection Date', 'Collected', 'Specimen']),
    );
    const reportDate = this.normalizeDateField(
      this.extractFieldFromLabels(text, ['Report Date', 'Date Reported', 'Result Date']),
    );
    const keyFindings = this.extractDnaFindings(text);
    if (!cleanedReportName && !company && !sampleDate && !reportDate && !keyFindings) return null;
    return {
      date,
      report_name: cleanedReportName || reportName || '',
      company: company || '',
      sample_date: sampleDate || '',
      report_date: reportDate || '',
      key_findings: keyFindings || '',
      source_doc_id: docId,
    };
  }

  private buildMedicalRecordRow(
    text: string,
    date: string,
    docId: string,
    originalName?: string,
  ): Record<string, string> | null {
    const title =
      this.extractFieldFromLabels(text, ['Title', 'Report', 'Summary', 'Visit', 'Encounter', 'Discharge Summary']) ||
      this.normalizeFileTitle(originalName);
    const provider = this.extractFieldFromLabels(text, [
      'Provider',
      'Physician',
      'Doctor',
      'Clinic',
      'Facility',
      'Hospital',
    ]);
    const visitDate = this.extractFieldFromLabels(text, [
      'Visit Date',
      'Date of Service',
      'Service Date',
      'Encounter Date',
      'Admission Date',
    ]);
    const diagnosis = this.extractLineByKeywords(text, ['diagnosis', 'assessment', 'impression']);
    const procedure = this.extractLineByKeywords(text, ['procedure', 'surgery', 'operation', 'performed']);
    const medications = this.extractLineByKeywords(text, ['medication', 'prescription', 'rx', 'drug']);
    const notes = this.extractImportantLines(
      text,
      ['plan', 'follow-up', 'recommendation', 'allergy', 'history', 'result', 'summary'],
      4,
    );
    if (!title && !provider && !visitDate && !diagnosis && !procedure && !medications && !notes) return null;
    return {
      date,
      title: title || '',
      provider: provider || '',
      visit_date: visitDate || '',
      diagnosis: diagnosis || '',
      procedure: procedure || '',
      medications: medications || '',
      notes: notes || '',
      source_doc_id: docId,
    };
  }

  private cleanDnaFindings(value?: string): string | undefined {
    if (!value) return undefined;
    const noisePhrases = [
      'not intended',
      'for informational purposes',
      'does not provide medical advice',
      'consult your healthcare',
      'confidential',
      'copyright',
      'all rights reserved',
      'sample number',
      'report generated',
      'page ',
      'dna risk',
      'dna mind',
      'dna core',
      'how to read your results',
      'you will find your genetic results',
      'sufficient quantities',
      'polymorphisms',
    ];
    const mustHaveKeywords = [
      'variant',
      'mutation',
      'gene',
      'risk',
      'carrier',
      'pathogenic',
      'benign',
      'allele',
      'genotype',
    ];
    const parts = value
      .split('|')
      .map((part) => part.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const filtered = parts.filter((part) => {
      const lowered = part.toLowerCase();
      if (noisePhrases.some((phrase) => lowered.includes(phrase))) return false;
      const isLong = part.length > 240;
      if (isLong && !mustHaveKeywords.some((keyword) => lowered.includes(keyword))) {
        return false;
      }
      return true;
    });
    const unique = Array.from(new Set(filtered));
    if (unique.length === 0) return undefined;
    return unique.slice(0, 6).join(' | ');
  }

  private cleanTextLines(text: string): string[] {
    return text
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => line.length > 0 && !this.isNoiseLine(line));
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values.map((value) => value.trim());
  }

  private async loadDocumentText(doc: MedicalDocument): Promise<string | null> {
    if (doc.textPath && fs.existsSync(doc.textPath)) {
      return fs.readFileSync(doc.textPath, 'utf-8');
    }
    if (doc.filePath && fs.existsSync(doc.filePath)) {
      const buffer = fs.readFileSync(doc.filePath);
      return this.extractTextFromPdf(buffer);
    }
    return null;
  }

  private isDnaDocument(doc: MedicalDocument): boolean {
    const name = `${doc.originalName || ''} ${doc.filename || ''} ${doc.sourceRef || ''}`.toLowerCase();
    return name.includes('dna') || name.includes('genetic') || name.includes('genome');
  }
}
