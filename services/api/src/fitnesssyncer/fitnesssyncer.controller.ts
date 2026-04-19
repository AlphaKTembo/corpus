import { Controller, Get, Post, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FitnessSyncerService } from './fitnesssyncer.service';

@Controller('fitnesssyncer')
@UseGuards(JwtAuthGuard)
export class FitnessSyncerController {
  constructor(private fitnessSyncerService: FitnessSyncerService) {}

  @Get('authorize')
  authorize() {
    try {
      const authUrl = this.fitnessSyncerService.getAuthorizationUrl();
      return { authUrl };
    } catch (error: any) {
      return { error: error.message || 'Failed to get authorization URL', authUrl: null };
    }
  }

  @Post('callback')
  async callback(@Body() dto: { code: string }, @Request() req: any) {
    try {
      if (!dto.code || !dto.code.trim()) {
        return { success: false, error: 'No authorization code provided' };
      }
      const tokens = await this.fitnessSyncerService.exchangeCodeForToken(dto.code.trim());
      await this.fitnessSyncerService.saveToken(tokens.access_token, tokens.refresh_token, req.user.id);
      return { success: true, message: 'FitnessSyncer connected successfully' };
    } catch (error: any) {
      let errorMessage = error.message || 'Failed to exchange code for token';
      return { success: false, error: errorMessage };
    }
  }

  @Post('sync')
  async triggerSync(@Request() req: any) {
    try {
      const userId = req.user.id;
      let tokens = await this.fitnessSyncerService.loadToken(userId);
      if (!tokens) {
        return { error: 'FitnessSyncer not connected. Please authorize first.' };
      }

      try {
        const result = await this.fitnessSyncerService.syncData(tokens.accessToken, userId);
        return { success: true, message: `Sync completed: ${result.vitals} blood pressure records`, ...result };
      } catch (error: any) {
        if (error.message?.includes('Expired') || error.message?.includes('401') || error.message?.includes('Unauthorized')) {
          const newTokens = await this.fitnessSyncerService.refreshAccessToken(tokens.refreshToken);
          const result = await this.fitnessSyncerService.syncData(newTokens.access_token, userId);
          return { success: true, message: `Sync completed: ${result.vitals} blood pressure records`, ...result };
        }
        throw error;
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to sync data from FitnessSyncer' };
    }
  }

  @Get('status')
  async getStatus(@Request() req: any) {
    const tokens = await this.fitnessSyncerService.loadToken(req.user.id);
    return { connected: !!tokens, hasToken: !!tokens };
  }
}
