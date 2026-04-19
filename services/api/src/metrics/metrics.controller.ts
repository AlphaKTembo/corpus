import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MetricsService } from './metrics.service';

@Controller('metrics')
@UseGuards(JwtAuthGuard)
export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  @Get('vitals')
  async getVitals(@Query('from') from?: string, @Query('to') to?: string, @Request() req?: any) {
    return this.metricsService.getVitals(from, to, req?.user?.id);
  }

  @Get('sleep')
  async getSleep(@Query('from') from?: string, @Query('to') to?: string, @Request() req?: any) {
    return this.metricsService.getSleep(from, to, req?.user?.id);
  }

  @Get('body')
  async getBodyMetrics(@Query('from') from?: string, @Query('to') to?: string, @Request() req?: any) {
    return this.metricsService.getBodyMetrics(from, to, req?.user?.id);
  }

  @Get('form-scores')
  async getFormScores(@Query('from') from?: string, @Query('to') to?: string, @Request() req?: any) {
    return this.metricsService.getFormScores(from, to, req?.user?.id);
  }
}
