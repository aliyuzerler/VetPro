import { Module } from '@nestjs/common';
import { OwnerPatientsController, PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

/** Hasta (hayvan) modülü — şube kapsamlı kayıtlar (Faz 04). */
@Module({
  controllers: [PatientsController, OwnerPatientsController],
  providers: [PatientsService],
})
export class PatientsModule {}
