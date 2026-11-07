import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AppointmentsController, FlowboardController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import {
  AppointmentTypesController,
  ScheduleBlocksController,
  WaitlistController,
} from './scheduling.controller';
import { SchedulingService } from './scheduling.service';

/**
 * Faz 05 — randevu takvimi, çalışma saatleri, bekleme listesi ve akış panosu.
 * Kabul kriterleri servis seviyesinde uygulanır (çakışma kontrolü Serializable
 * transaction içinde; çalışma saati politikası Clinic.timezone ile değerlendirilir;
 * durum makinesi ileri yönlüdür). Tüm mutation uçları denetim defterine yazar
 * (AuditService global modülden sağlanır).
 */
@Module({
  imports: [PrismaModule],
  controllers: [
    AppointmentsController,
    FlowboardController,
    AppointmentTypesController,
    ScheduleBlocksController,
    WaitlistController,
  ],
  providers: [AppointmentsService, SchedulingService],
  exports: [AppointmentsService, SchedulingService],
})
export class AppointmentsModule {}
