/**
 * Faz 03 kimlik akışı entegrasyon testleri — gerçek veritabanı ister.
 * Veritabanı erişilemezse test takımı atlanır (CI'da DATABASE_URL sağlanmalıdır).
 * Senaryo: login → izinler → şube kapsamı → refresh rotasyonu + tekrar-kullanım
 * algısı → izin matrisi güncellemesi → denetim kaydı → logout.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PasswordService } from '../src/common/auth/password.service';

process.env.DATABASE_URL ??=
  'postgresql://vetcore:vetcore-dev@localhost:5433/vetcore?schema=public';
process.env.AUTH_JWT_SECRET ??= 'vetcore-test-secret-0123456789abcdef';

const DEMO_PASSWORD = 'VetCore2026!';

/** DB yoksa testler tek tek atlanır (beforeAll probe sonucuna göre). */
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

/** DB bağlı değilse testi atlayan, bağlıysa gövdeyi çalıştıran it sarıcısı. */
function itDb(name: string, fn: () => Promise<void>): void {
  it(name, async (ctx) => {
    if (!dbReady) {
      ctx.skip();
      return;
    }
    await fn();
  });
}

const branchIds: Record<string, string> = {};
let adminToken = '';
let izinsizToken = '';

/**
 * Bu fikstür, "izin sıfır" personel testini PAYLAŞILAN resepsiyon rolünü bozmadan
 * yürütür: özel 'f03-izinsiz' rolü + 'izinsiz@vetcore-demo.example' personeli.
 * (Geçmişte resepsiyon rolünün izinleri siliniyordu; paralel spec koşumunda diğer
 * dosyaların resepsiyon testlerini 403'e düşürüyordu — kesişim hatası.)
 */
const FIXTURE_ROLE_KEY = 'f03-izinsiz';
const FIXTURE_EMAIL = 'izinsiz@vetcore-demo.example';

async function login(email: string, password: string) {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password });
  return response;
}

let app: INestApplication;
let prisma: PrismaService;

beforeAll(async () => {
  dbReady = await dbProbe;
  if (!dbReady) return;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  // main.ts ile aynı doğrulama davranışı (whitelist strip dahil) — üretim paritesi
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return;
  }

  // --- Düzeltici düzne (idempotent test fikstürü) ---
  // Faz 04'ten itibaren izin kataloğu faza göre büyür; sabit liste tutmak yerine
  // katalogdaki TÜM izinler admin rolüne eşitlenir (seed'in ALL davranışıyla paralel).
  const passwords = app.get(PasswordService);
  const hash = passwords.hash(DEMO_PASSWORD);

  const clinic = await prisma.clinic.upsert({
    where: { slug: 'vetcore-demo' },
    update: {},
    create: { name: 'VetCore Demo Kliniği', slug: 'vetcore-demo' },
  });

  const merkez = await prisma.branch.upsert({
    where: { clinicId_code: { clinicId: clinic.id, code: 'MRKZ' } },
    update: {},
    create: { clinicId: clinic.id, name: 'Merkez Şube', code: 'MRKZ', isPrimary: true },
  });
  const sube2 = await prisma.branch.upsert({
    where: { clinicId_code: { clinicId: clinic.id, code: 'SUB2' } },
    update: {},
    create: { clinicId: clinic.id, name: 'İkinci Şube', code: 'SUB2' },
  });
  branchIds.MRKZ = merkez.id;
  branchIds.SUB2 = sube2.id;

  // Katalog, seed tarafından tutulur (prisma/permissions.ts tek kaynaktır); test
  // fikstürü fazdan bağımsız olarak katalogdaki TÜM izinleri admin'e eşitler.
  const permissionKeys = (await prisma.permission.findMany({ select: { key: true } })).map(
    (p) => p.key,
  );
  if (permissionKeys.length === 0) {
    throw new Error('İzin kataloğu boş — önce `pnpm db:seed` çalıştırın');
  }

  const adminRole = await prisma.role.upsert({
    where: { clinicId_key: { clinicId: clinic.id, key: 'admin' } },
    update: { allBranches: true },
    create: {
      clinicId: clinic.id,
      key: 'admin',
      name: 'Klinik Yöneticisi',
      isSystem: true,
      allBranches: true,
    },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: adminRole.id } });
  await prisma.rolePermission.createMany({
    data: permissionKeys.map((permissionKey) => ({ roleId: adminRole.id, permissionKey })),
  });

  const resepsiyonRole = await prisma.role.upsert({
    where: { clinicId_key: { clinicId: clinic.id, key: 'resepsiyon' } },
    update: {},
    create: { clinicId: clinic.id, key: 'resepsiyon', name: 'Resepsiyon', isSystem: true },
  });
  // Paylaşılan resepsiyon rolü bozulmaz — aksine kataloğu eşleşen şablon izinleri
  // geri yüklenir (paralel/geçmiş koşumlardan kalan kirli durumu iyileştirir).
  const canonicalResepsiyon = [
    'owner.manage',
    'patient.manage',
    'appointment.manage',
    'prescription.manage',
    'vaccine.manage',
  ];
  await prisma.rolePermission.deleteMany({ where: { roleId: resepsiyonRole.id } });
  await prisma.rolePermission.createMany({
    data: canonicalResepsiyon
      .filter((key) => permissionKeys.includes(key))
      .map((permissionKey) => ({ roleId: resepsiyonRole.id, permissionKey })),
  });

  // İzinsiz personel fikstürü — yalnız bu spec'in kullanımına özel rol.
  const fixtureRole = await prisma.role.upsert({
    where: { clinicId_key: { clinicId: clinic.id, key: FIXTURE_ROLE_KEY } },
    update: { name: 'F03 İzinsiz Fikstür' },
    create: {
      clinicId: clinic.id,
      key: FIXTURE_ROLE_KEY,
      name: 'F03 İzinsiz Fikstür',
      isSystem: false,
    },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: fixtureRole.id } });

  const izinsiz = await prisma.staff.upsert({
    where: { email: FIXTURE_EMAIL },
    update: { passwordHash: hash, active: true },
    create: {
      clinicId: clinic.id,
      email: FIXTURE_EMAIL,
      passwordHash: hash,
      firstName: 'İzinsiz',
      lastName: 'Fikstür',
      title: 'F03 Fikstür',
    },
  });

  const admin = await prisma.staff.upsert({
    where: { email: 'admin@vetcore-demo.example' },
    update: { passwordHash: hash, active: true },
    create: {
      clinicId: clinic.id,
      email: 'admin@vetcore-demo.example',
      passwordHash: hash,
      firstName: 'Deniz',
      lastName: 'Yıldız',
      title: 'Klinik Yöneticisi',
    },
  });
  const resepsiyon = await prisma.staff.upsert({
    where: { email: 'resepsiyon@vetcore-demo.example' },
    update: { passwordHash: hash, active: true },
    create: {
      clinicId: clinic.id,
      email: 'resepsiyon@vetcore-demo.example',
      passwordHash: hash,
      firstName: 'Mert',
      lastName: 'Kaya',
      title: 'Resepsiyon',
    },
  });

  for (const [staffId, roleId] of [
    [admin.id, adminRole.id],
    [izinsiz.id, fixtureRole.id],
  ] as const) {
    await prisma.staffRole.upsert({
      where: { staffId_roleId: { staffId, roleId } },
      update: {},
      create: { staffId, roleId },
    });
  }
  for (const [staffId, branchId] of [
    [admin.id, merkez.id],
    [admin.id, sube2.id],
    [izinsiz.id, merkez.id],
  ] as const) {
    await prisma.staffBranch.upsert({
      where: { staffId_branchId: { staffId, branchId } },
      update: {},
      create: { staffId, branchId },
    });
  }
}, 60_000);

