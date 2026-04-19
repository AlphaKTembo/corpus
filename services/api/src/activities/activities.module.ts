import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { DuckdbModule } from '../duckdb/duckdb.module';

@Module({
  imports: [DuckdbModule, ConfigModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService], // Export so other modules can use it
})
export class ActivitiesModule {}

