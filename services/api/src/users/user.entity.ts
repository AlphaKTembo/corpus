import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { encryptedColumn } from '../common/secret-crypto';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ unique: true })
  username: string;

  @Column()
  passwordHash: string;

  @Column({ default: 'user' })
  role: string; // 'user' | 'admin'

  @Column({ default: true })
  isActive: boolean;

  /** SHA-256 hash of the Corpus API key ("sha256:<hex>"); plaintext is never stored. */
  @Column({ nullable: true, unique: true })
  apiKey?: string;

  /** Last 4 characters of the API key, for display. */
  @Column({ nullable: true })
  apiKeyHint?: string;

  @Column({ nullable: true, unique: true })
  clerkId?: string;

  @Column({ nullable: true, unique: true })
  firebaseUid?: string;

  /** intervals.icu API key, AES-256-GCM encrypted at rest. */
  @Column({ nullable: true, transformer: encryptedColumn })
  intervalsApiKey?: string;

  @Column({ nullable: true })
  intervalsAthleteId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
