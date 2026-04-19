import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SummaryController } from './summary.controller';
import { SummaryService } from './summary.service';
import { ActivitiesModule } from '../activities/activities.module';
import { DuckdbModule } from '../duckdb/duckdb.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [ActivitiesModule, DuckdbModule, MetricsModule, ConfigModule],
  controllers: [SummaryController],
  providers: [SummaryService],
  exports: [SummaryService],
})
export class SummaryModule {}

