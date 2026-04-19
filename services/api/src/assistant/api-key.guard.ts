import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from '../users/users.service';

/**
 * FlexAuthGuard — accepts any of:
 *   1. x-corpus-key header        (internal web app / direct API calls)
 *   2. ?key= query parameter      (ChatGPT GPT Actions — GET requests)
 *   3. body.key field             (ChatGPT GPT Actions — POST requests)
 *   4. Authorization: Bearer JWT  (Clerk-authenticated web app)
 *
 * Always sets request.user = { id, username, email } on success.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private jwtGuard = new (AuthGuard('jwt'))();

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const rawApiKey: string | undefined =
      (typeof request.headers['x-corpus-key'] === 'string' ? request.headers['x-corpus-key'] : undefined) ||
      (typeof request.query?.key === 'string' ? request.query.key : undefined) ||
      (typeof request.body?.key === 'string' ? request.body.key : undefined);

    // --- Path 1: corpus key (header, query param, or body field) ---
    if (rawApiKey?.trim()) {
      const user = await this.usersService.findByApiKey(rawApiKey.trim());
      if (user && user.isActive) {
        request.user = { id: user.id, username: user.username, email: user.email };
        return true;
      }
      throw new UnauthorizedException('Invalid API key.');
    }

    // --- Path 2: Authorization: Bearer <Clerk JWT> via Passport ---
    try {
      return (await this.jwtGuard.canActivate(context)) as boolean;
    } catch {
      throw new UnauthorizedException('Authentication required.');
    }
  }
}
