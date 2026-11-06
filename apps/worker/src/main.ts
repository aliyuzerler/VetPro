import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('worker-bootstrap');
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  const port = Number(process.env.WORKER_PORT ?? 4100);
  await app.listen(port, '0.0.0.0');
  logger.log(`Worker hazır: http://localhost:${port}/api/v1/health`);
}

void bootstrap();
