import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { User } from './users/user.entity';
import { IngestModule } from './ingest/ingest.module';
import { SummaryModule } from './summary/summary.module';
import { ActivitiesModule } from './activities/activities.module';
import { MetricsModule } from './metrics/metrics.module';
import { AskModule } from './ask/ask.module';
import { DuckdbModule } from './duckdb/duckdb.module';
import { FitnessSyncerModule } from './fitnesssyncer/fitnesssyncer.module';
import { MedicalsModule } from './medicals/medicals.module';
import { AssistantModule } from './assistant/assistant.module';
import { IntervalsIcuModule } from './intervals-icu/intervals-icu.module';
import { AppController } from './app.controller';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: false,
      envFilePath: [
        join(__dirname, '../../.env.local'),
        join(__dirname, '../../.env'),
        '.env.local',
        '.env',
      ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'better-sqlite3',
        database: configService.get<string>('DB_PATH', '/data/corpus/corpus.db'),
        entities: [User],
        synchronize: true, // auto-creates tables; safe for SQLite
        logging: false,
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    DuckdbModule,
    AuthModule,
    IngestModule,
    SummaryModule,
    ActivitiesModule,
    MetricsModule,
    AskModule,
    FitnessSyncerModule,
    MedicalsModule,
    AssistantModule,
    IntervalsIcuModule,
  ],
})
export class AppModule {}
