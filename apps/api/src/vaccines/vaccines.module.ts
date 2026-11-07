import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { VaccinesController } from './vaccines.controller';
import { VaccinesService } from './vaccines.service';

/** Aşı protokolü, aşı kaydı, takvim ve hatırlatmalar — Faz 10. */
@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [VaccinesController],
  providers: [VaccinesService],
  exports: [VaccinesService],
})
export class VaccinesModule {}
