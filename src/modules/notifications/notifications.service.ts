import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { Queue, Worker, Job } from 'bullmq';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import * as fs from 'fs';

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private isFirebaseInitialized = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  onModuleInit() {
    this.logger.log('Initializing Notifications Service...');
    
    // 1. Initialize Firebase Admin SDK
    this.initializeFirebase();

    // 2. Initialize BullMQ Queue
    this.queue = new Queue('notifications-queue', {
      connection: this.redisService.client as any, // Cast to any to bypass nested ioredis version type mismatches
    });

    // 3. Initialize BullMQ Worker to process jobs
    this.worker = new Worker(
      'notifications-queue',
      async (job: Job) => {
        await this.processNotificationJob(job);
      },
      {
        connection: this.redisService.client as any,
        concurrency: 5,
      }
    );

    this.worker.on('completed', (job) => {
      this.logger.debug(`Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed:`, err);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  // ==========================================
  // Firebase Admin SDK Initialization
  // ==========================================
  private initializeFirebase() {
    try {
      const serviceAccountPath = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON_PATH');
      
      if (!serviceAccountPath) {
        this.logger.warn('FIREBASE_SERVICE_ACCOUNT_JSON_PATH not provided. Running in MOCK notification mode.');
        return;
      }

      if (!fs.existsSync(serviceAccountPath)) {
        this.logger.warn(`Firebase service account file not found at ${serviceAccountPath}. Running in MOCK mode.`);
        return;
      }

      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

      // Avoid double initialization in HMR/Dev reload
      if (getApps().length === 0) {
        initializeApp({
          credential: cert(serviceAccount),
        });
      }

      this.isFirebaseInitialized = true;
      this.logger.log('Firebase Admin SDK successfully initialized');
    } catch (err) {
      this.logger.error('Failed to initialize Firebase Admin SDK:', err);
      this.logger.warn('FCM notifications will run in MOCK mode due to initialization failure.');
    }
  }

  // ==========================================
  // Queue Client API
  // ==========================================
  async addNotificationJob(data: {
    userId: string;
    alertId: string;
    symbol: string;
    alertType: string;
    condition: any;
    triggerPrice: number;
    timestamp: number;
  }) {
    if (!this.queue) {
      throw new Error('Notifications queue is not initialized');
    }

    await this.queue.add('send-alert-notification', data, {
      removeOnComplete: true,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });
  }

  // ==========================================
  // Job Worker Processor
  // ==========================================
  private async processNotificationJob(job: Job) {
    const data = job.data;
    const { userId, symbol, condition, triggerPrice } = data;

    this.logger.log(`Processing notification job ${job.id} for user ${userId}...`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      this.logger.warn(`User ${userId} not found in database. Skipping notification.`);
      return;
    }

    const messageBody = `Alert triggered: ${symbol} reached ${triggerPrice} (Condition: ${condition.operator} ${condition.value})`;

    if (user.fcmToken) {
      await this.sendFcmPush(user.fcmToken, symbol, messageBody);
    } else {
      this.logger.debug(`User ${userId} does not have an active FCM token. Skipping push.`);
    }

    if (user.subscriptionTier !== 'BASIC') {
      await this.sendEmail(user.email, symbol, messageBody);
    }

    if (user.subscriptionTier === 'ELITE') {
      this.logger.log(`[ELITE FEATURE] Dispatching WhatsApp/Telegram alert to user ${user.id}`);
    }
  }

  private async sendFcmPush(token: string, symbol: string, body: string) {
    if (!this.isFirebaseInitialized) {
      this.logger.log(`[MOCK FCM] Sending push to ${token.substring(0, 10)}...: "${body}"`);
      return;
    }

    try {
      const message: any = {
        token,
        notification: {
          title: `🔔 TradeAlert Pro: ${symbol}`,
          body,
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'tradealert_channel',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await getMessaging().send(message);
      this.logger.log(`FCM Push notification sent successfully. Message ID: ${response}`);
    } catch (err) {
      this.logger.error('Failed to send FCM Push notification:', err);
      throw err;
    }
  }

  private async sendEmail(email: string, symbol: string, body: string) {
    this.logger.log(`[MOCK EMAIL] Sending alert email to ${email} for ${symbol}: "${body}"`);
  }
}
