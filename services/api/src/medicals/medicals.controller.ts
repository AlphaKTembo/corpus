import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  Res,
  Req,
  UseGuards,
  Request,
} from '@nestjs/common';
import * as fs from 'fs';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MedicalsService } from './medicals.service';
import { MedicalDocumentType } from './medicals.types';

const MEDICAL_DOCUMENT_TYPES = ['bloods', 'reports', 'dna', 'records'] as const;

class MedicalUploadDto {
  @IsIn(MEDICAL_DOCUMENT_TYPES)
  type: MedicalDocumentType;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() notes?: string;
}

class MedicalSyncDto {
  @IsOptional() @IsIn(MEDICAL_DOCUMENT_TYPES) type?: MedicalDocumentType;
  @IsOptional() @IsString() folderId?: string;
  @IsOptional() @IsString() folderPath?: string;
  @IsOptional() @IsString() rootPath?: string;
}

class MedicalAskDto {
  @IsString() question: string;
  @IsOptional() @IsIn(MEDICAL_DOCUMENT_TYPES) type?: MedicalDocumentType;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() docIds?: string[];
}

class MedicalSummaryDto {
  @IsOptional() @IsString() date?: string;
}

class MedicalCoverLetterDto {
  @IsString() text: string;
}

class MedicalLactateThresholdDto {
  @IsOptional() @IsString() date?: string;
  @IsString() value: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() notes?: string;
}

class MedicalFtpDto {
  @IsOptional() @IsString() date?: string;
  @IsString() value: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() notes?: string;
}

class MedicalLocalPullDto {
  @IsOptional() @IsIn(MEDICAL_DOCUMENT_TYPES) type?: MedicalDocumentType;
  @IsOptional() @IsString() rootPath?: string;
  @IsOptional() @IsString() includeContent?: string;
  @IsOptional() @IsString() maxBytes?: string;
  @IsOptional() @IsString() includeChunks?: string;
  @IsOptional() @IsString() chunkBytes?: string;
}

@Controller('medicals')
@UseGuards(JwtAuthGuard)
export class MedicalsController {
  constructor(private medicalsService: MedicalsService) {}

  private isLikelyMobileRequest(req: any): boolean {
    const clientPlatform = String(req?.headers?.['x-client-platform'] || '').toLowerCase();
    if (
      clientPlatform.includes('mobile') ||
      clientPlatform.includes('android') ||
      clientPlatform.includes('ios')
    ) {
      return true;
    }
    const userAgent = String(req?.headers?.['user-agent'] || '').toLowerCase();
    return (
      userAgent.includes('dart/') ||
      userAgent.includes('flutter') ||
      userAgent.includes('okhttp') ||
      userAgent.includes('cfnetwork') ||
      userAgent.includes('mobile')
    );
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File, @Body() dto: MedicalUploadDto, @Request() req: any) {
    return this.medicalsService.uploadDocument(file, dto, req.user.id);
  }

  @Post('sync/google-drive')
  async syncGoogleDrive(@Body() dto: MedicalSyncDto, @Request() req: any) {
    return this.medicalsService.syncFromGoogleDrive({ folderId: dto.folderId, type: dto.type }, req.user.id);
  }

  @Post('sync/dropbox')
  async syncDropbox(@Body() dto: MedicalSyncDto, @Request() req: any) {
    return this.medicalsService.syncFromDropbox({ folderPath: dto.folderPath, type: dto.type }, req.user.id);
  }

  @Post('sync/local')
  async syncLocal(@Body() dto: MedicalSyncDto, @Request() req: any) {
    return this.medicalsService.syncFromLocalFolder({ rootPath: dto.rootPath, type: dto.type }, req.user.id);
  }

  @Get('documents')
  async getDocuments(
    @Query('type') type?: MedicalDocumentType,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Request() req?: any,
  ) {
    const documents = this.medicalsService.getDocuments(type, from, to, req?.user?.id);
    return { documents };
  }

