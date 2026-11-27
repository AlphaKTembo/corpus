import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserActivity } from './user-activity.entity';
import { ActivityInterceptor } from './activity.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([UserActivity])],
  providers: [{ provide: APP_INTERCEPTOR, useClass: ActivityInterceptor }],
})
export class ActivityModule {}
