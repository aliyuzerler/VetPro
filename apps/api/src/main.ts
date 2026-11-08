import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { ENV_TOKEN } from './config/env';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const logger = new Logger('bootstrap');
  const app = await NestFactory.create(AppModule);
  const env = app.get<Env>(ENV_TOKEN);

  // Faz 15 — CORS izin listesi: liste boşsa hiçbir çapraz köken tarayıcı isteği
  // kabul edilmez; web arayüzü aynı kökenden ters vekil üzerinden servis edilir.
  app.enableCors({
    origin: env.VETCORE_CORS_ORIGINS,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id', 'idempotency-key'],
    maxAge: 600,
    credentials: false,
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();

  // Faz 15 — Swagger yalnızca açıkça istenirse yayında kalır (üretimde kapalı).
  if (env.VETCORE_ENABLE_SWAGGER) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('VetCore API')
      .setDescription(
        'VetCore veteriner klinik yönetim platformu REST API. Faz 01: yalnızca health uçları yayındadır.',
      )
      .setVersion('0.1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    logger.log('Swagger: /api/docs (VETCORE_ENABLE_SWAGGER=true)');
  }

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');

  logger.log(`API hazır: http://localhost:${port}/api/v1/health`);
}

void bootstrap();
