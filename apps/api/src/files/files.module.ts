import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

/**
 * Hasta dosyaları modülü — private storage adaptörü (ADR-018).
 * FilesService varsayılan olarak LocalPrivateStorageAdapter'ı kurar (PRIVATE_STORAGE_DIR);
 * S3 uyumlu adaptör 'PRIVATE_STORAGE_ADAPTER' token'ı ile sonradan eklenebilir.
 */
@Module({
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
