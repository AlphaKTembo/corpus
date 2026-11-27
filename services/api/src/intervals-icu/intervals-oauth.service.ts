import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/** Prefix that marks a stored intervals credential as an OAuth bearer token. */
export const OAUTH_TOKEN_PREFIX = 'oauth:';

/** Authorization header for a stored intervals.icu credential (API key or OAuth token). */
export function intervalsAuthHeader(credential: string): string {
  return credential.startsWith(OAUTH_TOKEN_PREFIX)
    ? `Bearer ${credential.slice(OAUTH_TOKEN_PREFIX.length)}`
    : `Basic ${Buffer.from(`API_KEY:${credential}`).toString('base64')}`;
}

/**
 * intervals.icu OAuth ("Connect with intervals.icu" instead of pasting an API key).
 * Docs: https://forum.intervals.icu/t/intervals-icu-oauth-support/2759
 *
 * Enabled only when INTERVALS_OAUTH_CLIENT_ID and INTERVALS_OAUTH_CLIENT_SECRET
 * are set (from the app's "Manage App" page at https://intervals.icu/settings/apps).
 * The redirect URI registered there must equal INTERVALS_OAUTH_REDIRECT_URI.
 */
@Injectable()
export class IntervalsOAuthService {
  private readonly logger = new Logger(IntervalsOAuthService.name);
  private static readonly AUTHORIZE_URL = 'https://intervals.icu/oauth/authorize';
  private static readonly TOKEN_URL = 'https://intervals.icu/api/oauth/token';
  private static readonly STATE_TTL_MS = 10 * 60 * 1000;
  // Read-only access to what Corpus uses: activities, wellness, and athlete
  // settings (zones). WRITE is never requested.
  static readonly SCOPES = 'ACTIVITY:READ,WELLNESS:READ,SETTINGS:READ';

  constructor(private readonly config: ConfigService) {}

  private get clientId() {
    return this.config.get<string>('INTERVALS_OAUTH_CLIENT_ID', '').trim();
  }
  private get clientSecret() {
    return this.config.get<string>('INTERVALS_OAUTH_CLIENT_SECRET', '').trim();
  }
  get redirectUri(): string {
    return (
      this.config.get<string>('INTERVALS_OAUTH_REDIRECT_URI', '').trim() ||
      'https://corpus.kurasika.tech/api/v1/intervals-icu/oauth/callback'
    );
  }
  private get stateKey(): Buffer | null {
    const raw = this.config.get<string>('CORPUS_ENCRYPTION_KEY', '').trim();
    return raw ? crypto.createHash('sha256').update(`intervals-oauth-state:${raw}`).digest() : null;
  }

  isEnabled(): boolean {
    return !!(this.clientId && this.clientSecret && this.stateKey);
  }

  /** Consent URL for this user; `state` binds the callback to them for 10 minutes. */
  authorizeUrl(userId: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: IntervalsOAuthService.SCOPES,
      state: this.signState(userId),
    });
    return `${IntervalsOAuthService.AUTHORIZE_URL}?${params.toString()}`;
  }

  /** Returns the user id the state was issued for, or null if invalid/expired. */
  verifyState(state: string | undefined): string | null {
    const key = this.stateKey;
    if (!key || !state) return null;
    const [payloadB64, sig] = state.split('.');
    if (!payloadB64 || !sig) return null;
    const expected = crypto.createHmac('sha256', key).update(payloadB64).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      if (typeof payload?.uid !== 'string' || typeof payload?.exp !== 'number') return null;
      if (Date.now() > payload.exp) return null;
      return payload.uid;
    } catch {
      return null;
    }
  }

  /** Exchanges an authorization code (valid ~2 minutes) for an access token. */
  async exchangeCode(code: string): Promise<{ accessToken: string; athleteId: string; scope: string }> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
    });
    const response = await fetch(IntervalsOAuthService.TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) {
      // Don't log the body: it can echo request parameters.
      throw new Error(`intervals.icu token exchange failed: HTTP ${response.status}`);
    }
    const data: any = await response.json();
    const accessToken = String(data?.access_token ?? '').trim();
    const athleteId = String(data?.athlete?.id ?? '').trim();
    if (!accessToken || !athleteId) {
      throw new Error('intervals.icu token response missing access_token or athlete id');
    }
    return { accessToken, athleteId, scope: String(data?.scope ?? '') };
  }

  private signState(userId: string): string {
    const key = this.stateKey;
    if (!key) throw new Error('OAuth state key unavailable');
    const payload = Buffer.from(
      JSON.stringify({
        uid: userId,
        exp: Date.now() + IntervalsOAuthService.STATE_TTL_MS,
        n: crypto.randomBytes(8).toString('hex'),
      }),
    ).toString('base64url');
    const sig = crypto.createHmac('sha256', key).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }
}
