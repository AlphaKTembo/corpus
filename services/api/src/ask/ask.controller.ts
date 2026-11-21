import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Request,
  ServiceUnavailableException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ApiKeyGuard } from '../assistant/api-key.guard';
import { AskService } from './ask.service';

class AskDateRangeDto {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

export class AskDto {
  @IsString() question: string;
  @IsOptional() @IsString() key?: string; // consumed by ApiKeyGuard, ignored here
  @IsOptional() @ValidateNested() @Type(() => AskDateRangeDto) dateRange?: AskDateRangeDto;
  @IsOptional() @IsString() activityId?: string;
  @IsOptional() @IsString() timeZone?: string;
  @IsOptional() @IsNumber() days?: number;
  @IsOptional() @IsNumber() activityLimit?: number;
  @IsOptional() @IsBoolean() includeContext?: boolean;
}

@Controller('ask')
@UseGuards(ApiKeyGuard)
export class AskController {
  constructor(private askService: AskService) {}

  private detectLatencyProfile(req: any): 'default' | 'mobile' {
    const clientPlatform = String(req?.headers?.['x-client-platform'] || '').toLowerCase();
    if (
      clientPlatform.includes('mobile') ||
      clientPlatform.includes('android') ||
      clientPlatform.includes('ios')
    ) {
      return 'mobile';
    }

    const userAgent = String(req?.headers?.['user-agent'] || '').toLowerCase();
    if (
      userAgent.includes('dart/') ||
      userAgent.includes('flutter') ||
      userAgent.includes('okhttp') ||
      userAgent.includes('cfnetwork') ||
      userAgent.includes('mobile')
    ) {
      return 'mobile';
    }

    return 'default';
  }

  private rethrowFriendly(err: any): never {
    const msg = String(err?.message || '');
    if (
      msg.includes('insufficient_quota') ||
      msg.includes('OpenAI request failed: 429') ||
      msg.includes('Anthropic request failed: 429') ||
      msg.includes('Ideogram request failed: 429')
    ) {
      throw new ServiceUnavailableException(
        'AI service is temporarily unavailable due to API quota limits. Please try again shortly.',
      );
    }
    if (msg.includes('Anthropic request failed: 404') && msg.toLowerCase().includes('model')) {
      throw new ServiceUnavailableException(
        'AI model configuration is unavailable right now. Please try again shortly.',
      );
    }
    if (
      msg.includes('Audio transcription is unavailable') ||
      msg.includes('Whisper transcription failed')
    ) {
      throw new ServiceUnavailableException(msg);
    }
    if (msg.includes('No file provided') || msg.includes('No question provided')) {
      throw new BadRequestException(msg);
    }
    throw err;
  }

  @Post()
  async ask(@Body() dto: AskDto, @Request() req: any) {
    const userId = req.user?.id || 'default';
    const userName: string = req.user?.username || req.user?.email || 'the user';
    const latencyProfile = this.detectLatencyProfile(req);
    try {
      return this.askService.ask(dto.question, dto.dateRange, dto.activityId, {
        days: dto.days,
        activityLimit: dto.activityLimit,
        includeContext: dto.includeContext,
        timeZone: dto.timeZone,
        latencyProfile,
      }, userId, userName);
    } catch (err: any) {
      this.rethrowFriendly(err);
    }
  }

  @Post('with-file')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async askWithFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('question') question: string,
    @Request() req: any,
    @Body('mode') mode?: string,
  ) {
    if (!file) throw new BadRequestException('No file provided.');
    if (!question?.trim()) throw new BadRequestException('No question provided.');
    const userId = req.user?.id || 'default';
    const userName: string = req.user?.username || req.user?.email || 'the user';
    try {
      return this.askService.askWithFile(
        question.trim(),
        file.buffer,
        file.originalname,
        userId,
        userName,
        mode === 'fuel-plan-image' ? 'fuel-plan-image' : undefined,
      );
    } catch (err: any) {
      this.rethrowFriendly(err);
    }
  }

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async transcribe(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No audio file provided.');
    try {
      const transcript = await this.askService.transcribeAudio(file.buffer, file.originalname);
      return { transcript };
    } catch (err: any) {
      this.rethrowFriendly(err);
    }
  }
}
