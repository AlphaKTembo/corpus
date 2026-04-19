import { Controller, Post, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IngestService } from './ingest.service';

@Controller('ingest')
@UseGuards(JwtAuthGuard)
export class IngestController {
  constructor(private ingestService: IngestService) {}

  @Post('sync')
  async triggerSync() {
    return this.ingestService.triggerSync();
  }

  @Get('status')
  async getStatus(@Request() req: any) {
    return this.ingestService.getStatus(req.user.id);
  }
}
