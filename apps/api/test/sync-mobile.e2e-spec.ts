/* eslint-disable no-console */
/**
 * Faz 13 — mobil senkronizasyon entegrasyon testleri (gerçek veritabanı ister).
 * Kabul kriterleri (phase-13 test promptu):
 *  1. Mobil login/refresh ve session revoke çalışmalı.
 *  2. Push accepted → server ID/version ile sync.
 *  3. Aynı outbox item yeniden gönderilince duplicate — duplicate hizmet/ücret/stok yok.
 *  4. Conflict iki versiyonu korur; sessiz overwrite yok.
 *  5. Financial/stock finalize push'ta reddedilir — sunucu onayı olmadan posted görünmez.
 *  6. Rol ve şube yetkisi API düzeyinde zorlanır.
 *  7. Pull imleci delta döner; şube kapsamlıdır.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/global-exception.filter';
import { PasswordService } from '../src/common/auth/password.service';

process.env.DATABASE_URL ??=
  'postgresql://vetcore:vetcore-dev@localhost:5433/vetcore?schema=public';
process.env.AUTH_JWT_SECRET ??= 'vetcore-test-secret-0123456789abcdef';

const DEMO_PASSWORD = 'VetCore2026!';

/**
 * Kimlik akışı testi (login/refresh/revoke) PAYLAŞILAN demo personel ÜZERİNDEN
 * YÜRÜTÜLMEZ: refresh-tekrar-kullanım algısı personelin TÜM aktif oturumlarını
 * iptal eder (Faz 03 davranışı) — paralel koşumdaki diğer spec'lerin oturumlarını
 * 403'e düşürür (Faz 11 QA bulgusuyla aynı kesişim sınıfı). Bu yüzden akış,
 * yalnız bu spec'in kullanımına özel fikstür personeliyle yapılır.
 */
const DANCE_ROLE_KEY = 'f13-sync-dans';
const DANCE_EMAIL = 'f13-dans@vetcore-demo.example';

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

type LoginResponse = { accessToken: string; refreshToken: string };

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Beklenen statüde değilse gövdeyi yazdırır (hata teşhisi kalıcı yardımcı). */
function expectStatus(
  res: { status: number; body: Record<string, unknown> },
  expected: number,
  label: string,
): void {
  if (res.status !== expected) {
    console.error(`[${label}] beklenen ${expected}, gelen ${res.status}:`, JSON.stringify(res.body).slice(0, 500));
  }
  expect(res.status).toBe(expected);
}

let app: INestApplication;
let prisma: PrismaService;
let adminToken = '';
let veterinerToken = '';
let resepsiyonToken = '';
let stokToken = '';

let clinicId = '';
let merkezBranchId = '';
let sube2BranchId = '';
let patientId = '';
let appointmentTypeId = '';
let veterinerStaffId = '';

/** Testin ürettiği kayıtlar — afterAll temizliği için. */
const created = {
  encounterIds: [] as string[],
  appointmentIds: [] as string[],
  clientOperationIds: [] as string[],
  refreshTokens: [] as string[],
};

async function login(appRef: INestApplication, email: string): Promise<LoginResponse> {
  const res = await request(appRef.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: DEMO_PASSWORD });
  expect(res.status).toBe(200);
  created.refreshTokens.push((res.body as LoginResponse).refreshToken);
  return res.body as LoginResponse;
}

async function get(
  token: string,
  url: string,
  branchId?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await request(app.getHttpServer())
    .get(`/api/v1${url}`)
    .set(authHeader(token))
    .set(branchId ? { 'X-Branch-Id': branchId } : {});
  return { status: res.status, body: res.body as Record<string, unknown> };
}

async function post(
  token: string,
  url: string,
  body: Record<string, unknown> | undefined,
  branchId?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await request(app.getHttpServer())
    .post(`/api/v1${url}`)
    .set(authHeader(token))
    .set(branchId ? { 'X-Branch-Id': branchId } : {})
    .send(body ?? {});
  return { status: res.status, body: res.body as Record<string, unknown> };
}

type OpInput = {
  clientOperationId?: string;
  kind: string;
  entity?: string;
  entityId?: string;
  expectedVersion?: string;
  payload?: Record<string, unknown>;
};

