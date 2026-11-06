import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { EnvModule } from './config/env.module';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

/**
 * Faz 01: yalnızca altyapı modülleri.
 * İş mantığı modülleri (kimlik, hastalar, stok, finans...) sonraki fazlarda eklenir.
 */
@Module({
  imports: [EnvModule, PrismaModule, HealthModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
