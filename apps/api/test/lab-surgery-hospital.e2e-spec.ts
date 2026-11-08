import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/global-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.DATABASE_URL ??=
  'postgresql://vetcore:vetcore-dev@localhost:5433/vetcore?schema=public';
process.env.AUTH_JWT_SECRET ??= 'vetcore-test-secret-0123456789abcdef';

/**
 * Faz 11 API E2E — laboratuvar, cerrahi ve yatış kabul kriterleri:
 * 1. Lab order status lifecycle doğru olmalı (ordered→collected→in_progress→completed;
 *    geçersiz geçiş 409; terminal durumdan çıkış yok).
 * 2. Kritik laboratuvar sonucu yetkili klinisyen ekranında uyarı üretmeli
 *    (/lab/results/critical'de listelenir; onay yalnız clinical.sign sahiplerinde).
 * 3. Cerrahi kaydı encounter/patient/vet ile bağlı olmalı; ameliyat öncesi
 *    kontrol listesi tamamlanmadan başlatılamamalı.
 * 4. Yatış kabul/transfer/taburculuk tarihleri ve kennel çakışması kontrol edilmeli
 *    (409 KENNEL_CONFLICT; taburculuk pencereyi kapatır).
 * 5. Yatış tedavi sarfı ortak service-stock transaction servisini kullanmalı
 *    (refType=HospitalMedication hareketi + bakiye düşüşü; yetersiz stok 409).
 * 6. Yetki ve branch scope tüm modüllerde uygulanmalı (lab/surgery/hospital.manage;
 *    X-Branch-Id kapsamı; izinsiz rol 403).
 *
 * Ön koşul: gömülü PostgreSQL + migrate + seed (scripts/f11-api-e2e.sh).
 */

const DEMO_PASSWORD = 'VetCore2026!';
const runId = `f11-${Date.now().toString(36)}`;
/**
 * Idempotency anahtarları UUID formatında ve koşuma özgü üretilir
 * (sabit/düz metin anahtarlar @IsUUID doğrulamasından 400 ile döner).
 */
const runNonce = Math.random().toString(16).slice(2, 11).padEnd(9, '0');
const idemKey = (n: number) => `b1100000-0000-4000-8000-${runNonce}${String(n % 1000).padStart(3, '0')}`;

let dbReady = false;
function itDb(name: string, fn: () => Promise<void>): void {
  it(name, async (ctx: { skip(): void }) => {
    if (!dbReady) {
      ctx.skip();
      return;
    }
    await fn();
  });
}

type LoginResponse = { accessToken: string };

async function login(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: DEMO_PASSWORD });
  expect(res.status).toBe(200);
  return (res.body as LoginResponse).accessToken;
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

