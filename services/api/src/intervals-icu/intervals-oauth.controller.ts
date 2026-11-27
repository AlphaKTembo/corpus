import { Controller, Get, HttpCode, HttpStatus, Logger, Post, Query, Request, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { IntervalsOAuthService, OAUTH_TOKEN_PREFIX } from './intervals-oauth.service';

@Controller('intervals-icu/oauth')
export class IntervalsOAuthController {
  private readonly logger = new Logger(IntervalsOAuthController.name);

  constructor(
    private readonly oauth: IntervalsOAuthService,
    private readonly usersService: UsersService,
  ) {}

  /** Lets clients decide whether to show "Connect with intervals.icu". */
  @Get('config')
  @UseGuards(JwtAuthGuard)
  getConfig() {
    return { enabled: this.oauth.isEnabled() };
  }

  /** Returns the consent URL to open in a browser. */
  @Post('start')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  start(@Request() req: any) {
    if (!this.oauth.isEnabled()) {
      return { enabled: false, url: null };
    }
    return { enabled: true, url: this.oauth.authorizeUrl(req.user.id) };
  }

  /**
   * Redirect target registered with intervals.icu. Public: the signed `state`
   * identifies the user. Renders a small page telling them to return to Corpus.
   */
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    if (error) {
      return this.page(res, 400, 'Not connected',
        error === 'access_denied'
          ? 'You declined access on intervals.icu. You can try again from Connections in Corpus.'
          : 'intervals.icu did not complete the connection. Please try again from Connections in Corpus.');
    }
    const userId = this.oauth.verifyState(state);
    if (!userId || !code) {
      return this.page(res, 400, 'Link expired',
        'This connection link is invalid or has expired. Please start again from Connections in Corpus.');
    }
    try {
      const { accessToken, athleteId } = await this.oauth.exchangeCode(code);
      await this.usersService.setIntervalsCredentials(userId, OAUTH_TOKEN_PREFIX + accessToken, athleteId);
      this.logger.log(`intervals.icu connected via OAuth for user ${userId.slice(0, 8)}`);
      return this.page(res, 200, 'Connected to intervals.icu',
        'You can close this page and return to the Corpus app. Your training data will sync shortly.');
    } catch (err) {
      this.logger.error(`intervals.icu OAuth callback failed: ${(err as Error).message}`);
      return this.page(res, 502, 'Connection failed',
        'We could not finish connecting to intervals.icu. Please try again from Connections in Corpus.');
    }
  }

  private page(res: Response, status: number, title: string, message: string) {
    const esc = (s: string) =>
      s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
    res
      .status(status)
      .type('html')
      .set('Cache-Control', 'no-store')
      .set('Referrer-Policy', 'no-referrer')
      .send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} - Corpus</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f8fafc;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
main{background:#fff;max-width:420px;margin:1.5rem;padding:2rem;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center}
h1{font-size:1.3rem;margin:0 0 .75rem}p{color:#475569;line-height:1.5;margin:0}</style></head>
<body><main><h1>${esc(title)}</h1><p>${esc(message)}</p></main></body></html>`);
  }
}