  @Get('local/files')
  async getLocalFiles(
    @Req() req: any,
    @Query('type') type?: MedicalDocumentType,
    @Query('rootPath') rootPath?: string,
    @Query('includeContent') includeContent?: string,
    @Query('maxBytes') maxBytes?: string,
    @Query('includeChunks') includeChunks?: string,
    @Query('chunkBytes') chunkBytes?: string,
    @Query('token') token?: string,
  ) {
    const headerToken = req.headers?.['x-sync-token'] || token;
    this.medicalsService.assertSyncToken(headerToken);
    const files = this.medicalsService.listLocalFiles({
      rootPath,
      type,
      includeContent: includeContent === '1' || includeContent === 'true',
      maxBytes: maxBytes ? parseInt(maxBytes, 10) : undefined,
      includeChunks: includeChunks === '1' || includeChunks === 'true',
      chunkBytes: chunkBytes ? parseInt(chunkBytes, 10) : undefined,
    });
    return { files };
  }

  @Get('local/file')
  async downloadLocalFile(
    @Req() req: any,
    @Res() res: Response,
    @Query('path') filePath?: string,
    @Query('rootPath') rootPath?: string,
    @Query('token') token?: string,
  ) {
    const headerToken = req.headers?.['x-sync-token'] || token;
    this.medicalsService.assertSyncToken(headerToken);
    if (!filePath) {
      return res.status(400).json({ error: 'Missing file path.' });
    }
    const resolved = this.medicalsService.resolveLocalFilePath({ rootPath, relativePath: filePath });
    return res.download(resolved);
  }

  @Post('local/pull')
  async pullLocalFiles(@Req() req: any, @Body() dto: MedicalLocalPullDto, @Query('token') token?: string) {
    const headerToken = req.headers?.['x-sync-token'] || token;
    this.medicalsService.assertSyncToken(headerToken);
    const userId = req.user?.id;
    const sync = await this.medicalsService.syncFromLocalFolder({ rootPath: dto.rootPath, type: dto.type }, userId);
    const files = this.medicalsService.listLocalFiles({
      rootPath: dto.rootPath,
      type: dto.type,
      includeContent: dto.includeContent === '1' || dto.includeContent === 'true',
      maxBytes: dto.maxBytes ? parseInt(dto.maxBytes, 10) : undefined,
      includeChunks: dto.includeChunks === '1' || dto.includeChunks === 'true',
      chunkBytes: dto.chunkBytes ? parseInt(dto.chunkBytes, 10) : undefined,
    });
    return { sync, files };
  }

  @Get('blood-results')
  async getBloodResults(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('category') category?: string,
    @Request() req?: any,
  ) {
    const results = this.medicalsService.getBloodResults(from, to, category, req?.user?.id);
    return { results };
  }

  @Post('rebuild-csvs')
  async rebuildCsvs(@Request() req: any) {
    return this.medicalsService.rebuildMedicalCsvs(req.user.id);
  }

  @Post('extract-pending-csvs')
  async extractPendingCsvs(@Request() req: any) {
    return this.medicalsService.extractPendingMedicalCsvs(req.user.id);
  }

  @Post('ask')
  async ask(@Body() dto: MedicalAskDto, @Request() req: any) {
    return this.medicalsService.askMedicals(dto, req.user.id);
  }

  @Post('summary/generate')
  async generateSummary(@Body() dto: MedicalSummaryDto, @Request() req: any) {
    return this.medicalsService.generateDailySummary(dto.date, undefined, req.user.id);
  }

  @Get('cover-letter')
  async getCoverLetter(@Request() req: any) {
    return this.medicalsService.getCoverLetter(req.user.id);
  }

  @Post('cover-letter')
  async updateCoverLetter(@Body() dto: MedicalCoverLetterDto, @Request() req: any) {
    return this.medicalsService.updateCoverLetter(dto.text, req.user.id);
  }

  @Get('lactate-threshold')
  async getLactateThresholds(@Request() req: any) {
    const records = this.medicalsService.getLactateThresholds(req.user.id);
    return { records };
  }

