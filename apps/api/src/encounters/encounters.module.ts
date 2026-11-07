import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ServicesModule } from '../services/services.module';
import { InventoryModule } from '../inventory/inventory.module';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';
import { ServiceFinalizationService } from './service-finalization.service';

/**
 * Faz 06 — muayene kayıtları (SOAP), vital bulgular, tanı, ek dosya, addendum
 * ve hizmet kayıtları. İmza kilit politikası servis seviyesinde uygulanır:
 * signed encounter doğrudan update/delete edilemez (409 ENCOUNTER_SIGNED),
 * düzeltmeler yalnız clinical.sign izniyle addendum olarak yazılır ve denetim
 * defterine ADDENDUM_CREATED olarak işlenir. Hizmet satır fiyatları
 * ServicesModule'ün fiyat çözümlemesinden gelir (geçerlilik + şube override).
 * Faz 08 — ServiceFinalizationService, InventoryModule'ün stok defteriyle
 * atomik finalize/reversal yürütür (hizmet → stok → ücret tek transaction).
 */
@Module({
  imports: [PrismaModule, ServicesModule, InventoryModule],
  controllers: [EncountersController],
  providers: [EncountersService, ServiceFinalizationService],
  exports: [EncountersService],
})
export class EncountersModule {}
