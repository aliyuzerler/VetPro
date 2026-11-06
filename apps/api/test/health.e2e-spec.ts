import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthResponseSchema } from '@vetcore/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/global-exception.filter';

describe('Health uçları (e2e)', () => {
  let app: INestApplication;

  async function createApp(dbPing: 'ok' | 'fail'): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        ping:
          dbPing === 'ok'
            ? vi.fn(async () => 3)
            : vi.fn(async () => {
                throw new Error('bağlantı yok');
              }),
        isConnected: vi.fn(() => dbPing === 'ok'),
        $connect: vi.fn(async () => undefined),
        $disconnect: vi.fn(async () => undefined),
      })
      .compile();

    const testApp = moduleRef.createNestApplication();
    testApp.setGlobalPrefix('api/v1');
    testApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // Üretim main.ts ile aynı hata zarfı davranışı
    testApp.useGlobalFilters(new GlobalExceptionFilter());
    await testApp.init();
    return testApp;
  }

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined as unknown as INestApplication;
    }
  });

  it('GET /api/v1/health → 200 ve sözleşmeye uygun', async () => {
    app = await createApp('ok');
    const res = await request(app.getHttpServer()).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.header['x-correlation-id']).toBeDefined();
    const parsed = HealthResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe('ok');
      expect(parsed.data.service).toBe('vetcore-api');
      expect(parsed.data.checks.some((c) => c.name === 'api')).toBe(true);
    }
  });

  it('GET /api/v1/health/readiness → veritabanı erişilebilirken 200', async () => {
    app = await createApp('ok');
    const res = await request(app.getHttpServer()).get('/api/v1/health/readiness');

    expect(res.status).toBe(200);
    const parsed = HealthResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const dbCheck = parsed.data.checks.find((c) => c.name === 'database');
      expect(dbCheck?.status).toBe('ok');
      expect(parsed.data.status).toBe('ok');
    }
  });

  it('GET /api/v1/health/readiness → veritabanı erişilemezken 503 ve dürüst durum', async () => {
    app = await createApp('fail');
    const res = await request(app.getHttpServer()).get('/api/v1/health/readiness');

    expect(res.status).toBe(503);
    const parsed = HealthResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe('down');
      const dbCheck = parsed.data.checks.find((c) => c.name === 'database');
      expect(dbCheck?.status).toBe('down');
    }
  });

  it('hata zarfı korelasyon kimliği taşır', async () => {
    app = await createApp('fail');
    const res = await request(app.getHttpServer()).get('/api/v1/health/readiness');

    expect(res.body.correlationId).toBeDefined();
    expect(res.body.correlationId).not.toBe('bilinmiyor');
  });
});
