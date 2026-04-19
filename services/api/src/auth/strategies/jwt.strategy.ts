import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwksRsa from 'jwks-rsa';
import { UsersService } from '../../users/users.service';

export interface ClerkJwtPayload {
  sub: string;
  email?: string;
  username?: string;
  email_addresses?: Array<{ email_address: string }>;
  [key: string]: unknown;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    const publishableKey = configService.get<string>('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '');

    // Derive Clerk JWKS URI from publishable key
    // Format: pk_test_BASE64(domain)$ — decode base64, strip trailing $
    let jwksUri = 'https://api.clerk.dev/v1/jwks';
    if (publishableKey) {
      try {
        const base64Part = publishableKey.replace(/^pk_(test|live)_/, '');
        const domain = Buffer.from(base64Part, 'base64').toString('utf8').replace(/\$$/, '');
        if (domain) {
          jwksUri = `https://${domain}/.well-known/jwks.json`;
        }
      } catch {
        // fallback to default
      }
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri,
      }),
      algorithms: ['RS256'],
    });
  }

  async validate(payload: ClerkJwtPayload): Promise<{ id: string; email: string; username: string }> {
    if (!payload?.sub) throw new UnauthorizedException('Invalid token');

    const email =
      (payload.email as string) ??
      payload.email_addresses?.[0]?.email_address ??
      '';
    const username = (payload.username as string) ?? email.split('@')[0] ?? payload.sub;

    // Provision or retrieve the internal user record mapped to this Clerk ID
    const user = await this.usersService.findOrCreateByClerkId(payload.sub, email, username);

    return { id: user.id, email: user.email, username: user.username };
  }
}
