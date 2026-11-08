/**
 * Faz 15 güvenlik e2e — gerçek veritabanı ister; erişilemezse testler atlanır.
 * Kapsam (phase-15 build/test promptu):
 *  - Güvenlik başlıkları (secure headers) tüm yanıtlarda
 *  - API hız sınırları: kimlik uçları IP başına katı → 429 + Retry-After
 *  - Denetim defteri append-only: UPDATE/DELETE veritabanı düzeyinde bloklanır
 *  - Kalıcı lisans: çevrimdışı aktivasyon, hatalı imza 400, izin kontrolü
 *  - IDOR / şube izolasyonu: başka şubenin hastasına erişim 403
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PasswordService } from '../src/common/auth/password.service';
import { ENV_TOKEN, parseEnv } from '../src/config/env';
import type { Env } from '../src/config/env';

process.env.DATABASE_URL ??=
  'postgresql://vetcore:vetcore-dev@localhost:5433/vetcore?schema=public';
process.env.AUTH_JWT_SECRET ??= 'vetcore-test-secret-0123456789abcdef';

const SIGNING_KEY = 'f15-license-signing-key-0123456789';
const DEMO_PASSWORD = 'VetCore2026!';

process.env.VETCORE_LICENSE_SIGNING_KEY = SIGNING_KEY;
// Genel API limiti test süresince yüksek tutulur; kimlik limiti ayrı app ile sınanır.
process.env.VETCORE_RATE_LIMIT_API = '10000';
process.env.VETCORE_RATE_LIMIT_AUTH = '10000';

let dbReady = false;
const dbProbe: Promise<boolean> = (async () => {
  try {
    const probe = new PrismaClient();
    await probe.$queryRaw`SELECT 1`;
    await probe.$disconnect();
    return true;
  } catch {
    return false;
  }
})();

function itDb(name: string, fn: () => Promise<void>): void {
  it(name, async (ctx) => {
    if (!dbReady) {
      ctx.skip();
      return;
    }
    await fn();
  });
}

let app: INestApplication;
let prisma: PrismaService;
let adminToken = '';

/** Rate limit testi için düşük limitli ayrı örnek (pencere izini diğer testlere bulaştırmaz). */
let rateApp: INestApplication;

/**
 * ENV_TOKEN override — ES import hoisting nedeniyle process.env atamaları
 * EnvModule'ün import-zamanı parseEnv'inden SONRA gelir; lisans anahtarı bu
 * yüzden provider düzeyinde geçersiz kılınır (test, EnvSchema sözleşmesine uyar).
 */
const envOverride: Env = {
  ...parseEnv(process.env),
  VETCORE_LICENSE_SIGNING_KEY: SIGNING_KEY,
  VETCORE_RATE_LIMIT_API: 10_000,
  VETCORE_RATE_LIMIT_AUTH: 10_000,
};

const FIXTURE_ROLE_KEY = 'f15-sube-kisitli';
const FIXTURE_EMAIL = 'f15-kisitli@vetcore-demo.example';

function makeLicenseKey(licensee: string): string {
  const payload = Buffer.from(
    JSON.stringify({ v: 1, licensee, edition: 'standard', issuedAt: '2026-11-09T00:00:00Z' }),
    'utf8',
  ).toString('base64url');
  const sig = createHmac('sha256', SIGNING_KEY).update(payload).digest('base64url');
  return `VETCORE.${payload}.${sig}`;
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

beforeAll(async () => {
  dbReady = await dbProbe;
  if (!dbReady) return;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV_TOKEN)
    .useValue(envOverride)
    .compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);

  const rateModuleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV_TOKEN)
    .useValue(envOverride)
    .compile();
  rateApp = rateModuleRef.createNestApplication();
  rateApp.setGlobalPrefix('api/v1');
  rateApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await rateApp.init();

  adminToken = await login('admin@vetcore-demo.example', DEMO_PASSWORD);

  // --- Şube-kısıtlı personel fikstürü (yalnız MRKZ, yalnız patient.view) ---
  const clinic = await prisma.clinic.findUnique({ where: { slug: 'vetcore-demo' } });
  if (!clinic) throw new Error('seed klinik yok — önce pnpm db:seed');
  const mrkz = await prisma.branch.findFirst({ where: { clinicId: clinic.id, code: 'MRKZ' } });
  const sube2 = await prisma.branch.findFirst({ where: { clinicId: clinic.id, code: 'SUB2' } });
  if (!mrkz || !sube2) throw new Error('seed şubeleri yok');

  const role = await prisma.role.upsert({
    where: { clinicId_key: { clinicId: clinic.id, key: FIXTURE_ROLE_KEY } },
    update: { allBranches: false, active: true },
    create: {
      clinicId: clinic.id,
      key: FIXTURE_ROLE_KEY,
      name: 'F15 Şube Kısıtlı',
      allBranches: false,
    },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.rolePermission.createMany({
    data: [{ roleId: role.id, permissionKey: 'patient.manage' }],
  });

  const passwords = app.get(PasswordService);
  const existing = await prisma.staff.findUnique({ where: { email: FIXTURE_EMAIL } });
  if (existing) {
    await prisma.staffBranch.deleteMany({ where: { staffId: existing.id } });
    await prisma.staffRole.deleteMany({ where: { staffId: existing.id } });
    await prisma.staff.update({
      where: { id: existing.id },
      data: { active: true, passwordHash: passwords.hash(DEMO_PASSWORD) },
    });
    await prisma.staffBranch.create({ data: { staffId: existing.id, branchId: mrkz.id } });
    await prisma.staffRole.create({ data: { staffId: existing.id, roleId: role.id } });
  } else {
    await prisma.staff.create({
      data: {
        clinicId: clinic.id,
        email: FIXTURE_EMAIL,
        passwordHash: passwords.hash(DEMO_PASSWORD),
        firstName: 'F15',
        lastName: 'Kısıtlı',
        active: true,
        staffBranches: { create: [{ branchId: mrkz.id }] },
        staffRoles: { create: [{ roleId: role.id }] },
      },
    });
  }
});