  @Post('lactate-threshold')
  async addLactateThreshold(@Body() dto: MedicalLactateThresholdDto, @Request() req: any) {
    const record = this.medicalsService.addLactateThreshold({ ...dto, userId: req.user.id });
    return { record };
  }

  @Get('ftp')
  async getFtpRecords(@Request() req: any) {
    const records = this.medicalsService.getFtpRecords(req.user.id);
    return { records };
  }

  @Post('ftp')
  async addFtp(@Body() dto: MedicalFtpDto, @Request() req: any) {
    const record = this.medicalsService.addFtp({ ...dto, userId: req.user.id });
    return { record };
  }

  @Get('summary/latest')
  async getLatestSummary(@Request() req: any) {
    const summary = this.medicalsService.getLatestSummary(req.user.id);
    if (!summary) return { summary: null };
    const payloadShareUrl = this.medicalsService.getPayloadShareUrl(summary.date);
    return {
      summary,
      pdfUrl: `/v1/medicals/summary/pdf?date=${summary.date}`,
      payloadUrl: `/v1/medicals/summary/payload?date=${summary.date}`,
      payloadShareUrl,
    };
  }

  @Get('summary/payload')
  async getSummaryPayload(
    @Res() res: Response,
    @Req() req: any,
    @Query('date') date?: string,
    @Query('refresh') refresh?: string,
    @Query('compact') compact?: string,
    @Query('raw') raw?: string,
    @Query('maxChars') maxChars?: string,
    @Query('maxPerDoc') maxPerDoc?: string,
  ) {
    const userId = req.user?.id;
    const isMobileRequest = this.isLikelyMobileRequest(req);
    let targetDate = date;
    const requestedRefresh = refresh === '1' || refresh === 'true';
    let shouldRefresh = requestedRefresh;
    const shouldCompact = compact !== '0' && compact !== 'false';
    const shouldRaw = raw === '1' || raw === 'true';
    const payloadMaxChars = maxChars ? parseInt(maxChars, 10) : undefined;
    const payloadMaxCharsPerDoc = maxPerDoc ? parseInt(maxPerDoc, 10) : undefined;
    const options = { payloadMaxChars, payloadMaxCharsPerDoc };
    if (requestedRefresh && isMobileRequest) {
      const cachedPayloadPath =
        this.medicalsService.getSummaryPayloadPath(targetDate, userId) ||
        this.medicalsService.getSummaryPayloadPath(undefined, userId);
      if (cachedPayloadPath) {
        // Mobile clients can have strict receive timeouts; serve cached payload fast
        // and refresh in the background.
        shouldRefresh = false;
        void this.medicalsService.generateDailySummary(targetDate, options, userId).catch((err: any) => {
          console.warn('[MedicalsController] Background summary refresh failed:', err?.message || err);
        });
      }
    }
    if (shouldRefresh) {
      // Refresh should regenerate payload even when no date is provided.
      // In that case the service defaults to today's date and returns it.
      const generated = await this.medicalsService.generateDailySummary(targetDate, options, userId);
      targetDate = generated.date;
    }

    let payloadPath = this.medicalsService.getSummaryPayloadPath(targetDate, userId);
    if (!payloadPath && targetDate) {
      await this.medicalsService.generateDailySummary(targetDate, options, userId);
      payloadPath = this.medicalsService.getSummaryPayloadPath(targetDate, userId);
    }
    if (!payloadPath) {
      return res.status(404).json({ error: 'Summary payload not found' });
    }
    if (shouldRaw) {
      if (payloadPath.endsWith('.json')) {
        const rawJson = await fs.promises.readFile(payloadPath, 'utf-8');
        return res.json(JSON.parse(rawJson));
      }
      return res.status(404).json({ error: 'Raw payload not found' });
    }
    if (shouldCompact) {
      const summaryPath = this.medicalsService.getSummaryJsonPath(targetDate, userId);
      if (summaryPath) {
        const rawFile = await fs.promises.readFile(summaryPath, 'utf-8');
        const summary = JSON.parse(rawFile);
        let payloadCreatedAt: string | undefined = undefined;
        let assistantContext: unknown = undefined;
        let csvRecords: unknown = undefined;
        if (payloadPath.endsWith('.json')) {
          const payloadRaw = await fs.promises.readFile(payloadPath, 'utf-8');
          const payloadJson = JSON.parse(payloadRaw);
          payloadCreatedAt = payloadJson.createdAt;
          assistantContext = payloadJson.assistantContext;
          csvRecords = payloadJson.csvRecords;
        }
        return res.json({
          date: summary.date,
          createdAt: payloadCreatedAt || summary.createdAt,
          text: summary.text,
          sourceCount: summary.sourceCount,
          fitnessMetricsIncluded: summary.fitnessMetricsIncluded,
          payloadUrl: `/v1/medicals/summary/payload?date=${summary.date}`,
          payloadShareUrl: this.medicalsService.getPayloadShareUrl(summary.date),
          assistantContext,
          csvRecords,
        });
      }
      if (payloadPath.endsWith('.json')) {
        const rawFile = await fs.promises.readFile(payloadPath, 'utf-8');
        const json = JSON.parse(rawFile);
        delete json.documents;
        delete json.contextUsed;
        delete json.payload;
        return res.json(json);
      }
    }
    if (payloadPath.endsWith('.json') && req.accepts?.('application/json')) {
      const rawFile = await fs.promises.readFile(payloadPath, 'utf-8');
      return res.json(JSON.parse(rawFile));
    }
    return res.sendFile(payloadPath);
  }

