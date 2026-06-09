import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AlertEngineService } from '../alert-engine/alert-engine.service';
import { MarketType, AlertType, TriggerMode } from '@prisma/client';

export class CreateAlertDto {
  market: MarketType;
  symbol: string;
  timeframe?: string;
  alertType: AlertType;
  condition: {
    operator: string;
    value: number;
    [key: string]: any;
  };
  triggerMode?: TriggerMode;
  isRecurring?: boolean;
}

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alertEngine: AlertEngineService,
  ) {}

  async create(userId: string, dto: CreateAlertDto) {
    const alert = await this.prisma.alert.create({
      data: {
        userId,
        market: dto.market,
        symbol: dto.symbol.toUpperCase(),
        timeframe: dto.timeframe || null,
        alertType: dto.alertType,
        condition: dto.condition,
        triggerMode: dto.triggerMode || TriggerMode.EACH_TICK,
        isRecurring: dto.isRecurring || false,
        isActive: true,
      },
    });

    // Sync to Redis cache
    await this.alertEngine.addAlertToCache(alert);
    return alert;
  }

  async findAll(userId: string) {
    return this.prisma.alert.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async toggleActive(userId: string, alertId: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (alert.userId !== userId) {
      throw new ForbiddenException('You do not own this alert');
    }

    const updatedAlert = await this.prisma.alert.update({
      where: { id: alertId },
      data: { isActive: !alert.isActive },
    });

    if (updatedAlert.isActive) {
      await this.alertEngine.addAlertToCache(updatedAlert);
    } else {
      await this.alertEngine.removeAlertFromCache(updatedAlert.symbol, updatedAlert.id);
    }

    return updatedAlert;
  }

  async remove(userId: string, alertId: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (alert.userId !== userId) {
      throw new ForbiddenException('You do not own this alert');
    }

    await this.prisma.alert.delete({
      where: { id: alertId },
    });

    // Remove from Redis cache
    await this.alertEngine.removeAlertFromCache(alert.symbol, alert.id);
    return { success: true };
  }
}