afterAll(async () => {
  await app?.close();
});

describe('Faz 03 kimlik akışı (API entegrasyon)', () => {
  itDb('01 — parolasız/yanlış parola girişi 401 döner', async () => {
    const wrong = await login('admin@vetcore-demo.example', 'yanlis-parola-1');
    expect(wrong.status).toBe(401);
    const unknown = await login('yok@vetcore-demo.example', 'parola-parola');
    expect(unknown.status).toBe(401);
  });

  itDb('02 — yönetici girişi başarılı: token, roller, tüm şubeler', async () => {
    const response = await login('admin@vetcore-demo.example', DEMO_PASSWORD);
    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.refreshToken).toBeTruthy();
    expect(response.body.roles.map((r: { key: string }) => r.key)).toContain('admin');
    expect(response.body.branches).toHaveLength(2);
    expect(response.body.activeBranch.code).toBe('MRKZ');
    adminToken = response.body.accessToken;
  });

  itDb('03 — izin kataloğu zorunlu beş izni içerir', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/permissions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    const keys = response.body.map((p: { key: string }) => p.key);
    for (const required of [
      'clinical.sign',
      'inventory.adjust',
      'finance.refund',
      'reports.export',
      'audit.view',
    ]) {
      expect(keys).toContain(required);
    }
  });

  itDb('04 — token olmadan korunan uç 401 döner', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/rooms');
    expect(response.status).toBe(401);
  });

  itDb('05 — izinsiz personel girişi: izinsiz uç 403, şube kapsamı 403', async () => {
    const loginResponse = await login(FIXTURE_EMAIL, DEMO_PASSWORD);
    expect(loginResponse.status).toBe(200);
    izinsizToken = loginResponse.body.accessToken;
    expect(loginResponse.body.permissions).toHaveLength(0);

    const staffList = await request(app.getHttpServer())
      .get('/api/v1/staff')
      .set('Authorization', `Bearer ${izinsizToken}`);
    expect(staffList.status).toBe(403); // staff.manage izni yok

    const otherBranch = await request(app.getHttpServer())
      .get('/api/v1/rooms')
      .query({ branchId: branchIds.SUB2 })
      .set('Authorization', `Bearer ${izinsizToken}`);
    expect(otherBranch.status).toBe(403); // Şube B kapsamı

    const ownBranch = await request(app.getHttpServer())
      .get('/api/v1/rooms')
      .query({ branchId: branchIds.MRKZ })
      .set('Authorization', `Bearer ${izinsizToken}`);
    expect(ownBranch.status).toBe(200);
  });

  itDb('06 — yönetici Şube B odalarını görebilir (allBranches)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/rooms')
      .query({ branchId: branchIds.SUB2 })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  itDb('07 — izin matrisi güncellenir ve denetim defterine yazılır', async () => {
    const roles = await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${adminToken}`);
    const fixtureRoleDto = roles.body.find((r: { key: string }) => r.key === FIXTURE_ROLE_KEY);
    expect(fixtureRoleDto).toBeTruthy();

    const update = await request(app.getHttpServer())
      .put(`/api/v1/roles/${fixtureRoleDto.id}/permissions`)
      .send({ permissionKeys: ['reports.export'] })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(update.status).toBe(200);

    // Değişikliği geri al (temiz fixture): boş izinler
    const revert = await request(app.getHttpServer())
      .put(`/api/v1/roles/${fixtureRoleDto.id}/permissions`)
      .send({ permissionKeys: [] })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(revert.status).toBe(200);

    const audit = await request(app.getHttpServer())
      .get('/api/v1/audit-events')
      .query({ action: 'role.permissions.update', take: 10 })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(audit.status).toBe(200);
    expect(audit.body.total).toBeGreaterThanOrEqual(2);
    const latest = audit.body.items[0];
    expect(latest.metadata.after).toEqual([]);
    expect(latest.metadata.before).toEqual(['reports.export']);
  });

  itDb('08 — audit.view izni olmayan personel denetimi göremez', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/audit-events')
      .set('Authorization', `Bearer ${izinsizToken}`);
    expect(response.status).toBe(403);
  });

  itDb('09 — refresh rotasyonu: eski token tek kullanımlıktır', async () => {
    const loginResponse = await login('admin@vetcore-demo.example', DEMO_PASSWORD);
    const first = loginResponse.body.refreshToken;

    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first });
    expect(rotated.status).toBe(200);
    const second = rotated.body.refreshToken;
    expect(second).not.toBe(first);

    // Eski token tekrar sunulursa: tekrar-kullanım algısı → tüm oturumlar kapanır
    const reuse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first });
    expect(reuse.status).toBe(401);

    // Yeni token da tekrar-kullanım kapatması nedeniyle artık geçersiz
    const afterReuse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: second });
    expect(afterReuse.status).toBe(401);
  });

  itDb('10 — logout sonrası refresh token geçersizdir', async () => {
    const loginResponse = await login('admin@vetcore-demo.example', DEMO_PASSWORD);
    const refreshToken = loginResponse.body.refreshToken;

    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken });
    expect([200, 204]).toContain(logout.status);

    const refresh = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });
    expect(refresh.status).toBe(401);
  });

  itDb('11 — aktif şube değişimi çalışır ve denetlenir', async () => {
    const loginResponse = await login('admin@vetcore-demo.example', DEMO_PASSWORD);
    const token = loginResponse.body.accessToken;

    const response = await request(app.getHttpServer())
      .patch('/api/v1/auth/active-branch')
      .send({ branchId: branchIds.SUB2 })
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.code).toBe('SUB2');

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.body.activeBranch.id).toBe(branchIds.SUB2);
  });

  itDb('12 — yetkisiz rol ataması engellenir, yetkili atama denetime yazılır', async () => {
    // Test 09'daki tekrar-kullanım kapatması tüm yönetici oturumlarını geçersiz kıldı;
    // taze giriş yap (rotasyon davranışının doğal sonucu).
    const freshLogin = await login('admin@vetcore-demo.example', DEMO_PASSWORD);
    expect(freshLogin.status).toBe(200);
    const freshToken = freshLogin.body.accessToken;

    // Yeni bir sentetik personel oluştur (tamamı yönetici tarafından)
    const roles = await request(app.getHttpServer())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${freshToken}`);
    const fixtureRoleDto = roles.body.find((r: { key: string }) => r.key === FIXTURE_ROLE_KEY);

    const email = `test-${randomUUID().slice(0, 8)}@vetcore-demo.example`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/staff')
      .send({
        email,
        password: 'TestParola-2026!',
        firstName: 'Test',
        lastName: 'Personel',
        roleIds: [fixtureRoleDto.id],
        branchIds: [branchIds.MRKZ],
      })
      .set('Authorization', `Bearer ${freshToken}`);
    expect(created.status).toBe(201);
    const staffId = created.body.id;

    // İzinsiz personel yönetemez
    const forbidden = await request(app.getHttpServer())
      .put(`/api/v1/staff/${staffId}/roles`)
      .send({ roleIds: [fixtureRoleDto.id] })
      .set('Authorization', `Bearer ${izinsizToken}`);
    expect(forbidden.status).toBe(403);

    // Yetkili atama denetim kaydına düşer
    const audit = await request(app.getHttpServer())
      .get('/api/v1/audit-events')
      .query({ action: 'staff.create', take: 5 })
      .set('Authorization', `Bearer ${freshToken}`);
    expect(audit.body.total).toBeGreaterThanOrEqual(1);
    expect(audit.body.items[0].entityId).toBe(staffId);
  });
});
