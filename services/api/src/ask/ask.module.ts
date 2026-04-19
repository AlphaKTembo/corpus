import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { ApiKeyGuard } from '../assistant/api-key.guard';
import { MedicalsModule } from '../medicals/medicals.module';
import { MetricsModule } from '../metrics/metrics.module';
import { SummaryModule } from '../summary/summary.module';
import { UsersModule } from '../users/users.module';
import { AskController } from './ask.controller';
import { AskService } from './ask.service';

@Module({
  imports: [ActivitiesModule, MetricsModule, SummaryModule, MedicalsModule, UsersModule],
  controllers: [AskController],
  providers: [AskService, ApiKeyGuard],
})
export class AskModule {}

