import { Entity, PrimaryColumn, CreateDateColumn } from 'typeorm';

/**
 * One row per user, per day (UTC), per surface they used Corpus from.
 * Deliberately minimal: no endpoints, content or IP addresses - just enough
 * to measure daily/weekly actives and cohort retention.
 */
@Entity('user_activity')
export class UserActivity {
  @PrimaryColumn()
  userId: string;

  /** YYYY-MM-DD (UTC) */
  @PrimaryColumn()
  day: string;

  /** 'app' | 'web' | 'gpt' */
  @PrimaryColumn()
  surface: string;

  @CreateDateColumn()
  firstSeenAt: Date;
}
