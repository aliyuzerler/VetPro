import { Controller, Get, Inject } from '@nestjs/common';
import { QueueService } from '../queues/queue.service';
import { WORKER_ENV_TOKEN, type WorkerEnv } from '../config/env';
import { APP_VERSION } from '@vetcore/domain';

@Controller('health')
export class HealthController {
  // Vitest/esbuild decorator metadata üretmediğinden bağımlılıklar açık @Inject ile çözümlenir.
  constructor(
    @Inject(QueueService) private readonly queueService: QueueService,
    @Inject(WORKER_ENV_TOKEN) private readonly env: WorkerEnv,
  ) {}

  @Get()
  getHealth() {
    const registry = this.queueService.getRegistry();
    return {
      status: 'ok' as const,
      service: 'vetcore-worker',
      version: APP_VERSION,
      environment: this.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      checks: [
        {
          name: 'queues',
          status: registry.enabled ? ('ok' as const) : ('degraded' as const),
          detail: registry.reason ?? `${registry.queues.length} kuyruk tanımlı`,
        },
      ],
    };
  }
}
