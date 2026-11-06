import { Global, Module } from '@nestjs/common';
import { WORKER_ENV_TOKEN, parseWorkerEnv } from './env';

@Global()
@Module({
  providers: [
    {
      provide: WORKER_ENV_TOKEN,
      useValue: parseWorkerEnv(process.env as Record<string, string | undefined>),
    },
  ],
  exports: [WORKER_ENV_TOKEN],
})
export class WorkerEnvModule {}
