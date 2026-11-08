import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { IntegrationAdapterFactory } from './adapters/sandbox-adapters';

/** Entegrasyonlar — Faz 12 (adapter sözleşmesi + sandbox stub, secret'sız config). */
@Module({
  imports: [PrismaModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, IntegrationAdapterFactory],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
