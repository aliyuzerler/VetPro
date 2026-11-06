import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { QUEUE_NAMES } from '@vetcore/contracts';
import { WORKER_ENV_TOKEN, type WorkerEnv } from '../config/env';
import { buildQueueRegistry, type QueueRegistry } from './queue-registry';

/**
 * Faz 01: BullMQ iskeleti.
 * REDIS_URL tanımlıysa bağlantı kurulur ve kuyruk adları doğrulanır;
 * tanımlı değilse worker pasif modda açılır ve liveness yanıt vermeye devam eder.
 * Gerçek işleyiciler bildirim/rapor fazlarında (Faz 12+) eklenir.
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private registry: QueueRegistry;

  constructor(@Inject(WORKER_ENV_TOKEN) private readonly env: WorkerEnv) {
    this.registry = buildQueueRegistry(env.REDIS_URL);
  }

  async onModuleInit(): Promise<void> {
    if (!this.registry.enabled) {
      this.logger.warn(this.registry.reason ?? 'Kuyruk bağlantısı devre dışı');
      return;
    }
    this.logger.log(`BullMQ bağlantısı hazırlanıyor: ${this.env.REDIS_URL}`);
    // Faz 01'de işleyici bulunmadığından kalıcı tüketici başlatılmaz.
    // Redis bağlantı sağlığı Faz 08+ işlemleriyle birlikte aktif izlenecektir.
    this.logger.log(
      `Tanımlı kuyruklar: ${Object.values(QUEUE_NAMES).join(', ')} (işleyici yok)`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Worker kapanıyor');
  }

  getRegistry(): QueueRegistry {
    return this.registry;
  }
}
