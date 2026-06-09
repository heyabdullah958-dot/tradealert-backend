import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { AlertEngineModule } from '../alert-engine/alert-engine.module';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';

@Module({
  imports: [PrismaModule, RedisModule, AlertEngineModule],
  providers: [AlertsService],
  controllers: [AlertsController],
})
export class AlertsModule {}
