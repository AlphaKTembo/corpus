import { BadRequestException, Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IntervalsIcuService } from './intervals-icu.service';
import { UsersService } from '../users/users.service';

const INTERVALS_PROBE_ENDPOINTS = [
  'athlete',
  'activities',
  'wellness',
  'zones_hr',
  'zones_power',
  'zones_pace',
  'zones_summary',
  'fitness',
  'recovery',
  'power_curve',
  'activity_streams',
  'activity_power_curve',
] as const;

class IntervalsProbeDto {
  @IsString()
  apiKey: string;

  @IsString()
  athleteId: string;

  @IsIn(INTERVALS_PROBE_ENDPOINTS)
  endpoint: (typeof INTERVALS_PROBE_ENDPOINTS)[number];

  @IsOptional()
  @IsString()
  start_date?: string;

  @IsOptional()
  @IsString()
  end_date?: string;

  @IsOptional()
  @IsString()
  sport?: string;

  @IsOptional()
  @IsString()
  activityId?: string;
}

@Controller('intervals-icu')
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
  @UseGuards(JwtAuthGuard)
  async getAthleteId(@Request() req: any) {
    const { athleteId } = await this.getUserCreds(req);
    const resolved = await this.intervalsIcuService.getAthleteId(athleteId);
    return { athleteId: resolved };
  }

  @Get('activities')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async syncAllData(@Query('days') days?: string, @Request() req?: any) {
    const daysNum = days ? parseInt(days, 10) : 90;
    const { apiKey, athleteId } = await this.getUserCreds(req);
    return this.intervalsIcuService.syncAllData(daysNum, undefined, req?.user?.id, apiKey, athleteId);
  }

  @Get('zones/hr')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async getFitnessChart(
    @Request() req: any,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    const { apiKey, athleteId } = await this.getUserCreds(req);
    return { success: true, data: await this.intervalsIcuService.getFitnessChart(startDate, endDate, apiKey, athleteId) };
  }

  @Get('recovery')
  @UseGuards(JwtAuthGuard)
  async getRecoveryScores(
    @Request() req: any,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    const { apiKey, athleteId } = await this.getUserCreds(req);
    return this.intervalsIcuService.getRecoveryScores(startDate, endDate, apiKey, athleteId);
  }

  @Post('probe')
  async probeEndpoint(@Body() dto: IntervalsProbeDto) {
    const apiKey = dto.apiKey?.trim();
    const athleteId = dto.athleteId?.trim();
    if (!apiKey) throw new BadRequestException('apiKey is required.');
    if (!athleteId) throw new BadRequestException('athleteId is required.');

    const startedAtMs = Date.now();
    let data: any = null;

    switch (dto.endpoint) {
      case 'athlete':
        data = await this.intervalsIcuService.getAthleteProfile(apiKey, athleteId);
        break;
      case 'activities':
        data = await this.intervalsIcuService.getActivities(dto.start_date, dto.end_date, apiKey, athleteId);
        break;
      case 'wellness':
        data = await this.intervalsIcuService.getWellness(dto.start_date, dto.end_date, apiKey, athleteId);
        break;
      case 'zones_hr':
        data = await this.intervalsIcuService.getHrZoneDistribution(
          dto.start_date,
          dto.end_date,
          dto.sport,
          apiKey,
          athleteId,
        );
        break;
      case 'zones_power':
        data = await this.intervalsIcuService.getPowerZoneDistribution(
          dto.start_date,
          dto.end_date,
          dto.sport,
          apiKey,
          athleteId,
        );
        break;
      case 'zones_pace':
        data = await this.intervalsIcuService.getPaceZoneDistribution(
          dto.start_date,
          dto.end_date,
          dto.sport,
          apiKey,
          athleteId,
        );
        break;
      case 'zones_summary':
        data = await this.intervalsIcuService.getZoneSummary(
          dto.start_date,
          dto.end_date,
          dto.sport,
          apiKey,
          athleteId,
        );
        break;
      case 'fitness':
        data = await this.intervalsIcuService.getFitnessChart(dto.start_date, dto.end_date, apiKey, athleteId);
        break;
      case 'recovery':
        data = await this.intervalsIcuService.getRecoveryScores(dto.start_date, dto.end_date, apiKey, athleteId);
        break;
      case 'power_curve':
        data = await this.intervalsIcuService.getAggregatePowerCurve(dto.start_date, dto.end_date, apiKey, athleteId);
        break;
      case 'activity_streams':
        if (!dto.activityId?.trim()) throw new BadRequestException('activityId is required for activity_streams.');
        data = await this.intervalsIcuService.getActivityStreams(dto.activityId.trim(), apiKey, athleteId);
        break;
      case 'activity_power_curve':
        if (!dto.activityId?.trim()) throw new BadRequestException('activityId is required for activity_power_curve.');
        data = await this.intervalsIcuService.getActivityPowerCurve(dto.activityId.trim(), apiKey, athleteId);
        break;
      default:
        throw new BadRequestException('Unsupported endpoint.');
    }

    return {
      success: true,
      endpoint: dto.endpoint,
      elapsedMs: Date.now() - startedAtMs,
      count: Array.isArray(data) ? data.length : undefined,
      data,
    };
  }

  @Get('activity/:id/streams')
  @UseGuards(JwtAuthGuard)
  async getActivityStreams(@Request() req: any, @Param('id') activityId: string) {
    const { apiKey, athleteId } = await this.getUserCreds(req);
    return { success: true, data: await this.intervalsIcuService.getActivityStreams(activityId, apiKey, athleteId) };
  }

  @Get('activity/:id/power-curve')
  @UseGuards(JwtAuthGuard)
  async getActivityPowerCurve(@Request() req: any, @Param('id') activityId: string) {
    const { apiKey, athleteId } = await this.getUserCreds(req);
    return { success: true, data: await this.intervalsIcuService.getActivityPowerCurve(activityId, apiKey, athleteId) };
  }

  @Get('power-curve')
  @UseGuards(JwtAuthGuard)
  async getPowerCurve(
    @Request() req: any,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    const { apiKey, athleteId } = await this.getUserCreds(req);
    return { success: true, data: await this.intervalsIcuService.getAggregatePowerCurve(startDate, endDate, apiKey, athleteId) };
  }
}