interface ApiErrorBody {
  code?: string;
  message?: string;
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
let merkezWarehouseId = '';
let patientId = '';
let ownerId = '';
let veterinerStaffId = '';
let adminStaffId = '';
let cbcTestId = '';
let gluTestId = '';
let kennelK1 = '';
let kennelK2 = '';
let surgeryRoomId = '';
let amoxProductId = '';

// Testin ürettiği kayıtlar (temizlik için)
const created = {
  labOrderIds: [] as string[],
  labTestIds: [] as string[],
  kennelIds: [] as string[],
  stayIds: [] as string[],
  surgeryIds: [] as string[],
  medicationIds: [] as string[],
};

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

beforeAll(async () => {
  const probe = new (await import('@prisma/client')).PrismaClient();
  try {
    await probe.$queryRaw`SELECT 1`;
    dbReady = true;
  } catch {
    dbReady = false;
  } finally {
    await probe.$disconnect();
  }
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
  const warehouses = await prisma.warehouse.findMany({ where: { branchId: merkezBranchId } });
  merkezWarehouseId = warehouses.find((w) => w.name === 'Merkez Ana Depo')?.id ?? '';

  const patient = await prisma.patient.findFirst({
    where: { clinicId: clinic.id, code: 'HP-0002' },
    select: { id: true, ownerId: true },
  });
  patientId = patient?.id ?? '';
  ownerId = patient?.ownerId ?? '';

  const vet = await prisma.staff.findUnique({
    where: { email: 'veteriner@vetcore-demo.example' },
    select: { id: true },
  });
  veterinerStaffId = vet?.id ?? '';
  const admin = await prisma.staff.findUnique({
    where: { email: 'admin@vetcore-demo.example' },
    select: { id: true },
  });
  adminStaffId = admin?.id ?? '';

  const cbc = await prisma.labCatalog.findFirst({
    where: { clinicId: clinic.id, code: 'LAB-CBC' },
  });
  cbcTestId = cbc?.id ?? '';
  const glu = await prisma.labCatalog.findFirst({
    where: { clinicId: clinic.id, code: 'LAB-GLU' },
  });
  gluTestId = glu?.id ?? '';

  const kennels = await prisma.kennel.findMany({
    where: { branchId: merkezBranchId },
    orderBy: { code: 'asc' },
  });
  kennelK1 = kennels[0]?.id ?? '';
  kennelK2 = kennels[1]?.id ?? '';

  const room = await prisma.room.findFirst({
    where: { branchId: merkezBranchId, kind: 'surgery' },
  });
  surgeryRoomId = room?.id ?? '';

  const amox = await prisma.product.findFirst({
    where: { clinicId: clinic.id, code: 'UR-AMOX250' },
  });
  amoxProductId = amox?.id ?? '';

  adminToken = await login(app, 'admin@vetcore-demo.example');
  veterinerToken = await login(app, 'veteriner@vetcore-demo.example');
  resepsiyonToken = await login(app, 'resepsiyon@vetcore-demo.example');
  stokToken = await login(app, 'stok@vetcore-demo.example');
});

afterAll(async () => {
  if (!dbReady) return;
  // Defter append-only: temizlik session_replication_role=replica baypasıyla.
  const stayIds = created.stayIds;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
    await tx.auditEvent.deleteMany({
      where: {
        OR: [
          { entityType: 'LabCatalog', entityId: { in: created.labTestIds } },
          { entityType: 'LabOrder', entityId: { in: created.labOrderIds } },
          { entityType: 'LabResult' },
          { entityType: 'Kennel', entityId: { in: created.kennelIds } },
          { entityType: 'HospitalStay', entityId: { in: stayIds } },
          { entityType: 'SurgeryCase', entityId: { in: created.surgeryIds } },
        ],
      },
    });
    await tx.labResult.deleteMany({ where: { orderId: { in: created.labOrderIds } } });
    await tx.sample.deleteMany({ where: { orderId: { in: created.labOrderIds } } });
    await tx.labOrder.deleteMany({ where: { id: { in: created.labOrderIds } } });
    await tx.labCatalog.deleteMany({ where: { id: { in: created.labTestIds } } });
    await tx.medicationAdministration.deleteMany({ where: { stayId: { in: stayIds } } });
    await tx.hospitalObservation.deleteMany({ where: { stayId: { in: stayIds } } });
    await tx.hospitalStay.deleteMany({ where: { id: { in: stayIds } } });
    await tx.surgeryChecklist.deleteMany({ where: { surgeryCaseId: { in: created.surgeryIds } } });
    await tx.anesthesiaRecord.deleteMany({ where: { surgeryCaseId: { in: created.surgeryIds } } });
    await tx.surgeryCase.deleteMany({ where: { id: { in: created.surgeryIds } } });
    await tx.kennel.deleteMany({ where: { id: { in: created.kennelIds } } });
  });
  await app.close();
});

// ============================================================================
// 1. Lab order status lifecycle (kabul kriteri 1)
// ============================================================================

