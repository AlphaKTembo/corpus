import { Module } from '@nestjs/common';
import { FitnessSyncerController } from './fitnesssyncer.controller';
import { FitnessSyncerCallbackController } from './fitnesssyncer-callback.controller';
import { FitnessSyncerService } from './fitnesssyncer.service';
import { DuckdbModule } from '../duckdb/duckdb.module';

@Module({
  imports: [DuckdbModule],
  controllers: [FitnessSyncerController, FitnessSyncerCallbackController],
  providers: [FitnessSyncerService],
  exports: [FitnessSyncerService],
})
export class FitnessSyncerModule {}

