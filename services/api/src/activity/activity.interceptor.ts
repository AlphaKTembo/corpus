import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable } from 'rxjs';
import { UserActivity } from './user-activity.entity';

/**
 * Records that an authenticated user was active today (see UserActivity).
 * Runs after guards, so request.user is set for authenticated routes.
 *
 * Not counted as activity:
 * - requests with `x-corpus-background: 1` (the app's scheduled morning sync)
 * - requests with `x-corpus-system: 1` (server jobs such as infra/sync-full.sh)
 */
@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityInterceptor.name);
  private readonly seen = new Set<string>();
  private seenDay = '';

  constructor(
    @InjectRepository(UserActivity)
    private readonly repo: Repository<UserActivity>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    try {
      if (context.getType() === 'http') this.record(context.switchToHttp().getRequest());
    } catch {
      // Tracking must never affect the request.
    }
    return next.handle();
  }

  private record(req: any): void {
    const userId: string | undefined = req?.user?.id;
    if (!userId) return;
    const header = (name: string) => String(req.headers?.[name] ?? '').trim();
    if (header('x-corpus-background') === '1' || header('x-corpus-system') === '1') return;

    const day = new Date().toISOString().slice(0, 10);
    if (day !== this.seenDay) {
      this.seen.clear();
      this.seenDay = day;
    }
    const surface = this.surfaceOf(req);
    const key = `${userId}|${day}|${surface}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);

    this.repo
      .query(
        'INSERT OR IGNORE INTO user_activity (userId, day, surface, firstSeenAt) VALUES (?, ?, ?, ?)',
        [userId, day, surface, new Date().toISOString()],
      )
      .catch((err) => {
        this.seen.delete(key);
        this.logger.warn(`Could not record activity: ${(err as Error).message}`);
      });
  }

  private surfaceOf(req: any): string {
    const usedApiKey =
      typeof req.headers?.['x-corpus-key'] === 'string' ||
      typeof req.query?.key === 'string' ||
      typeof req.body?.key === 'string';
    if (usedApiKey) return 'gpt';
    const ua = String(req.headers?.['user-agent'] ?? '').toLowerCase();
    // The Flutter app (dio) sends a Dart user agent; browsers send Mozilla/...
    if (ua.includes('dart') || ua.includes('corpus-mobile')) return 'app';
    return 'web';
  }
}