describe('Lab order lifecycle', () => {
  itDb('ordered → sample_collected → in_progress → completed tam akış', async () => {
    const createdOrder = await post(
      veterinerToken,
      '/lab/orders',
      {
        patientId,
        testId: cbcTestId,
        veterinarianId: veterinerStaffId,
        priority: 'routine',
        notes: `F11 e2e ${runId}`,
      },
      merkezBranchId,
    );
    expect(createdOrder.status).toBe(201);
    const orderId = createdOrder.body.id as string;
    created.labOrderIds.push(orderId);
    expect(createdOrder.body.status).toBe('ordered');

    // ordered → in_progress atlama reddedilir
    const skip = await post(veterinerToken, `/lab/orders/${orderId}/start`, {}, merkezBranchId);
    expect(skip.status).toBe(409);
    expect((skip.body as ApiErrorBody).code).toBe('LAB_ORDER_INVALID_TRANSITION');

    const collected = await post(
      veterinerToken,
      `/lab/orders/${orderId}/collect`,
      {},
      merkezBranchId,
    );
    expect(collected.status).toBe(201);
    expect(collected.body.status).toBe('sample_collected');
    expect((collected.body.sample as Record<string, unknown>).labelCode).toMatch(/^LAB-/);

    // sonuç yalnız in_progress'ta girilebilir
    const earlyResult = await post(
      veterinerToken,
      `/lab/orders/${orderId}/results`,
      { value: 10 },
      merkezBranchId,
    );
    expect(earlyResult.status).toBe(409);

    const started = await post(veterinerToken, `/lab/orders/${orderId}/start`, {}, merkezBranchId);
    expect(started.status).toBe(201);
    expect(started.body.status).toBe('in_progress');

    const completed = await post(
      veterinerToken,
      `/lab/orders/${orderId}/results`,
      { value: 12.4 },
      merkezBranchId,
    );
    expect(completed.status).toBe(201);
    expect(completed.body.status).toBe('completed');
    const result = (completed.body as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.flag).toBe('normal');
    expect(result.isCritical).toBe(false);

    // terminal durumdan geçiş yok
    const again = await post(veterinerToken, `/lab/orders/${orderId}/start`, {}, merkezBranchId);
    expect(again.status).toBe(409);
  });

  itDb('iptal akışı ve terminal durum koruması', async () => {
    const createdOrder = await post(
      veterinerToken,
      '/lab/orders',
      { patientId, testId: gluTestId, veterinarianId: veterinerStaffId },
      merkezBranchId,
    );
    expect(createdOrder.status).toBe(201);
    const orderId = createdOrder.body.id as string;
    created.labOrderIds.push(orderId);
    const cancelled = await post(
      veterinerToken,
      `/lab/orders/${orderId}/cancel`,
      { reason: 'Hasta taburcu olduğu için gerek kalmadı' },
      merkezBranchId,
    );
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.status).toBe('cancelled');
    const recollect = await post(
      veterinerToken,
      `/lab/orders/${orderId}/collect`,
      {},
      merkezBranchId,
    );
    expect(recollect.status).toBe(409);
  });
});

// ============================================================================
// 2. Kritik sonuç uyarısı (kabul kriteri 2)
// ============================================================================

describe('Kritik lab sonucu uyarısı', () => {
  itDb('kritik değer uyarı listesinde belirir; onay yalnız yetkili klinisyende', async () => {
    const createdOrder = await post(
      veterinerToken,
      '/lab/orders',
      { patientId, testId: gluTestId, veterinarianId: veterinerStaffId, priority: 'urgent' },
      merkezBranchId,
    );
    expect(createdOrder.status).toBe(201);
    const orderId = createdOrder.body.id as string;
    created.labOrderIds.push(orderId);
    await post(veterinerToken, `/lab/orders/${orderId}/collect`, {}, merkezBranchId);
    await post(veterinerToken, `/lab/orders/${orderId}/start`, {}, merkezBranchId);
    // 40 mg/dL — kritik alt eşik (45) altında
    const result = await post(
      veterinerToken,
      `/lab/orders/${orderId}/results`,
      { value: 40 },
      merkezBranchId,
    );
    expect(result.status).toBe(201);
    const resultPayload = (result.body as Record<string, unknown>).result as Record<string, unknown>;
    expect(resultPayload.isCritical).toBe(true);
    expect(resultPayload.flag).toBe('critical_low');

    const criticals = await get(veterinerToken, '/lab/results/critical?window=open', merkezBranchId);
    expect(criticals.status).toBe(200);
    const items = criticals.body.items as Array<Record<string, unknown>>;
    const mine = items.find((item) => item.orderId === orderId);
    expect(mine).toBeDefined();
    expect(mine?.flag).toBe('critical_low');

    // resepsiyon uyarıyı GÖRÜR ama onaylayamaz (lab.manage var, clinical.sign yok)
    const resepsiyonList = await get(
      resepsiyonToken,
      '/lab/results/critical?window=open',
      merkezBranchId,
    );
    expect(resepsiyonList.status).toBe(200);
    const resultId = (mine as Record<string, unknown>).id as string;
    const resepsiyonAck = await post(
      resepsiyonToken,
      `/lab/results/${resultId}/acknowledge`,
      {},
      merkezBranchId,
    );
    expect(resepsiyonAck.status).toBe(403);

    // veteriner (clinical.sign) onaylar; ikinci onay 409
    const ack = await post(veterinerToken, `/lab/results/${resultId}/acknowledge`, {}, merkezBranchId);
    expect(ack.status).toBe(201);
    const ackAgain = await post(
      veterinerToken,
      `/lab/results/${resultId}/acknowledge`,
      {},
      merkezBranchId,
    );
    expect(ackAgain.status).toBe(409);

    const openAfter = await get(veterinerToken, '/lab/results/critical?window=open', merkezBranchId);
    const openItems = openAfter.body.items as Array<Record<string, unknown>>;
    expect(openItems.find((item) => item.orderId === orderId)).toBeUndefined();
  });
});