async function push(
  token: string,
  operations: OpInput[],
  branchId?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const ops = operations.map((op) => ({
    clientOperationId: op.clientOperationId ?? randomUUID(),
    kind: op.kind,
    entity: op.entity ?? (op.kind.startsWith('encounter') ? 'encounter' : 'appointment'),
    ...(op.entityId ? { entityId: op.entityId } : {}),
    expectedVersion: op.expectedVersion ?? '0',
    payload: op.payload ?? {},
  }));
  for (const op of ops) created.clientOperationIds.push(op.clientOperationId);
  return post(token, '/sync/push', { operations: ops }, branchId);
}

type PushResult = {
  clientOperationId: string;
  status: string;
  code?: string;
  message?: string;
  result?: { serverId: string; version: string; snapshot: Record<string, unknown> };
};

/** Yarın verilen saat:dakika klinik yerel saati (UTC+03) — seed randevularıyla çakışmaz. */
function tomorrowAt(hour: number, minute: number): { start: string; end: string; dateISO: string } {
  const now = new Date();
  const ist = new Date(now.getTime() + 180 * 60_000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate() + 1).padStart(2, '0');
  const dateISO = `${y}-${m}-${d}`;
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  const start = new Date(`${dateISO}T${hh}:${mm}:00.000Z`).toISOString();
  const end = new Date(new Date(start).getTime() + 30 * 60_000).toISOString();
  return { start, end, dateISO };
}

beforeAll(async () => {
  dbReady = await dbProbe;
  if (!dbReady) return;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
  await app.listen(0);

  prisma = app.get(PrismaService);
  const clinic = await prisma.clinic.findUnique({ where: { slug: 'vetcore-demo' } });
  if (!clinic) throw new Error('Seed klinik bulunamadı — önce seed çalıştırılmalı');
  clinicId = clinic.id;

  const branches = await prisma.branch.findMany({ where: { clinicId: clinic.id } });
  merkezBranchId = branches.find((b) => b.code === 'MRKZ')?.id ?? '';
  sube2BranchId = branches.find((b) => b.code === 'SUB2')?.id ?? '';

  const patient = await prisma.patient.findFirst({
    where: { clinicId: clinic.id, code: 'HP-0001' },
    select: { id: true },
  });
  patientId = patient?.id ?? '';

  const type = await prisma.appointmentType.findFirst({
    where: { clinicId: clinic.id },
    select: { id: true },
  });
  appointmentTypeId = type?.id ?? '';

  const vet = await prisma.staff.findUnique({
    where: { email: 'veteriner@vetcore-demo.example' },
    select: { id: true },
  });
  veterinerStaffId = vet?.id ?? '';

  adminToken = (await login(app, 'admin@vetcore-demo.example')).accessToken;
  veterinerToken = (await login(app, 'veteriner@vetcore-demo.example')).accessToken;
  resepsiyonToken = (await login(app, 'resepsiyon@vetcore-demo.example')).accessToken;
  stokToken = (await login(app, 'stok@vetcore-demo.example')).accessToken;

  // Kimlik-akışı fikstürü: özel rol + personel (paralel koşum güvenliği).
  const passwords = app.get(PasswordService);
  const hash = passwords.hash(DEMO_PASSWORD);
  const danceRole = await prisma.role.upsert({
    where: { clinicId_key: { clinicId, key: DANCE_ROLE_KEY } },
    update: { name: 'F13 Senkron Dans Fikstür' },
    create: {
      clinicId,
      key: DANCE_ROLE_KEY,
      name: 'F13 Senkron Dans Fikstür',
      isSystem: false,
    },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: danceRole.id } });
  const danceStaff = await prisma.staff.upsert({
    where: { email: DANCE_EMAIL },
    update: { passwordHash: hash, active: true },
    create: {
      clinicId,
      email: DANCE_EMAIL,
      passwordHash: hash,
      firstName: 'Senkron',
      lastName: 'Dans',
      title: 'F13 Fikstür',
    },
  });
  // Refresh payload'ı rol + şube ister: fikstüre tek rol ve tek şube bağlanır.
  await prisma.staffRole.upsert({
    where: { staffId_roleId: { staffId: danceStaff.id, roleId: danceRole.id } },
    update: {},
    create: { staffId: danceStaff.id, roleId: danceRole.id },
  });
  await prisma.staffBranch.upsert({
    where: { staffId_branchId: { staffId: danceStaff.id, branchId: merkezBranchId } },
    update: {},
    create: { staffId: danceStaff.id, branchId: merkezBranchId, isDefault: true },
  });
}, 120_000);

