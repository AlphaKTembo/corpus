import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwksRsa from 'jwks-rsa';
import { UsersService } from '../../users/users.service';

/**
 * Verifies Firebase ID tokens via Google's public JWKS.
 * Only FIREBASE_PROJECT_ID is required — no service-account private key.
 */
export interface FirebaseIdTokenPayload {
  sub: string;
  user_id?: string;
  email?: string;
  name?: string;
  email_verified?: boolean;
  aud?: string;
  iss?: string;
  [key: string]: unknown;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const projectId =
      configService.get<string>('FIREBASE_PROJECT_ID', '') ||
      configService.get<string>('NEXT_PUBLIC_FIREBASE_PROJECT_ID', '');

    super(
      projectId
        ? {
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            audience: projectId,
            issuer: `https://securetoken.google.com/${projectId}`,
            algorithms: ['RS256'],
            secretOrKeyProvider: jwksRsa.passportJwtSecret({
              cache: true,
              rateLimit: true,
              jwksRequestsPerMinute: 10,
              jwksUri:
                'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
            }),
          }
        : {
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: 'firebase-project-id-missing',
            algorithms: ['HS256'],
          },
    );
  }

  async validate(
    payload: FirebaseIdTokenPayload,
  ): Promise<{ id: string; email: string; username: string }> {
    const uid = payload?.sub || payload?.user_id;
    if (!uid) {
      throw new UnauthorizedException('Invalid token');
    }

    const email = (payload.email || '').toString();
    const username =
      (payload.name as string | undefined)?.toString() ||
      (email ? email.split('@')[0] : '') ||
      uid;

    const user = await this.usersService.findOrCreateByFirebaseUid(uid, email, username);
    return { id: user.id, email: user.email, username: user.username };
  }
}
