import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import Redis from 'ioredis';

@Injectable()
export class AlertEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertEngineService.name);
  private subClient: Redis | null = null;
  private isDestroyed = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Alert Engine...');
    
    // 1. Sync all active alerts from PostgreSQL to Redis Cache
    await this.syncAllAlertsToCache();

    // 2. Setup Redis SubClient to listen to live ticks
    this.subscribeToTicks();
  }

  onModuleDestroy() {
    this.isDestroyed = true;
    this.subClient?.disconnect();
  }

  // ==========================================
  // Cache Synchronization
  // ==========================================
  
  /**
   * Syncs all active database alerts into Redis hashes on startup
   */
  private async syncAllAlertsToCache() {
    try {
      this.logger.log('Syncing active alerts to Redis cache...');
      
      // Delete old active alert keys from Redis to avoid stale data
      const keys = await this.redisService.client.keys('active_alerts:*');
      if (keys.length > 0) {
        await this.redisService.client.del(...keys);
      }

      const activeAlerts = await this.prisma.alert.findMany({
        where: { isActive: true },
      });

      for (const alert of activeAlerts) {
        await this.addAlertToCache(alert);
      }

      this.logger.log(`Synced ${activeAlerts.length} active alerts to Redis`);
    } catch (err) {
      this.logger.error('Failed to sync active alerts to Redis:', err);
    }
  }

  /**
   * Add a single alert to the Redis active alert cache
   */
  public async addAlertToCache(alert: any) {
    const key = `active_alerts:${alert.symbol.toUpperCase()}`;
    await this.redisService.client.hset(key, alert.id, JSON.stringify(alert));
  }

  /**
   * Remove a single alert from the Redis active alert cache
   */
  public async removeAlertFromCache(symbol: string, alertId: string) {
    const key = `active_alerts:${symbol.toUpperCase()}`;
    await this.redisService.client.hdel(key, alertId);
  }

  // ==========================================
  // Tick Subscriber & Evaluation
  // ==========================================
  private subscribeToTicks() {
    if (this.isDestroyed) return;

    this.subClient = this.redisService.duplicate();
    
    // Subscribe to both crypto and synthetic ticks
    this.subClient.subscribe('tick:crypto', 'tick:synthetic');

    this.subClient.on('message', async (channel, message) => {
      try {
        const tick = JSON.parse(message);
        await this.evaluatePriceAlerts(tick);
      } catch (err) {
        this.logger.error('Error in tick subscriber message handler:', err);
      }
    });

    this.subClient.on('error', (err) => {
      this.logger.error('Redis subscription client error:', err);
    });
  }

  /**
   * Evaluates price-based alerts for a specific price update
   */
  private async evaluatePriceAlerts(tick: {
    market: string;
    symbol: string;
    price: number;
    timestamp: number;
  }) {
    const { symbol, price } = tick;
    const cacheKey = `active_alerts:${symbol}`;

    // Fetch all active alerts for this symbol from Redis
    const cachedAlerts = await this.redisService.client.hgetall(cacheKey);
    const alertIds = Object.keys(cachedAlerts);

    if (alertIds.length === 0) return;

    for (const alertId of alertIds) {
      try {
        const alert = JSON.parse(cachedAlerts[alertId]);
        
        // Only evaluate Price alerts in this real-time tick loop
        if (alert.alertType !== 'PRICE') continue;

        const triggered = this.checkPriceCondition(price, alert.condition);

        if (triggered) {
          await this.triggerAlert(alert, price);
        }
      } catch (err) {
        this.logger.error(`Failed to evaluate alert ${alertId}:`, err);
      }
    }
  }

  /**
   * Parses the JSON condition and checks if the price met the rule
   */
  private checkPriceCondition(currentPrice: number, condition: any): boolean {
    // Expected condition structure: { operator: 'above' | 'below', value: number }
    const { operator, value } = condition;
    
    if (operator === 'above' || operator === '>') {
      return currentPrice >= value;
    }
    
    if (operator === 'below' || operator === '<') {
      return currentPrice <= value;
    }

    return false;
  }

  /**
   * Handles triggering an alert: updates DB, updates cache, and queues notification
   */
  private async triggerAlert(alert: any, triggerPrice: number) {
    this.logger.log(`🚨 ALERT TRIGGERED: ${alert.symbol} reached ${triggerPrice} (Target: ${alert.condition.value})`);

    // 1. Update trigger metadata in PostgreSQL
    const now = new Date();
    
    if (alert.isRecurring) {
      // Keep alert active, just update lastTriggeredAt
      await this.prisma.alert.update({
        where: { id: alert.id },
        data: { lastTriggeredAt: now },
      });
    } else {
      // One-time alert: Mark inactive and remove from Redis Cache
      await this.prisma.alert.update({
        where: { id: alert.id },
        data: {
          isActive: false,
          lastTriggeredAt: now,
        },
      });

      await this.removeAlertFromCache(alert.symbol, alert.id);
    }

    // 2. Queue the notification job
    await this.queueNotificationJob(alert, triggerPrice);
  }

  private async queueNotificationJob(alert: any, triggerPrice: number) {
    try {
      await this.notificationsService.addNotificationJob({
        userId: alert.userId,
        alertId: alert.id,
        symbol: alert.symbol,
        alertType: alert.alertType,
        condition: alert.condition,
        triggerPrice,
        timestamp: Date.now(),
      });
      
      this.logger.debug(`Queued notification job for alert ${alert.id}`);
    } catch (err) {
      this.logger.error(`Failed to queue notification for alert ${alert.id}:`, err);
    }
  }
}
