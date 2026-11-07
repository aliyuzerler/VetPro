import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsService } from './products.service';
import { SuppliersService } from './suppliers.service';
import { StockService } from './stock.service';
import { ProductsController } from './products.controller';
import { SuppliersController } from './suppliers.controller';
import { StockController } from './stock.controller';

/**
 * Faz 07 — ürün, tedarikçi, parti ve stok defteri modülü.
 * AuditService global modülden sağlanır (AuditControllerModule @Global).
 */
@Module({
  imports: [PrismaModule],
  controllers: [ProductsController, SuppliersController, StockController],
  providers: [ProductsService, SuppliersService, StockService],
  exports: [StockService],
})
export class InventoryModule {}
