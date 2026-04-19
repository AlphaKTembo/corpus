import { Controller, Get, Query, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IntervalsIcuService } from './intervals-icu.service';
import { UsersService } from '../users/users.service';

@Controller('intervals-icu')
@UseGuards(JwtAuthGuard)
export class IntervalsIcuController {
  constructor(
    private readonly intervalsIcuService: IntervalsIcuService,
    private readonly usersService: UsersService,
  ) {}

  private async getUserCreds(req: any): Promise<{ apiKey?: string; athleteId?: string }> {
    const user = await this.usersService.findById(req.user.id);
    return { apiKey: user?.intervalsApiKey, athleteId: user?.intervalsAthleteId };
  }

  @Get('athlete')
  async getAthleteId(@Request() req: any) {
    const { athleteId } = await this.getUserCreds(req);
    const resolved = await this.intervalsIcuService.getAthleteId(athleteId);
    return { athleteId: resolved };
  }

  @Get('activities')
  async getActivities(
    @Request() req: any,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    const { apiKey, athleteId } = await this.getUserCreds(req);
    const activities = await this.intervalsIcuService.getActivities(startDate, endDate, apiKey, athleteId);
    return { success: true, count: activities.length, data: activities };
  }

  @Get('wellness')
  async getWellness(
    @Request() req: any,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    const { apiKey, athleteId } = await this.getUserCreds(req);
    const wellness = await this.intervalsIcuService.getWellness(startDate, endDate, apiKey, athleteId);
    return { success: true, count: wellness.length, data: wellness };
  }

  @Get('sync')
  async syncAllData(@Query('days') days?: string, @Request() req?: any) {
    const daysNum = days ? parseInt(days, 10) : 90;
    const { apiKey, athleteId } = await this.getUserCreds(req);
    return this.intervalsIcuService.syncAllData(daysNum, undefined, req?.user?.id, apiKey, athleteId);
  }

  @Get('zones/hr')
  async getHrZoneDistribution(
    @Request() req: any,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('sport') sport?: string,
  ) {
    const { apiKey, athleteId } = await this.getUserCreds(req);
    return { success: true, data: await this.intervalsIcuService.getHrZoneDistribution(startDate, endDate, sport, apiKey, athleteId) };
  }

  @Get('zones/power')
  async getPowerZoneDistribution(
    @Request() req: any,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('sport') sport?: string,
  ) {
    const { apiKey, athleteId } = await this.getUserCreds(req);
    return { success: true, data: await this.intervalsIcuService.getPowerZoneDistribution(startDate, endDate, sport, apiKey, athleteId) };
  }

  @Get('zones/pace')
  async getPaceZoneDistribution(
    @Request() req: any,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('sport') sport?: string,
  ) {
    const { apiKey, athleteId } = await this.getUserCreds(req);
    return { success: true, data: await this.intervalsIcuService.getPaceZoneDistribution(startDate, endDate, sport, apiKey, athleteId) };
  }

  @Get('zones/summary')
  async getZoneSummary(
    @Request() req: any,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('sport') sport?: string,
  ) {
    const { apiKey, athleteId } = await this.getUserCreds(req);
    return { success: true, data: await this.intervalsIcuService.getZoneSummary(startDate, endDate, sport, apiKey, athleteId) };
  }

  @Get('fitness')
  async getFitnessChart(
    @Request() req: any,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    const { apiKey, athleteId } = await this.getUserCreds(req);
    return { success: true, data: await this.intervalsIcuService.getFitnessChart(startDate, endDate, apiKey, athleteId) };
  }

  @Get('recovery')
  async getRecoveryScores(
    @Request() req: any,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    const { apiKey, athleteId } = await this.getUserCreds(req);
    return this.intervalsIcuService.getRecoveryScores(startDate, endDate, apiKey, athleteId);
  }

  @Get('activity/:id/streams')
  async getActivityStreams(@Param('id') activityId: string) {
    return { success: true, data: await this.intervalsIcuService.getActivityStreams(activityId) };
  }

  @Get('activity/:id/power-curve')
  async getActivityPowerCurve(@Param('id') activityId: string) {
    return { success: true, data: await this.intervalsIcuService.getActivityPowerCurve(activityId) };
  }

  @Get('power-curve')
  async getPowerCurve(
    @Request() req: any,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    const { apiKey, athleteId } = await this.getUserCreds(req);
    return { success: true, data: await this.intervalsIcuService.getAggregatePowerCurve(startDate, endDate, apiKey, athleteId) };
  }
}
