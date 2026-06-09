import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AlertsService, CreateAlertDto } from './alerts.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ActiveUser } from '../../common/decorators/user.decorator';

@Controller('alerts')
@UseGuards(JwtAuthGuard) // Protect all endpoints in this controller with Supabase JWT guard
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post()
  async create(
    @ActiveUser('id') userId: string,
    @Body() createAlertDto: CreateAlertDto,
  ) {
    return this.alertsService.create(userId, createAlertDto);
  }

  @Get()
  async findAll(@ActiveUser('id') userId: string) {
    return this.alertsService.findAll(userId);
  }

  @Patch(':id/toggle')
  async toggleActive(
    @ActiveUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.alertsService.toggleActive(userId, id);
  }

  @Delete(':id')
  async remove(
    @ActiveUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.alertsService.remove(userId, id);
  }
}
