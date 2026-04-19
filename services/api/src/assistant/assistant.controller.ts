import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { AssistantService } from './assistant.service';
import { UsersService } from '../users/users.service';

@Controller('assistant')
@UseGuards(ApiKeyGuard)
export class AssistantController {
  constructor(
    private assistantService: AssistantService,
    private usersService: UsersService,
  ) {}

  @Get('ping')
  ping() {
    return { ok: true, message: 'Corpus API reachable', ts: new Date().toISOString() };
  }

  @Get('me')
  async getMe(@Request() req: any) {
    const user = await this.usersService.findById(req.user?.id);
    const isClerkLike = (s: string) => /^user_[A-Za-z0-9]{10,}$/.test(s) || s.endsWith('@clerk.local');
    const username = user?.username ?? '';
    const email = user?.email ?? '';
    const name =
      (!isClerkLike(username) && username) ||
      (!isClerkLike(email) && email.includes('@') && email.split('@')[0]) ||
      'there';
    return { name };
  }

  @Get('context')
  async getContext(
    @Query('days') days?: string,
    @Query('activityLimit') activityLimit?: string,
    @Request() req?: any,
  ) {
    const daysNum = days ? parseInt(days, 10) : undefined;
    const activityLimitNum = activityLimit ? parseInt(activityLimit, 10) : undefined;
    const userId = req?.user?.id || 'default';
    return this.assistantService.getContext({ days: daysNum, activityLimit: activityLimitNum }, userId);
  }

  @Post('sync')
  async triggerSync(@Body() body: Record<string, unknown>, @Request() req?: any) {
    const rawDays = body?.days ?? body?.garminDays;
    const days =
      typeof rawDays === 'number' && rawDays > 0
        ? rawDays
        : typeof rawDays === 'string'
          ? parseInt(String(rawDays), 10)
          : undefined;
    const generateSummary = body?.generateSummary === true || body?.generateSummary === 'true';
    const userId = req?.user?.id || 'default';
    try {
      return await this.assistantService.triggerSidebarSync({
        days: days && !Number.isNaN(days) ? days : 30,
        generateSummary,
      }, userId);
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Sync failed',
        generatedAt: new Date().toISOString(),
        results: {},
      };
    }
  }
}
