import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { LabController } from './lab.controller';
import { LabService } from './lab.service';

/** Laboratuvar — Faz 11 (katalog, sipariş, numune, sonuç, kritik uyarı). */
@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [LabController],
  providers: [LabService],
  exports: [LabService],
})
export class LabModule {}
