import { Module } from '@nestjs/common';
import { WorkerEnvModule } from './config/env.module';
import { HealthController } from './health/health.controller';
import { QueueModule } from './queues/queue.module';

/**
 * Faz 01: worker iskeleti. Gerçek iş mantığı sonraki fazlarda eklenir.
 */
@Module({
  imports: [WorkerEnvModule, QueueModule],
  controllers: [HealthController],
})
export class AppModule {}
