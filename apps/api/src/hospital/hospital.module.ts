import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { HospitalController } from './hospital.controller';
import { HospitalService } from './hospital.service';

/** Yatış — Faz 11 (kennel, kabul/transfer/taburculuk, gözlem, sarf). */
@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [HospitalController],
  providers: [HospitalService],
  exports: [HospitalService],
})
export class HospitalModule {}
