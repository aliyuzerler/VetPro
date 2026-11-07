import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsService } from './payments.service';
import { CashService } from './cash.service';
import { ExpensesService } from './expenses.service';
import { PaymentsController } from './payments.controller';
import { CashController } from './cash.controller';
import { ExpensesController } from './expenses.controller';

/**
 * Faz 09 — kasa, tahsilat, cari hesap ve giderler modülü.
 * AuditService global modülden sağlanır (AuditControllerModule @Global).
 */
@Module({
  imports: [PrismaModule],
  controllers: [PaymentsController, CashController, ExpensesController],
  providers: [PaymentsService, CashService, ExpensesService],
})
export class FinanceModule {}
