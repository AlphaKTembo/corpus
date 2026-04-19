import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { FitnessSyncerModule } from '../fitnesssyncer/fitnesssyncer.module';
import { IntervalsIcuModule } from '../intervals-icu/intervals-icu.module';
import { MedicalsModule } from '../medicals/medicals.module';
import { MetricsModule } from '../metrics/metrics.module';
import { SummaryModule } from '../summary/summary.module';
import { UsersModule } from '../users/users.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { ApiKeyGuard } from './api-key.guard';

@Module({
  imports: [
    ActivitiesModule,
    MetricsModule,
    SummaryModule,
    MedicalsModule,
    FitnessSyncerModule,
    IntervalsIcuModule,
    UsersModule,
  ],
  controllers: [AssistantController],
  providers: [AssistantService, ApiKeyGuard],
})
export class AssistantModule {}