  @Get('summary/pdf')
  async downloadSummaryPdf(@Res() res: Response, @Query('date') date?: string, @Request() req?: any) {
    const filePath = this.medicalsService.getSummaryPdfPath(date, req?.user?.id);
    if (!filePath) {
      return res.status(404).json({ message: 'Summary PDF not found.' });
    }
    return res.download(filePath);
  }

  // ── Folder management ────────────────────────────────────────────────

  @Get('folders')
  async getFolders(@Request() req: any) {
    return { folders: this.medicalsService.getFolders(req.user.id) };
  }

  @Post('folders')
  async createFolder(@Body() body: { name: string }, @Request() req: any) {
    const folder = this.medicalsService.createFolder(body.name, req.user.id);
    return { folder };
  }

  @Patch('folders/:name')
  async renameFolder(@Param('name') name: string, @Body() body: { newName: string }, @Request() req: any) {
    this.medicalsService.renameFolder(name, body.newName, req.user.id);
    return { success: true };
  }

  @Delete('folders/:name')
  async deleteFolder(@Param('name') name: string, @Request() req: any) {
    this.medicalsService.deleteFolder(name, req.user.id);
    return { success: true };
  }

  @Get('folders/:name/documents')
  async getFolderDocuments(@Param('name') name: string, @Request() req: any) {
    return { documents: this.medicalsService.getDocumentsInFolder(name, req.user.id) };
  }

  @Post('folders/:name/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async uploadToFolder(
    @Param('name') name: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { type?: string; date?: string; notes?: string },
    @Request() req: any,
  ) {
    return this.medicalsService.uploadToFolder(
      file,
      { folder: name, type: body.type as any, date: body.date, notes: body.notes },
      req.user.id,
    );
  }

  @Post('folders/:name/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async previewFolderUpload(
    @Param('name') _name: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { type?: string; date?: string },
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('No file provided.');
    return this.medicalsService.previewExtraction(
      file,
      { type: body.type as any, date: body.date },
      req.user.id,
    );
  }

  @Delete('documents/:id')
  async deleteDocument(@Param('id') id: string, @Request() req: any) {
    this.medicalsService.deleteDocument(id, req.user.id);
    return { success: true };
  }

  @Get('documents/:id/download')
  async downloadDocument(@Param('id') id: string, @Res() res: Response, @Request() req: any) {
    const { filePath, originalName } = this.medicalsService.getDocumentFile(id, req.user.id);
    return res.download(filePath, originalName);
  }
}
