import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LocalPrivateStorageAdapter } from '../files/private-storage';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

/**
 * Yedekleme — Faz 14. backup.manage izni yalnız yönetici şablonunda (owner-
 * only). Mantıksal döküm + AES-256-GCM zarf + manifest checksum; restore
 * runbook'u docs/RESTORE_RUNBOOK.md'de.
 */
@Module({
  imports: [PrismaModule],
  controllers: [BackupController],
  providers: [BackupService, LocalPrivateStorageAdapter],
  exports: [BackupService],
})
export class BackupModule {}
