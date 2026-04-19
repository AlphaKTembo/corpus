import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { MetricsModule } from '../metrics/metrics.module';
import { SummaryModule } from '../summary/summary.module';
import { MedicalsController } from './medicals.controller';
import { MedicalsService } from './medicals.service';

@Module({
  imports: [ActivitiesModule, MetricsModule, SummaryModule],
  controllers: [MedicalsController],
  providers: [MedicalsService],
  exports: [MedicalsService],
})
export class MedicalsModule {}
