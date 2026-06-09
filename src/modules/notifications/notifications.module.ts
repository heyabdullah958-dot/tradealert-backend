import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [ConfigModule, PrismaModule, RedisModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
