import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { FitnessSyncerService } from './fitnesssyncer.service';

@Controller('fitnesssyncer')
export class FitnessSyncerCallbackController {
  constructor(private fitnessSyncerService: FitnessSyncerService) {}

  @Get('callback')
  async callback(@Query('code') code: string, @Res() res: Response) {
    if (!code) {
      return res.redirect('/fitnesssyncer?error=no_code');
    }

    try {
      const tokens = await this.fitnessSyncerService.exchangeCodeForToken(code);
      await this.fitnessSyncerService.saveToken(tokens.access_token, tokens.refresh_token);
      
      // Redirect to success page
      return res.redirect('/fitnesssyncer?connected=true');
    } catch (error: any) {
      console.error('FitnessSyncer callback error:', error);
      return res.redirect('/fitnesssyncer?error=connection_failed');
    }
  }
}

