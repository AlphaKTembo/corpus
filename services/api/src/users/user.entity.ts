import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

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

  @Column({ nullable: true, unique: true })
  apiKey?: string;

  @Column({ nullable: true, unique: true })
  clerkId?: string;

  @Column({ nullable: true })
  intervalsApiKey?: string;

  @Column({ nullable: true })
  intervalsAthleteId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