// ============================================================================
// 3. Cerrahi bağlantı ve kontrol listesi (kabul kriteri 3)
// ============================================================================

describe('Cerrahi olgu', () => {
  itDb('encounter/patient/vet bağlantılı üretilir; öncelikle encounter bağlı', async () => {
    const encounter = await post(
      veterinerToken,
      '/encounters',
      { patientId, veterinarianId: veterinerStaffId },
      merkezBranchId,
    );
    // Encounter endpoint'i varsa kullan; yoksa testsiz devam etme
    expect(encounter.status).toBe(201);
    const encounterId = encounter.body.id as string;

    const createdCase = await post(
      veterinerToken,
      '/surgeries',
      {
        patientId,
        ownerId,
        veterinarianId: veterinerStaffId,
        procedure: 'Ovariohisterektomi (F11 e2e)',
        plannedStart: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        plannedDurationMin: 90,
        roomId: surgeryRoomId,
        encounterId,
      },
      merkezBranchId,
    );
    expect(createdCase.status).toBe(201);
    const caseId = createdCase.body.id as string;
    created.surgeryIds.push(caseId);
    expect(createdCase.body.patient).toMatchObject({ id: patientId });
    expect(createdCase.body.owner).toMatchObject({ id: ownerId });
    expect(createdCase.body.veterinarian).toMatchObject({ id: veterinerStaffId });
    expect(createdCase.body.encounterId).toBe(encounterId);
    expect(createdCase.body.status).toBe('planned');
    expect((createdCase.body.room as Record<string, unknown>).kind).toBe('surgery');

    // planned → in_surgery atlama reddedilir
    const skip = await post(veterinerToken, `/surgeries/${caseId}/start`, {}, merkezBranchId);
    expect(skip.status).toBe(409);

    // hazırlığa geçiş kontrol listelerini üretir
    const prepped = await post(veterinerToken, `/surgeries/${caseId}/prep`, {}, merkezBranchId);
    expect(prepped.status).toBe(201);
    expect(prepped.body.status).toBe('prepped');
    const checklists = prepped.body.checklists as Array<Record<string, unknown>>;
    const pre = checklists.find((c) => c.kind === 'pre');
    expect(pre).toBeDefined();
    expect(pre?.total).toBe(5);
    expect(pre?.done).toBe(0);

    // kontrol listesi tamamlanmadan ameliyat başlatılamaz
    const blocked = await post(veterinerToken, `/surgeries/${caseId}/start`, {}, merkezBranchId);
    expect(blocked.status).toBe(409);
    expect((blocked.body as ApiErrorBody).code).toBe('SURGERY_CHECKLIST_INCOMPLETE');

    // tüm pre maddelerini işaretle
    for (let index = 0; index < 5; index += 1) {
      const toggle = await post(
        veterinerToken,
        `/surgeries/${caseId}/checklists/pre/items`,
        { index, done: true },
        merkezBranchId,
      );
      expect(toggle.status).toBe(201);
    }

    // anestezi çizelgesi kaydedilir (tek kayıt upsert)
    const anesthesia = await post(
      veterinerToken,
      `/surgeries/${caseId}/anesthesia`,
      {
        asaClass: 'II',
        premedication: 'Metokad 0.2 ml SC',
        inductionAgent: 'Propofol',
        maintenanceAgent: 'İzofluran',
      },
      merkezBranchId,
    );
    expect(anesthesia.status).toBe(201);
    expect((anesthesia.body.anesthesia as Record<string, unknown>).asaClass).toBe('II');

    const started = await post(veterinerToken, `/surgeries/${caseId}/start`, {}, merkezBranchId);
    expect(started.status).toBe(201);
    expect(started.body.status).toBe('in_surgery');
    expect(started.body.actualStart).toBeTruthy();

    const recovery = await post(veterinerToken, `/surgeries/${caseId}/recovery`, {}, merkezBranchId);
    expect(recovery.status).toBe(201);
    expect(recovery.body.status).toBe('recovery');

    const completed = await post(veterinerToken, `/surgeries/${caseId}/complete`, {}, merkezBranchId);
    expect(completed.status).toBe(201);
    expect(completed.body.status).toBe('completed');
    expect(completed.body.actualEnd).toBeTruthy();

    // iyileşmeden iptal yok
    const cancel = await post(
      veterinerToken,
      `/surgeries/${caseId}/cancel`,
      { reason: 'geç iptal denemesi' },
      merkezBranchId,
    );
    expect(cancel.status).toBe(409);

    // encounter bağlantısı veritabanında doğrulanır
    const dbCase = await prisma.surgeryCase.findUnique({ where: { id: caseId } });
    expect(dbCase?.encounterId).toBe(encounterId);
    expect(dbCase?.patientId).toBe(patientId);
    expect(dbCase?.veterinarianId).toBe(veterinerStaffId);
  });

  itDb('owner-patient uyuşmazlığı reddedilir', async () => {
    const wrongOwner = await post(
      veterinerToken,
      '/surgeries',
      {
        patientId,
        ownerId: veterinerStaffId, // staff id owner değil
        veterinarianId: veterinerStaffId,
        procedure: 'Kastrasyon',
        plannedStart: new Date(Date.now() + 3600 * 1000).toISOString(),
      },
      merkezBranchId,
    );
    expect(wrongOwner.status).toBe(400);
  });
});