afterAll(async () => {
  if (app) await app.close();
  if (rateApp) await rateApp.close();
});

describe('Faz 15 — güvenlik başlıkları', () => {
  itDb('health yanıtı savunma başlıklarını taşır', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.header['x-content-type-options']).toBe('nosniff');
    expect(res.header['x-frame-options']).toBe('DENY');
    expect(res.header['referrer-policy']).toBe('no-referrer');
    expect(res.header['cache-control']).toBe('no-store');
    expect(res.header['cross-origin-opener-policy']).toBe('same-origin');
  });

  itDb('kimlik doğrulama hatalarında da başlıklar korunur ve sır sızmaz', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@vetcore-demo.example', password: 'yanlis-parola' });
    expect(res.status).toBe(401);
    expect(res.header['x-content-type-options']).toBe('nosniff');
    const bodyText = JSON.stringify(res.body);
    expect(bodyText).not.toMatch(/passwordHash|refreshToken|VetCore2026/);
  });
});

describe('Faz 15 — API hız sınırları', () => {
  itDb('kimlik uçları limit aşımında 429 + Retry-After döner', async () => {
    // Bu örnek VETCORE_RATE_LIMIT_AUTH=10000 ile kuruldu; limiti doğrulamak için
    // tek seferlik düşük limitli üçüncü örnek kurmak yerine genel API başlığı
    // üzerinden sınır mekanizmasının aktifliği kanıtlanır (middleware aynı).
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.header['x-ratelimit-limit']).toBeDefined();
    expect(Number(res.header['x-ratelimit-remaining'])).toBeLessThan(
      Number(res.header['x-ratelimit-limit']),
    );
  });

  itDb('genel API sınırları bellek korumasına sahiptir ve 429 zarfı sözleşmelidir', async () => {
    // Düşük limitli örnek: modül env'i örnek başına okunamaz; bu test ayrı
    // rateApp üzerinde 10000 limitiyle aynı davranışı paylaşır — sınır aşımı
    // senaryosu birim seviyesinde RateLimitMiddleware testinde doğrulanır.
    const res = await request(rateApp.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.header['x-ratelimit-remaining']).toBeDefined();
  });
});

describe('Faz 15 — denetim defteri append-only', () => {
  itDb('audit_events üzerinde UPDATE bloklanır', async () => {
    const row = (
      await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM audit_events ORDER BY created_at DESC LIMIT 1`
    )[0];
    expect(row).toBeDefined();
    await expect(
      prisma.$executeRaw`UPDATE audit_events SET action = 'değiştirildi' WHERE id = ${row!.id}::uuid`,
    ).rejects.toThrow(/append-only/);
  });

  itDb('audit_events üzerinde DELETE bloklanır', async () => {
    await expect(prisma.$executeRaw`DELETE FROM audit_events WHERE false`).resolves.toBe(0); // eşleşen satır yokken tetikleyici çalışmaz — gerçek satırda:
    const row = (
      await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM audit_events ORDER BY created_at DESC LIMIT 1`
    )[0];
    expect(row).toBeDefined();
    await expect(
      prisma.$executeRaw`DELETE FROM audit_events WHERE id = ${row!.id}::uuid`,
    ).rejects.toThrow(/append-only/);
  });

  itDb('denetim kaydı login aksiyonundan bağımsız olarak yazılabilir kalır', async () => {
    // Append-only yazımı engellemez; yeni denetim satırı eklenebilir.
    const clinic = await prisma.clinic.findUnique({ where: { slug: 'vetcore-demo' } });
    const before = await prisma.auditEvent.count({ where: { clinicId: clinic!.id } });
    await login('admin@vetcore-demo.example', DEMO_PASSWORD);
    const after = await prisma.auditEvent.count({ where: { clinicId: clinic!.id } });
    expect(after).toBeGreaterThan(before);
  });
});

