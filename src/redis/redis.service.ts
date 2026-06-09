import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public readonly client: Redis;

  constructor(configService: ConfigService) {
    const redisUrl = configService.get<string>('REDIS_URL');

    if (redisUrl) {
      this.logger.log(`Connecting to Redis using URL...`);
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: null, // Required by BullMQ
      });
    } else {
      const host = configService.get<string>('REDIS_HOST') || 'localhost';
      const port = configService.get<number>('REDIS_PORT') || 6379;
      const password = configService.get<string>('REDIS_PASSWORD');

      this.logger.log(`Connecting to Redis at ${host}:${port}...`);
      this.client = new Redis({
        host,
        port,
        password: password || undefined,
        maxRetriesPerRequest: null, // Required by BullMQ
      });
    }

    this.client.on('connect', () => {
      this.logger.log('Successfully connected to Redis');
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis connection error:', err);
    });
  }

  // Helper method to create a duplicate connection (e.g. for subscribing)
  duplicate(): Redis {
    return this.client.duplicate();
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting from Redis...');
    await this.client.quit();
  }
}
