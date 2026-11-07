import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

/**
 * Denetim defteri. AuditService neredeyse tüm iş modüllerinin bağımlılığıdır;
 * PrismaModule gibi global sunulur (Faz 03 modül grafiğini sade tutmak için).
 */
@Global()
@Module({
  providers: [AuditService],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditControllerModule {}
