import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SummaryService } from './summary.service';

@Controller('summary')
@UseGuards(JwtAuthGuard)
export class SummaryController {
  constructor(private summaryService: SummaryService) {}

  @Get('today')
  async getToday(@Request() req: any) {
    return this.summaryService.getTodayBrief(req.user.id);
  }

  @Get('rolling')
  async getRolling(@Query('days') days?: string, @Request() req?: any) {
    const daysNum = days ? parseInt(days, 10) : 28;
    return this.summaryService.getRollingSummary(daysNum, req?.user?.id);
  }
}
