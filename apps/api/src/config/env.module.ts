import { Global, Module } from '@nestjs/common';
import { ENV_TOKEN, parseEnv } from './env';

/**
 * Doğrulanmış ortam değişkenlerini ENV_TOKEN üzerinden sunar.
 * Testlerde override edilebilir.
 */
@Global()
@Module({
  providers: [
    {
      provide: ENV_TOKEN,
      useValue: parseEnv(process.env as Record<string, string | undefined>),
    },
  ],
  exports: [ENV_TOKEN],
})
export class EnvModule {}
