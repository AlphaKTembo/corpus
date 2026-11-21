import { Body, Controller, Delete, Get, Post, Put, Request, UseGuards, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  async deleteMe(@Request() req: any) {
    const result = await this.usersService.deleteAccount(req.user.id);
    return { success: true, ...result };
  }

  @Get('me')
  async getMe(@Request() req: any) {
    const user = await this.usersService.findById(req.user.id);
    return {
      id: user?.id,
      email: user?.email,
      username: user?.username,
      intervalsConnected: !!(user?.intervalsApiKey && user?.intervalsAthleteId),
      intervalsAthleteId: user?.intervalsAthleteId || null,
    };
  }

  @Get('me/credentials')
  async getCredentials(@Request() req: any) {
    const user = await this.usersService.findById(req.user.id);
    return {
      intervalsConnected: !!(user?.intervalsApiKey && user?.intervalsAthleteId),
      intervalsAthleteId: user?.intervalsAthleteId || null,
      hasApiKey: !!user?.apiKey,
      apiKey: user?.apiKey || null,
    };
  }

  @Post('me/api-key/generate')
  @HttpCode(HttpStatus.OK)
  async generateApiKey(@Request() req: any) {
    const key = await this.usersService.generateApiKey(req.user.id);
    return { apiKey: key };
  }

  @Put('me/credentials/intervals')
  @HttpCode(HttpStatus.OK)
  async saveIntervalsCredentials(
    @Request() req: any,
    @Body() body: { apiKey: string; athleteId?: string },
  ) {
    if (!body.apiKey?.trim()) {
      return { success: false, error: 'API key is required' };
    }

    let athleteId = body.athleteId?.trim();

    // Auto-detect athlete ID if not provided
    if (!athleteId) {
      try {
        const response = await fetch('https://intervals.icu/api/v1/athlete/i0/activities?oldest=2000-01-01&newest=2000-01-01', {
          headers: {
            Authorization: `Basic ${Buffer.from(`API_KEY:${body.apiKey}`).toString('base64')}`,
          },
        });
        // The API redirects /i0/ to the actual athlete path — extract from response or try /athletes endpoint
        const profileRes = await fetch('https://intervals.icu/api/v1/athlete/i0', {
          headers: {
            Authorization: `Basic ${Buffer.from(`API_KEY:${body.apiKey}`).toString('base64')}`,
          },
        });
        if (profileRes.ok) {
          const profile: any = await profileRes.json();
          athleteId = profile?.id || profile?.athlete_id;
        }
      } catch {
        // Will try a different approach below
      }
    }

    if (!athleteId) {
      return { success: false, error: 'Could not auto-detect athlete ID. Please enter it manually (find it in your intervals.icu profile URL, e.g. i503907).' };
    }

    // Validate credentials work
    try {
      const testRes = await fetch(`https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=2024-01-01&newest=2024-01-02`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`API_KEY:${body.apiKey}`).toString('base64')}`,
        },
      });
      if (!testRes.ok) {
        return { success: false, error: 'Invalid API key or athlete ID. Please check your credentials.' };
      }
    } catch {
      return { success: false, error: 'Failed to connect to intervals.icu. Please try again.' };
    }

    await this.usersService.setIntervalsCredentials(req.user.id, body.apiKey.trim(), athleteId);
    return { success: true, athleteId };
  }

  @Put('me/credentials/intervals/disconnect')
  @HttpCode(HttpStatus.OK)
  async disconnectIntervals(
    @Request() req: any,
    @Query('clearData') clearData?: string,
  ) {
    await this.usersService.clearIntervalsCredentials(req.user.id);
    let cleared: string[] = [];
    if (clearData === 'true') {
      const result = await this.usersService.clearIntervalsData(req.user.id);
      cleared = result.cleared;
    }
    return { success: true, cleared };
  }
}
