import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActivitiesService, ActivityQuery } from './activities.service';

@Controller('activities')
@UseGuards(JwtAuthGuard)
export class ActivitiesController {
  constructor(private activitiesService: ActivitiesService) {}

  @Get()
  async findAll(@Query() query: ActivityQuery, @Request() req: any) {
    return this.activitiesService.findActivities(query, req.user.id);
  }

  @Get('zones/summary')
  async getZoneSummary(@Request() req: any) {
    return this.activitiesService.getZoneSummary(req.user.id);
  }

  @Get('zones/latest')
  async getLatestZoneSummary(@Request() req: any) {
    return this.activitiesService.getLatestActivityZoneSummary(req.user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.activitiesService.findOne(id, req.user.id);
  }

  @Get(':id/streams')
  async getStreams(
    @Param('id') id: string,
    @Query('fields') fields?: string,
    @Query('downsample') downsample?: string,
  ) {
    const fieldArray = fields ? fields.split(',') : undefined;
    return this.activitiesService.getStreams(id, fieldArray, downsample);
  }
}