afterAll(async () => {
  if (prisma) {
    // Kimlik-akışı fikstürü temizliği (oturumlar + personel + rol).
    const danceStaff = await prisma.staff.findUnique({ where: { email: DANCE_EMAIL }, select: { id: true } });
    if (danceStaff) {
      await prisma.session.deleteMany({ where: { staffId: danceStaff.id } });
      await prisma.staffRole.deleteMany({ where: { staffId: danceStaff.id } });
      await prisma.staffBranch.deleteMany({ where: { staffId: danceStaff.id } });
      await prisma.staff.delete({ where: { id: danceStaff.id } });
    }
    await prisma.rolePermission.deleteMany({ where: { role: { key: DANCE_ROLE_KEY } } });
    await prisma.role.deleteMany({ where: { clinicId, key: DANCE_ROLE_KEY } });

    await prisma.syncOperation.deleteMany({
      where: { clinicId, clientOperationId: { in: created.clientOperationIds } },
    });
    await prisma.encounter.deleteMany({ where: { id: { in: created.encounterIds } } });
    await prisma.appointment.deleteMany({ where: { id: { in: created.appointmentIds } } });
  }
  await app?.close();
});

describe('Faz 13 — mobil senkronizasyon', () => {
  itDb('1. mobil login → refresh rotasyonu → logout (session revoke) akışı', async () => {
    // Akış özel fikstür personeliyle yürütülür: reuse-detection personelin tüm
    // oturumlarını iptal ettiğinden paralel spec'ler etkilenmemelidir.
    const dance = await login(app, DANCE_EMAIL);
    expect(dance.accessToken).toBeTruthy();
    expect(dance.refreshToken).toBeTruthy();

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: dance.refreshToken });
    expect(refreshRes.status).toBe(200);
    const rotated = refreshRes.body as LoginResponse;
    expect(rotated.accessToken).toBeTruthy();
    expect(rotated.refreshToken).not.toBe(dance.refreshToken);

    // Eski refresh token tekrar kullanılırsa rotasyon ailesi iptal edilir (401).
    const reuse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: dance.refreshToken });
    expect(reuse.status).toBe(401);

    // Oturumu kapat (revoke) → erişim anahtarı oturum doğrulamasında düşer.
    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: rotated.refreshToken });
    expect([200, 204]).toContain(logoutRes.status);

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(rotated.accessToken));
    expect(meRes.status).toBe(401);
  });

  itDb('2. /sync/kinds beyaz listesi finalize/finance/stock içermez', async () => {
    const res = await get(adminToken, '/sync/kinds', merkezBranchId);
    expect(res.status).toBe(200);
    const kinds = res.body['kinds'] as string[];
    expect(kinds).toContain('encounter.create_draft');
    expect(kinds).toContain('appointment.check_in');
    for (const forbidden of ['service.finalize', 'finance.payment', 'stock.consume', 'encounter.sign']) {
      expect(kinds).not.toContain(forbidden);
    }
  });

  itDb('3. çevrimdışı taslak push → accepted + serverId/version/snapshot', async () => {
    const res = await push(veterinerToken, [
      {
        kind: 'encounter.create_draft',
        payload: {
          patientId,
          chiefComplaint: 'Çevrimdışı açılan taslak — kusma',
          subjective: 'Sahip: dün akşamdan beri iştahsız',
          objective: 'KM: 38.9, sıvı kaybı hafif',
        },
      },
    ], merkezBranchId);
    expect(res.status).toBe(201);
    const results = res.body['results'] as PushResult[];
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe('accepted');
    expect(results[0]!.result?.serverId).toBeTruthy();
    expect(results[0]!.result?.version).toBe('1');
    expect(results[0]!.result?.snapshot['status']).toBe('draft');

    const serverId = results[0]!.result!.serverId;
    created.encounterIds.push(serverId);

    // Sunucu kaydı gerçekten oluştu ve içerik birebir.
    const detail = await get(veterinerToken, `/encounters/${serverId}`, merkezBranchId);
    expect(detail.status).toBe(200);
    expect(detail.body['chiefComplaint']).toBe('Çevrimdışı açılan taslak — kusma');
  });

  itDb('4. update_draft sürüm ilerletir; bayat sürüm CONFLICT + sunucu anlık görüntüsü döner', async () => {
    const createRes = await push(veterinerToken, [
      { kind: 'encounter.create_draft', payload: { patientId, chiefComplaint: 'Sürüm testi' } },
    ], merkezBranchId);
    const createdOp = (createRes.body['results'] as PushResult[])[0]!;
    const encounterId = createdOp.result!.serverId;
    created.encounterIds.push(encounterId);

    // Aynı sürümle (1) iki farklı güncelleme: ilki kabul, ikincisi çakışır.
    const opIdA = randomUUID();
    const opIdB = randomUUID();
    const resA = await push(veterinerToken, [
      { clientOperationId: opIdA, kind: 'encounter.update_draft', entity: 'encounter', entityId: encounterId, expectedVersion: '1', payload: { assessment: 'Gastroenterit şüphesi' } },
    ], merkezBranchId);
    expect((resA.body['results'] as PushResult[])[0]!.status).toBe('accepted');
    expect((resA.body['results'] as PushResult[])[0]!.result?.version).toBe('2');

    const resB = await push(veterinerToken, [
      { clientOperationId: opIdB, kind: 'encounter.update_draft', entity: 'encounter', entityId: encounterId, expectedVersion: '1', payload: { plan: 'Serum + antiemetik' } },
    ], merkezBranchId);
    const conflict = (resB.body['results'] as PushResult[])[0]!;
    expect(conflict.status).toBe('conflict');
    expect(conflict.code).toBe('SYNC_VERSION_CONFLICT');
    expect(conflict.result?.version).toBe('2');
    // Çakışma ekranının iki versiyonu görmesi için sunucu alanları anlık görüntüde.
    expect(conflict.result?.snapshot['assessment']).toBe('Gastroenterit şüphesi');
    expect(conflict.result?.snapshot['plan']).toBeNull();

    // Yerel versiyon sunucudan okunup güncellenirse (expectedVersion=2) kabul edilir.
    // Çakışma çözümü yeni bir istemci işlemi olarak kuyruğa girer (yeni
    // client_operation_id) — sunucuda aynı anahtar ilk yazımın kaydıdır.
    const resC = await push(veterinerToken, [
      { clientOperationId: randomUUID(), kind: 'encounter.update_draft', entity: 'encounter', entityId: encounterId, expectedVersion: '2', payload: { plan: 'Serum + antiemetik' } },
    ], merkezBranchId);
    expect((resC.body['results'] as PushResult[])[0]!.status).toBe('accepted');
    expect((resC.body['results'] as PushResult[])[0]!.result?.version).toBe('3');
  });

  itDb('5. aynı outbox item yeniden gönderilince duplicate — çift taslak oluşmaz', async () => {
    const opId = randomUUID();
    const first = await push(veterinerToken, [
      { clientOperationId: opId, kind: 'encounter.create_draft', payload: { patientId, chiefComplaint: 'REPLAY testi' } },
    ], merkezBranchId);
    const firstResult = (first.body['results'] as PushResult[])[0]!;
    expect(firstResult.status).toBe('accepted');
    created.encounterIds.push(firstResult.result!.serverId);

    const second = await push(veterinerToken, [
      { clientOperationId: opId, kind: 'encounter.create_draft', payload: { patientId, chiefComplaint: 'REPLAY testi' } },
    ], merkezBranchId);
    const secondResult = (second.body['results'] as PushResult[])[0]!;
    expect(secondResult.status).toBe('duplicate');
    // Replay, ilk uygulamanın sonucunu da taşır (istemci sync'i tamamlar).
    expect(secondResult.result?.serverId).toBe(firstResult.result!.serverId);

    const count = await prisma.encounter.count({
      where: { id: firstResult.result!.serverId },
    });
    expect(count).toBe(1);
  });

  itDb('6. eşzamanlı aynı-anahtar push — yalnız biri uygular (P2002 yarış güvencesi)', async () => {
    const opId = randomUUID();
    const [a, b] = await Promise.all([
      push(veterinerToken, [{ clientOperationId: opId, kind: 'encounter.create_draft', payload: { patientId, chiefComplaint: 'Yarış testi' } }], merkezBranchId),
      push(veterinerToken, [{ clientOperationId: opId, kind: 'encounter.create_draft', payload: { patientId, chiefComplaint: 'Yarış testi' } }], merkezBranchId),
    ]);
    const statuses = [a, b].map((r) => (r.body['results'] as PushResult[])[0]!.status).sort();
    expect(statuses).toEqual(['accepted', 'duplicate']);
    const acceptedResult = (a.body['results'] as PushResult[])[0]!.status === 'accepted'
      ? (a.body['results'] as PushResult[])[0]!
      : (b.body['results'] as PushResult[])[0]!;
    created.encounterIds.push(acceptedResult.result!.serverId);
  });

  itDb('7. randevu check-in/status/cancel push akışı + geçersiz geçiş reddi', async () => {
    const slot = tomorrowAt(10, 7);
    const createRes = await post(veterinerToken, '/appointments', {
      patientId,
      appointmentTypeId,
      staffId: veterinerStaffId,
      startAt: slot.start,
      endAt: slot.end,
      notes: 'Faz 13 senkron test randevusu',
    }, merkezBranchId);
    expectStatus(createRes, 201, 'randevu oluştur');
    const appointmentId = createRes.body['id'] as string;
    created.appointmentIds.push(appointmentId);

    const detail = await get(veterinerToken, `/appointments/${appointmentId}`, merkezBranchId);
    const version0 = String(new Date(detail.body['updatedAt'] as string).getTime());

    const checkIn = await push(veterinerToken, [
      { kind: 'appointment.check_in', entity: 'appointment', entityId: appointmentId, expectedVersion: version0, payload: {} },
    ], merkezBranchId);
    const checkInResult = (checkIn.body['results'] as PushResult[])[0]!;
    expect(checkInResult.status).toBe('accepted');
    expect(checkInResult.result?.snapshot['status']).toBe('arrived');
    expect(checkInResult.result?.snapshot['checkedInAt']).toBeTruthy();
    const version1 = checkInResult.result!.version;

    // Bayat sürümle ikinci işlem → CONFLICT (iki versiyon korunur).
    const conflict = await push(veterinerToken, [
      { kind: 'appointment.status', entity: 'appointment', entityId: appointmentId, expectedVersion: version0, payload: { status: 'waiting' } },
    ], merkezBranchId);
    expect((conflict.body['results'] as PushResult[])[0]!.status).toBe('conflict');

    // Güncel sürümle geçerli geçiş → kabul + damga.
    const waiting = await push(veterinerToken, [
      { kind: 'appointment.status', entity: 'appointment', entityId: appointmentId, expectedVersion: version1, payload: { status: 'waiting' } },
    ], merkezBranchId);
    const waitingResult = (waiting.body['results'] as PushResult[])[0]!;
    expect(waitingResult.status).toBe('accepted');
    expect(waitingResult.result?.snapshot['waitingAt']).toBeTruthy();

    // Geçersiz sıra (waiting → scheduled yok) → rejected APPOINTMENT_INVALID_TRANSITION.
    const invalid = await push(veterinerToken, [
      { kind: 'appointment.status', entity: 'appointment', entityId: appointmentId, expectedVersion: waitingResult.result!.version, payload: { status: 'completed' } },
    ], merkezBranchId);
    expect((invalid.body['results'] as PushResult[])[0]!.status).toBe('rejected');

    // İptal — gerekçe zorunlu, makine izin veriyorsa accepted.
    const cancelNoReason = await push(veterinerToken, [
      { kind: 'appointment.cancel', entity: 'appointment', entityId: appointmentId, expectedVersion: waitingResult.result!.version, payload: {} },
    ], merkezBranchId);
    expect((cancelNoReason.body['results'] as PushResult[])[0]!.status).toBe('rejected');

    const cancel = await push(veterinerToken, [
      { kind: 'appointment.cancel', entity: 'appointment', entityId: appointmentId, expectedVersion: waitingResult.result!.version, payload: { reason: 'Sahip gelemedi' } },
    ], merkezBranchId);
    const cancelResult = (cancel.body['results'] as PushResult[])[0]!;
    expect(cancelResult.status).toBe('accepted');
    expect(cancelResult.result?.snapshot['status']).toBe('cancelled');
    expect(cancelResult.result?.snapshot['closedAt']).toBeTruthy();
  });

  itDb('8. finalize/finance/stock push\'u reddedilir — sunucu onayı olmadan posted görünmez', async () => {
    for (const kind of ['service.finalize', 'finance.payment', 'stock.consume']) {
      const res = await push(veterinerToken, [
        { kind, entity: kind.startsWith('service') ? 'encounter' : 'appointment', payload: {} },
      ], merkezBranchId);
      const result = (res.body['results'] as PushResult[])[0]!;
      expect(result.status).toBe('rejected');
      expect(result.code).toBe('SYNC_KIND_NOT_ALLOWED');
      expect(result.message).toContain('sunucu onay');
    }
  });

  itDb('9. rol yetkisi API düzeyinde — izinsiz personel push\'u reddedilir', async () => {
    // Stok personeli appointment.manage / encounter.manage iznine sahip değil.
    // Kendi şubesiyle (SUB2) gönderir — şube 403'ü değil izin reddini kanıtlamak için.
    const res = await push(stokToken, [
      { kind: 'encounter.create_draft', payload: { patientId } },
    ], sube2BranchId);
    const result = (res.body['results'] as PushResult[] | undefined)?.[0];
    if (!result) {
      console.error('[stok push] gövde:', JSON.stringify(res.body).slice(0, 300));
    }
    expect(result!.status).toBe('rejected');
    expect(result!.code).toBe('SYNC_PERMISSION_DENIED');

    // Resepsiyon encounter.manage iznine sahip değil (randevu izinleri var).
    const res2 = await push(resepsiyonToken, [
      { kind: 'encounter.create_draft', payload: { patientId } },
    ], merkezBranchId);
    const resepsiyonResult = (res2.body['results'] as PushResult[] | undefined)?.[0];
    if (!resepsiyonResult) {
      console.error('[resepsiyon push] gövde:', JSON.stringify(res2.body).slice(0, 300));
    }
    expect(resepsiyonResult!.code).toBe('SYNC_PERMISSION_DENIED');
  });

  itDb('10. şube kapsamı — aktif şube uyuşmazlığı ve diğer şube kaydına erişim reddi', async () => {
    const slot = tomorrowAt(11, 33);
    const createRes = await post(veterinerToken, '/appointments', {
      patientId,
      appointmentTypeId,
      staffId: veterinerStaffId,
      notes: 'Şube kapsam testi',
      startAt: slot.start,
      endAt: slot.end,
    }, merkezBranchId);
    expectStatus(createRes, 201, 'şube testi randevu');
    const appointmentId = createRes.body['id'] as string;
    created.appointmentIds.push(appointmentId);
    const detail = await get(veterinerToken, `/appointments/${appointmentId}`, merkezBranchId);
    const version = String(new Date(detail.body['updatedAt'] as string).getTime());

    // Aktif şube SUB2 ama kayıt MRKZ'de → SYNC_BRANCH_MISMATCH.
    // Veteriner tek şubeli olduğundan SUB2 başlığı guard'da 403 olur; çapraz
    // şube senaryosunu allBranches yetkili admin kanıtlar (guard geçer, servis
    // düzeyi uyuşmazlık kontrolü çalışır).
    const mismatch = await push(adminToken, [
      { kind: 'appointment.check_in', entity: 'appointment', entityId: appointmentId, expectedVersion: version, payload: {} },
    ], sube2BranchId);
    const mismatchResult = (mismatch.body['results'] as PushResult[] | undefined)?.[0];
    if (!mismatchResult) {
      console.error('[şube uyuşmazlığı] gövde:', JSON.stringify(mismatch.body).slice(0, 300));
    }
    expect(mismatchResult!.status).toBe('rejected');
    expect(mismatchResult!.code).toBe('SYNC_BRANCH_MISMATCH');
  });

  itDb('11. push doğrulama — 50 üzeri toplu işlem ve geçersiz anahtar 400', async () => {
    const tooMany = Array.from({ length: 51 }, () => ({
      clientOperationId: randomUUID(),
      kind: 'encounter.create_draft',
      entity: 'encounter',
      payload: { patientId },
    }));
    const res = await push(veterinerToken, tooMany, merkezBranchId);
    expectStatus(res, 400, '51 işlem sınırı');

    const badId = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set(authHeader(veterinerToken))
      .set({ 'X-Branch-Id': merkezBranchId })
      .send({
        operations: [
          { clientOperationId: 'geçersiz-anahtar', kind: 'encounter.create_draft', entity: 'encounter', payload: { patientId } },
        ],
      });
    expect(badId.status).toBe(400);

    const unknownKind = await push(veterinerToken, [
      { kind: 'encounter.sign', entity: 'encounter', payload: {} },
    ], merkezBranchId);
    expect((unknownKind.body['results'] as PushResult[])[0]!.code).toBe('SYNC_KIND_NOT_ALLOWED');
  });

  itDb('12. pull — delta imleci ilerler, şube filtresi uygulanır', async () => {
    // İlk pull: tam yükleme (imleç yok).
    const first = await get(veterinerToken, '/sync/pull?limit=200', merkezBranchId);
    expect(first.status).toBe(200);
    expect(Array.isArray(first.body['items'])).toBe(true);
    const nextCursor = first.body['nextCursor'] as string;
    expect(nextCursor).toBeTruthy();

    // İmleç sonrası push → delta bu değişikliği döndürmeli.
    const createRes = await push(veterinerToken, [
      { kind: 'encounter.create_draft', payload: { patientId, chiefComplaint: 'Pull delta testi' } },
    ], merkezBranchId);
    const pushResult = (createRes.body['results'] as PushResult[])[0]!;
    created.encounterIds.push(pushResult.result!.serverId);

    const delta = await get(veterinerToken, `/sync/pull?cursor=${encodeURIComponent(nextCursor)}&limit=200`, merkezBranchId);
    expectStatus(delta, 200, 'delta pull');
    const items = delta.body['items'] as { entity: string; data: Record<string, unknown> }[];
    const encounterItems = items.filter((i) => i.entity === 'encounter');
    const createdInDelta = encounterItems.find((i) => i.data['id'] === pushResult.result!.serverId);
    expect(createdInDelta).toBeTruthy();
    expect(createdInDelta!.data['chiefComplaint']).toBe('Pull delta testi');
    // Randevu tarafında değişiklik yok — randevu delta'sı boş kalmalı (filigran).
    const appointmentItems = items.filter((i) => i.entity === 'appointment');
    const staleAppointment = appointmentItems.find((i) => created.appointmentIds.includes(i.data['id'] as string));
    if (staleAppointment) {
      console.error('[delta] beklenmeyen randevu satırı:', JSON.stringify(staleAppointment.data).slice(0, 300));
    }
    expect(staleAppointment).toBeFalsy();

    // Yeni imleçle tekrar pull → aynı kayıt tekrar gelmez.
    const second = await get(veterinerToken, `/sync/pull?cursor=${encodeURIComponent(delta.body['nextCursor'] as string)}&limit=200`, merkezBranchId);
    const secondItems = second.body['items'] as { entity: string; data: Record<string, unknown> }[];
    expect(secondItems.find((i) => i.data['id'] === pushResult.result!.serverId)).toBeFalsy();

    // Şube filtresi: SUB2 aktif şubeyken MRKZ taslağı gelmez. Veteriner tek
    // şubeli olduğundan çapraz-şube pull'u allBranches yetkili admin yapar.
    const sube2 = await get(adminToken, '/sync/pull?limit=200', sube2BranchId);
    expectStatus(sube2, 200, 'sube2 pull');
    const sube2Items = sube2.body['items'] as { entity: string; data: Record<string, unknown> }[];
    expect(sube2Items.find((i) => i.data['id'] === pushResult.result!.serverId)).toBeFalsy();

    // Geçersiz imleç → 400 SYNC_CURSOR_INVALID.
    const badCursor = await get(veterinerToken, '/sync/pull?cursor=%%%gecersiz', merkezBranchId);
    expect(badCursor.status).toBe(400);
  });

  itDb('13. kimlik doğrulaması olmadan sync uçları 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .send({ operations: [] });
    expect(res.status).toBe(401);
    const res2 = await request(app.getHttpServer()).get('/api/v1/sync/pull');
    expect(res2.status).toBe(401);
  });
});
