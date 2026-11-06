import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Uygulama genelinde tek Prisma istemcisi.
 * Faz 01: bağlantı hatası uygulamayı düşürmez; readiness kontrolü durumu raporlar.
 * Kritik stok/finans işlemleri sonraki fazlarda transaction ile bu servis üzerinden yapılır.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.connected = true;
      this.logger.log('PostgreSQL bağlantısı kuruldu');
    } catch (error) {
      this.connected = false;
      this.logger.warn(
        'PostgreSQL bağlantısı kurulamadı; readiness kontrolü durumu raporlayacaktır.',
      );
      this.logger.debug(
        `Bağlantı hatası: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.connected = false;
  }

  /** Basit erişilebilirlik kontrolü; gecikmeyi ms cinsinden döndürür. */
  async ping(): Promise<number> {
    const startedAt = performance.now();
    await this.$queryRaw`SELECT 1`;
    return Math.round(performance.now() - startedAt);
  }

  isConnected(): boolean {
    return this.connected;
  }
}
