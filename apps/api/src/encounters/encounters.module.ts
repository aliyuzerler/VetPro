import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ServicesModule } from '../services/services.module';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';

/**
 * Faz 06 — muayene kayıtları (SOAP), vital bulgular, tanı, ek dosya, addendum
 * ve hizmet kayıtları. İmza kilit politikası servis seviyesinde uygulanır:
 * signed encounter doğrudan update/delete edilemez (409 ENCOUNTER_SIGNED),
 * düzeltmeler yalnız clinical.sign izniyle addendum olarak yazılır ve denetim
 * defterine ADDENDUM_CREATED olarak işlenir. Hizmet satır fiyatları
 * ServicesModule'ün fiyat çözümlemesinden gelir (geçerlilik + şube override).
 */
@Module({
  imports: [PrismaModule, ServicesModule],
  controllers: [EncountersController],
  providers: [EncountersService],
  exports: [EncountersService],
})
export class EncountersModule {}
