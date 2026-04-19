import { Module } from '@nestjs/common';
import { IntervalsIcuController } from './intervals-icu.controller';
import { IntervalsIcuService } from './intervals-icu.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [IntervalsIcuController],
  providers: [IntervalsIcuService],
  exports: [IntervalsIcuService],
})
export class IntervalsIcuModule {}
