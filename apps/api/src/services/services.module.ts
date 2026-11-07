import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

/**
 * Faz 06 — hizmet kataloğu, fiyatlar (geçerlilik tarihli, şube override'lı)
 * ve varsayılan tüketim kuralları. Fiyat çözümleme ServicesService.resolvePricesForRecord
 * üzerinden encounters modülüne sağlanır (ServiceRecord satır fiyatları).
 */
@Module({
  imports: [PrismaModule],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
