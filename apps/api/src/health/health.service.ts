import { Inject, Injectable, Logger } from '@nestjs/common';
import { HealthCheck, HealthResponse, HealthStatus } from '@vetcore/contracts';
import { APP_VERSION } from '@vetcore/domain';
import { ENV_TOKEN, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Liveness ve readiness kontrolleri.
 * Yanıtlar @vetcore/contracts şemalarıyla doğrulanır; testler aynı sözleşmeyi kullanır.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startedAt = Date.now();

  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  private baseFields(status: HealthStatus) {
    return {
      status,
      service: 'vetcore-api',
      version: APP_VERSION,
      environment: this.env.NODE_ENV,
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  async getLiveness(): Promise<HealthResponse> {
    const checks: HealthCheck[] = [{ name: 'api', status: 'ok', detail: 'Süreç çalışıyor' }];
    return { ...this.baseFields('ok'), checks };
  }

  async getReadiness(): Promise<HealthResponse> {
    const checks: HealthCheck[] = [{ name: 'api', status: 'ok', detail: 'Süreç çalışıyor' }];

    const dbCheck = await this.checkDatabase();
    checks.push(dbCheck);

    const overall: HealthStatus = checks.every((c) => c.status === 'ok')
      ? 'ok'
      : checks.some((c) => c.status === 'down')
        ? 'down'
        : 'degraded';

    return { ...this.baseFields(overall), checks };
  }

  private async checkDatabase(): Promise<HealthCheck> {
    try {
      const latencyMs = await this.prisma.ping();
      return {
        name: 'database',
        status: 'ok',
        latencyMs,
        detail: 'SELECT 1 başarılı',
      };
    } catch (error) {
      this.logger.warn(
        `Veritabanı erişilemiyor: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        name: 'database',
        status: 'down',
        latencyMs: null,
        detail: 'Veritabanı bağlantısı kurulamadı',
      };
    }
  }
}