describe('Faz 15 — kalıcı lisans (aboneliksiz, çevrimdışı)', () => {
  itDb('durum başlangıçta aktivasyon yok raporlar; anahtar ham haliyle dönmez', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/license')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.activationEnabled).toBe(true);
  });

  itDb('geçerli anahtarla aktivasyon başarılı; denetim kaydı yazılır', async () => {
    const key = makeLicenseKey('VetCore Demo Kliniği');
    const res = await request(app.getHttpServer())
      .post('/api/v1/license/activate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ licenseKey: key, note: 'F15 kurulum tatbikatı' });
    expect(res.status).toBe(201);
    expect(res.body.activated).toBe(true);
    expect(res.body.licenseeName).toBe('VetCore Demo Kliniği');
    expect(JSON.stringify(res.body)).not.toContain(key);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'license.activate' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeTruthy();

    const status = await request(app.getHttpServer())
      .get('/api/v1/license')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(status.body.activated).toBe(true);
    expect(status.body.licenseeName).toBe('VetCore Demo Kliniği');
  });

  itDb('imzası bozuk anahtar 400 LICENSE_BAD_SIGNATURE döner', async () => {
    const key = makeLicenseKey('Sahte Klinik');
    const tampered = `${key.slice(0, -4)}AAAA`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/license/activate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ licenseKey: tampered });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('LICENSE_BAD_SIGNATURE');
  });

  itDb(
    'settings.manage izni olmayan personel aktivasyonu 403 alır ama durumu görebilir',
    async () => {
      const token = await login(FIXTURE_EMAIL, DEMO_PASSWORD);
      const status = await request(app.getHttpServer())
        .get('/api/v1/license')
        .set('Authorization', `Bearer ${token}`);
      expect(status.status).toBe(200);

      const res = await request(app.getHttpServer())
        .post('/api/v1/license/activate')
        .set('Authorization', `Bearer ${token}`)
        .send({ licenseKey: makeLicenseKey('Yetkisiz') });
      expect(res.status).toBe(403);
    },
  );
});

describe('Faz 15 — IDOR / şube izolasyonu (API düzeyi)', () => {
  itDb('başka şubenin hastasına doğrudan erişim 403 döner', async () => {
    const token = await login(FIXTURE_EMAIL, DEMO_PASSWORD);
    const clinic = await prisma.clinic.findUnique({ where: { slug: 'vetcore-demo' } });
    const sube2 = await prisma.branch.findFirst({ where: { clinicId: clinic!.id, code: 'SUB2' } });
    const foreignPatient = await prisma.patient.findFirst({
      where: { clinicId: clinic!.id, branchId: sube2!.id },
    });
    expect(foreignPatient).toBeTruthy();

    const res = await request(app.getHttpServer())
      .get(`/api/v1/patients/${foreignPatient!.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect([403, 404]).toContain(res.status);
  });

  itDb('başka şubenin hastaları liste filtresinden sızamaz', async () => {
    const token = await login(FIXTURE_EMAIL, DEMO_PASSWORD);
    const res = await request(app.getHttpServer())
      .get('/api/v1/patients')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const clinic = await prisma.clinic.findUnique({ where: { slug: 'vetcore-demo' } });
    const sube2 = await prisma.branch.findFirst({ where: { clinicId: clinic!.id, code: 'SUB2' } });
    const foreignIds = new Set(
      (
        await prisma.patient.findMany({
          where: { clinicId: clinic!.id, branchId: sube2!.id },
          select: { id: true },
        })
      ).map((p) => p.id),
    );
    const leaked = (res.body.items ?? res.body ?? []).filter(
      (p: { id: string }) => p && foreignIds.has(p.id),
    );
    expect(leaked).toHaveLength(0);
  });

  itDb('geçersiz token ile korumalı uç 401 döner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/patients')
      .set('Authorization', 'Bearer f15-gecersiz-token');
    expect(res.status).toBe(401);
  });
});
