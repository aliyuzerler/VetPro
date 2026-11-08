import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { PdfRendererService } from './pdf.renderer';

/** Belgeler — Faz 12 (6 PDF belge türü, Türkçe karakter + klinik marka). */
@Module({
  imports: [PrismaModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, PdfRendererService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
