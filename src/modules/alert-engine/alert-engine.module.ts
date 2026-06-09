import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AlertEngineService } from './alert-engine.service';

@Module({
  imports: [ConfigModule, PrismaModule, RedisModule, NotificationsModule],
  providers: [AlertEngineService],
  exports: [AlertEngineService],
})
export class AlertEngineModule {}