// ============================================================================
// 4. Yatış kabul/transfer/taburculuk + kennel çakışması (kabul kriteri 4)
// ============================================================================

describe('Yatış ve kennel çakışması', () => {
  itDb('kabul → aynı kennel ikinci kabul 409 → farklı kennel OK → taburculuk → kennel boşalır', async () => {
    const stay = await post(
      veterinerToken,
      '/hospital/stays',
      {
        patientId,
        ownerId,
        kennelId: kennelK1,
        veterinarianId: veterinerStaffId,
        admissionReason: 'Sıvı tedavisi — dehidratasyon',
        expectedDischargeAt: new Date(Date.now() + 2 * 86400 * 1000).toISOString(),
      },
      merkezBranchId,
    );
    expect(stay.status).toBe(201);
    const stayId = stay.body.id as string;
    created.stayIds.push(stayId);
    expect(stay.body.status).toBe('admitted');
    expect((stay.body.kennel as Record<string, unknown>).id).toBe(kennelK1);

    // aynı kennel ikinci kabul çakışır
    const conflict = await post(
      veterinerToken,
      '/hospital/stays',
      {
        patientId,
        ownerId,
        kennelId: kennelK1,
        veterinarianId: veterinerStaffId,
        admissionReason: 'Çakışma denemesi',
      },
      merkezBranchId,
    );
    expect(conflict.status).toBe(409);
    expect((conflict.body as ApiErrorBody).code).toBe('KENNEL_CONFLICT');

    // panoda aktif yatış görünür
    const panel = await get(veterinerToken, '/hospital/panel', merkezBranchId);
    expect(panel.status).toBe(200);
    expect(panel.body.occupiedKennels).toBeGreaterThan(0);

    // gözlem yazımı (günlük vital takip)
    const observation = await post(
      veterinerToken,
      `/hospital/stays/${stayId}/observations`,
      { tempC: 39.2, heartRate: 110, respRate: 24, appetite: 'Az', notes: 'Sabah vital' },
      merkezBranchId,
    );
    expect(observation.status).toBe(201);
    // boş gözlem reddedilir
    const empty = await post(
      veterinerToken,
      `/hospital/stays/${stayId}/observations`,
      {},
      merkezBranchId,
    );
    expect(empty.status).toBe(400);

    // boş kennel K2'ye transfer çakışmasız
    const transfer = await post(
      veterinerToken,
      `/hospital/stays/${stayId}/transfer`,
      { kennelId: kennelK2 },
      merkezBranchId,
    );
    expect(transfer.status).toBe(201);
    expect(transfer.body.status).toBe('transferred');
    expect((transfer.body.kennel as Record<string, unknown>).id).toBe(kennelK2);

    // dolu kennel K2'ye ikinci yatış kabulü çakışır (K1 artık boş olsa da K2 dolu)
    const conflict2 = await post(
      veterinerToken,
      '/hospital/stays',
      {
        patientId,
        ownerId,
        kennelId: kennelK2,
        veterinarianId: veterinerStaffId,
        admissionReason: 'Transfer çakışma denemesi',
      },
      merkezBranchId,
    );
    expect(conflict2.status).toBe(409);

    // taburculuk özet zorunlu
    const badDischarge = await post(
      veterinerToken,
      `/hospital/stays/${stayId}/discharge`,
      {},
      merkezBranchId,
    );
    expect(badDischarge.status).toBe(400);

    const discharge = await post(
      veterinerToken,
      `/hospital/stays/${stayId}/discharge`,
      { summary: 'Genel durum iyi, sıvı tedavisi tamamlandı' },
      merkezBranchId,
    );
    expect(discharge.status).toBe(201);
    expect(discharge.body.status).toBe('discharged');
    expect(discharge.body.dischargedAt).toBeTruthy();

    // taburcu kennel yeniden kabul alır
    const readmit = await post(
      veterinerToken,
      '/hospital/stays',
      {
        patientId,
        ownerId,
        kennelId: kennelK1,
        veterinarianId: veterinerStaffId,
        admissionReason: 'Kontrol yatışı',
      },
      merkezBranchId,
    );
    expect(readmit.status).toBe(201);
    created.stayIds.push(readmit.body.id as string);
  });

  itDb('stoklu sarf Faz 08 ortak servisiyle deftere yazılır (refType=HospitalMedication)', async () => {
    // AMOX stoğu yoksa küçük mal kabul yaz
    const balances = await prisma.stockBalance.findMany({
      where: { productId: amoxProductId, warehouseId: merkezWarehouseId },
    });
    const total = balances.reduce((sum, b) => sum + b.qtyOnHand.toNumber(), 0);
    if (total < 5) {
      const lot = await request(app.getHttpServer())
        .post('/api/v1/stock/receipts')
        .set(authHeader(stokToken))
        .set('X-Branch-Id', merkezBranchId)
        .send({
          warehouseId: merkezWarehouseId,
          supplierId: (
            await prisma.supplier.findFirst({ where: { clinicId } })
          )?.id,
          idempotencyKey: idemKey(1),
          note: 'F11 e2e mal kabul',
          lines: [
            {
              productId: amoxProductId,
              qty: 20,
              unitCost: 25.5,
              lotCode: `F11LOT${Date.now().toString(36).toUpperCase().slice(-4)}`,
              expiresAt: new Date(Date.now() + 365 * 86400 * 1000).toISOString(),
            },
          ],
        });
      expect(lot.status).toBe(201);
    }

    const stay = await post(
      veterinerToken,
      '/hospital/stays',
      {
        patientId,
        ownerId,
        kennelId: kennelK2,
        veterinarianId: veterinerStaffId,
        admissionReason: 'Antibiyotik tedavi yatışı',
      },
      merkezBranchId,
    );
    expect(stay.status).toBe(201);
    const stayId = stay.body.id as string;
    created.stayIds.push(stayId);

    const before = await prisma.stockBalance.findMany({
      where: { productId: amoxProductId, warehouseId: merkezWarehouseId },
    });
    const beforeQty = before.reduce((sum, b) => sum + b.qtyOnHand.toNumber(), 0);

    const medication = await post(
      veterinerToken,
      `/hospital/stays/${stayId}/medications`,
      {
        productId: amoxProductId,
        warehouseId: merkezWarehouseId,
        qty: 2,
        dose: '1 ml/10 kg',
        route: 'sc',
        notes: 'Sabah dozu',
        idempotencyKey: idemKey(2),
      },
      merkezBranchId,
    );
    expect(medication.status).toBe(201);
    const movementId = medication.body.stockMovementId as string;
    expect(movementId).toBeTruthy();
    created.medicationIds.push(medication.body.id as string);

    const movement = await prisma.stockMovement.findUnique({
      where: { id: movementId },
      include: { lines: true },
    });
    expect(movement?.kind).toBe('consumption');
    expect(movement?.refType).toBe('HospitalMedication');

    const after = await prisma.stockBalance.findMany({
      where: { productId: amoxProductId, warehouseId: merkezWarehouseId },
    });
    const afterQty = after.reduce((sum, b) => sum + b.qtyOnHand.toNumber(), 0);
    expect(afterQty).toBeCloseTo(beforeQty - 2, 3);

    // idempotency: aynı anahtar tekrar sarf üretmez
    const replay = await post(
      veterinerToken,
      `/hospital/stays/${stayId}/medications`,
      {
        productId: amoxProductId,
        warehouseId: merkezWarehouseId,
        qty: 2,
        idempotencyKey: idemKey(2),
      },
      merkezBranchId,
    );
    expect([200, 201]).toContain(replay.status);
    const replayMovements = await prisma.stockMovement.count({
      where: {
        kind: 'consumption',
        refType: 'HospitalMedication',
        refId: medication.body.id as string,
      },
    });
    expect(replayMovements).toBe(1);

    // yetersiz stok 409 (DTO Max 100.000'i aşmamak için 99.999 istenir)
    const tooMuch = await post(
      veterinerToken,
      `/hospital/stays/${stayId}/medications`,
      {
        productId: amoxProductId,
        warehouseId: merkezWarehouseId,
        qty: 99_999,
        idempotencyKey: idemKey(3),
      },
      merkezBranchId,
    );
    expect(tooMuch.status).toBe(409);

    // stok yöneticisi hospital.manage olmadığından 403
    const stokMed = await post(
      stokToken,
      `/hospital/stays/${stayId}/medications`,
      {
        productId: amoxProductId,
        warehouseId: merkezWarehouseId,
        qty: 1,
      },
      merkezBranchId,
    );
    expect(stokMed.status).toBe(403);
  });
});

