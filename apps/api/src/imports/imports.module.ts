import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

/**
 * İçe aktarma — Faz 14. Şablon üretimi, doğrulama/önizleme, duplicate çözümü
 * ve commit; import.manage izni ile. Denetim: IMPORT_UPLOADED / IMPORT_COMMITTED.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}
