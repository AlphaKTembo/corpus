import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { User } from './user.entity';
import { ConfigService } from '@nestjs/config';

export interface CreateUserDto {
  email: string;
  username: string;
  password: string;
}

@Injectable()
export class UsersService {
  private readonly corpusRoot: string;

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly configService: ConfigService,
  ) {
    this.corpusRoot = this.configService.get<string>('CORPUS_ROOT', '/data/corpus');
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.usersRepo.findOne({
      where: [{ email: dto.email }, { username: dto.username }],
    });
    if (existing) {
      throw new ConflictException('Email or username already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.usersRepo.create({
      id: uuidv4(),
      email: dto.email.toLowerCase().trim(),
      username: dto.username.trim(),
      passwordHash,
    });
    return this.usersRepo.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email: email.toLowerCase().trim() } });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { username: username.trim() } });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  async findByEmailOrUsername(identifier: string): Promise<User | null> {
    const lower = identifier.toLowerCase().trim();
    return this.usersRepo.findOne({
      where: [{ email: lower }, { username: identifier.trim() }],
    });
  }

  async findByApiKey(apiKey: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { apiKey } });
  }

  /**
   * Return other users' identity tokens for leakage detection.
   * Includes username, email, and email local-part (when non-trivial).
   */
  async getOtherUserIdentityTokens(excludeUserId: string): Promise<string[]> {
    const users = await this.usersRepo.find({ select: ['id', 'username', 'email'] });
    const tokens = new Set<string>();
    for (const user of users) {
      if (!user?.id || user.id === excludeUserId) continue;
      const username = (user.username || '').trim().toLowerCase();
      const email = (user.email || '').trim().toLowerCase();
      const emailLocal = email.includes('@') ? email.split('@')[0] : '';
      if (username.length >= 4) tokens.add(username);
      if (email.includes('@')) tokens.add(email);
      if (emailLocal.length >= 4) tokens.add(emailLocal);
    }
    return Array.from(tokens);
  }

  async setApiKey(userId: string, apiKey: string): Promise<void> {
    await this.usersRepo.update(userId, { apiKey });
  }

  /** Generate (or regenerate) a short, friendly API key for a user and persist it. */
  async generateApiKey(userId: string): Promise<string> {
    // cp_ + 24 random base62 chars (~143 bits entropy) — short enough to paste easily
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const rand = crypto.randomBytes(24);
    let token = 'cp_';
    for (let i = 0; i < 24; i++) token += chars[rand[i] % chars.length];
    await this.usersRepo.update(userId, { apiKey: token });
    return token;
  }

  async findByClerkId(clerkId: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { clerkId } });
  }

  /**
   * Find an existing user by Clerk ID, or create a new one automatically.
   * This is called on every authenticated request so new Clerk sign-ups
   * get a data directory provisioned on first access.
   */
  async findOrCreateByClerkId(clerkId: string, email: string, username: string): Promise<User> {
    let user = await this.findByClerkId(clerkId);
    if (user) return user;

    // Also try to match by email in case user existed before Clerk
    if (email) {
      user = await this.findByEmail(email);
      if (user) {
        await this.usersRepo.update(user.id, { clerkId });
        return { ...user, clerkId };
      }
    }

    // Brand-new Clerk user — provision a record
    // Prefer provided username, then email prefix, then clerkId as last resort
    const safeUsername = username?.trim() || (email ? email.split('@')[0] : '') || clerkId;
    const uniqueUsername = await this.makeUniqueUsername(safeUsername);
    const newUser = this.usersRepo.create({
      id: uuidv4(),
      email: email?.toLowerCase().trim() || `${clerkId}@clerk.local`,
      username: uniqueUsername,
      passwordHash: '',
      clerkId,
    });
    return this.usersRepo.save(newUser);
  }

  async setIntervalsCredentials(userId: string, apiKey: string, athleteId: string): Promise<void> {
    await this.usersRepo.update(userId, { intervalsApiKey: apiKey, intervalsAthleteId: athleteId });
  }

  async clearIntervalsCredentials(userId: string): Promise<void> {
    await this.usersRepo.update(userId, { intervalsApiKey: undefined, intervalsAthleteId: undefined });
  }

  /**
   * Wipe all Intervals.icu-sourced rows from canonical CSVs.
   * Rows with source='intervals_icu' are removed; rows from other sources (FitnessSyncer etc.) are kept.
   * The activities.csv is wiped entirely since activities are always from Intervals.icu.
   */
  async clearIntervalsData(userId: string): Promise<{ cleared: string[] }> {
    const canonicalDir = path.join(this.corpusRoot, userId, 'canonical');
    if (!fs.existsSync(canonicalDir)) return { cleared: [] };

    const cleared: string[] = [];

    // Activities come exclusively from Intervals.icu — delete the whole file
    const activitiesCsv = path.join(canonicalDir, 'activities.csv');
    if (fs.existsSync(activitiesCsv)) {
      fs.unlinkSync(activitiesCsv);
      cleared.push('activities.csv');
    }

    // fitness_daily is always from Intervals.icu
    const fitnessCsv = path.join(canonicalDir, 'fitness_daily.csv');
    if (fs.existsSync(fitnessCsv)) {
      fs.unlinkSync(fitnessCsv);
      cleared.push('fitness_daily.csv');
    }

    // For mixed-source CSVs, strip only rows where source='intervals_icu'
    const mixedFiles = ['vitals_daily.csv', 'sleep_daily.csv', 'body_metrics.csv', 'vitals_bp.csv'];
    for (const file of mixedFiles) {
      const csvPath = path.join(canonicalDir, file);
      if (!fs.existsSync(csvPath)) continue;
      const content = fs.readFileSync(csvPath, 'utf-8');
      const lines = content.trim().split('\n');
      if (lines.length < 2) continue;
      const headers = lines[0].split(',').map(h => h.trim());
      const sourceIdx = headers.indexOf('source');
      if (sourceIdx === -1) continue;
      const kept = lines.slice(1).filter(line => {
        const cols = line.split(',');
        return cols[sourceIdx]?.trim() !== 'intervals_icu';
      });
      if (kept.length === 0) {
        fs.unlinkSync(csvPath);
      } else {
        fs.writeFileSync(csvPath, [lines[0], ...kept].join('\n'), 'utf-8');
      }
      cleared.push(file);
    }

    return { cleared };
  }

  private async makeUniqueUsername(base: string): Promise<string> {
    let candidate = base;
    let attempt = 0;
    while (await this.findByUsername(candidate)) {
      attempt++;
      candidate = `${base}${attempt}`;
    }
    return candidate;
  }
}
