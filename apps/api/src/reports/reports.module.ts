import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PdfRendererService } from '../documents/pdf.renderer';
import { LocalPrivateStorageAdapter } from '../files/private-storage';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Raporlar — Faz 14. PdfRendererService belgelerle aynı Türkçe font zincirini
 * paylaşır; LocalPrivateStorageAdapter export dosyalarını HTTP dışı dizinde
 * tutar (ADR-018). Audit kayıtları REPORT_EXPORT action ile yazılır.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [ReportsService, PdfRendererService, LocalPrivateStorageAdapter],
  exports: [ReportsService],
})
export class ReportsModule {}
