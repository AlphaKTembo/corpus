import { Module } from '@nestjs/common';
import { IntervalsIcuController } from './intervals-icu.controller';
import { IntervalsIcuService } from './intervals-icu.service';
import { UsersModule } from '../users/users.module';
import { IntervalsOAuthController } from './intervals-oauth.controller';
import { IntervalsOAuthService } from './intervals-oauth.service';

@Module({
  imports: [UsersModule],
  controllers: [IntervalsIcuController, IntervalsOAuthController],
  providers: [IntervalsIcuService, IntervalsOAuthService],
  exports: [IntervalsIcuService],
})
export class IntervalsIcuModule {}