// ============================================================================
// 6. Yetki ve şube kapsamı (kabul kriteri 6)
// ============================================================================

describe('Yetki ve branch scope', () => {
  itDb('lab.manage izni olmayan rol lab uçlarına erişemez', async () => {
    const stokOrders = await get(stokToken, '/lab/orders', merkezBranchId);
    expect(stokOrders.status).toBe(403);
    const stokSurgery = await get(stokToken, '/surgeries', merkezBranchId);
    expect(stokSurgery.status).toBe(403);
    const stokPanel = await get(stokToken, '/hospital/panel', merkezBranchId);
    expect(stokPanel.status).toBe(403);
  });

  itDb('resepsiyon lab.manage sahibi okur ama cerrahi/yatışa erişemez', async () => {
    const resepsiyonOrders = await get(resepsiyonToken, '/lab/orders', merkezBranchId);
    expect(resepsiyonOrders.status).toBe(200);
    const resepsiyonSurgery = await get(resepsiyonToken, '/surgeries', merkezBranchId);
    expect(resepsiyonSurgery.status).toBe(403);
    const resepsiyonStay = await get(resepsiyonToken, '/hospital/panel', merkezBranchId);
    expect(resepsiyonStay.status).toBe(403);
  });

  itDb('şube kapsamı: MRKZ kaydı SUB2 şubesi üzerinden okunamaz', async () => {
    const createdOrder = await post(
      veterinerToken,
      '/lab/orders',
      { patientId, testId: cbcTestId, veterinarianId: veterinerStaffId },
      merkezBranchId,
    );
    expect(createdOrder.status).toBe(201);
    const orderId = createdOrder.body.id as string;
    created.labOrderIds.push(orderId);

    // veteriner yalnız MRKZ üyesi → SUB2 bağlamı 403
    const wrongBranch = await get(veterinerToken, `/lab/orders/${orderId}`, sube2BranchId);
    expect(wrongBranch.status).toBe(403);

    // admin tüm şubeler → MRKZ bağlamı OK
    const adminRead = await get(adminToken, `/lab/orders/${orderId}`, merkezBranchId);
    expect(adminRead.status).toBe(200);

    // MRKZ kenneline SUB2 yatış kabulü — kennel başka şubede 403
    const sube2Stay = await post(
      adminToken,
      '/hospital/stays',
      {
        patientId,
        ownerId,
        kennelId: kennelK1,
        veterinarianId: veterinerStaffId,
        admissionReason: 'Şube kapsamı denemesi',
      },
      sube2BranchId,
    );
    expect(sube2Stay.status).toBe(403);
  });
});
