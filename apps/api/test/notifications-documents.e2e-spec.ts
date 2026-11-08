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
// Sandbox sağlayıcı hata planı — yalnızca sunucu tarafı env (bundle'a girmez):
// sms=always (dead-letter bütçesi), email=once (retry→sent tekilleştirme).
process.env.VETCORE_SANDBOX_FAIL ??= 'sms:always,email:once';

/**
 * Faz 12 API E2E — bildirimler, PDF belgeler ve entegrasyon adaptörleri kabul
 * kriterleri:
 * 1. Notification job retry duplicate message üretmemeli (idempotencyKey
 *    REPLAY + deterministik providerMessageId + koşullu claim).
 * 2. İletişim tercihi/izin kuralı kontrol edilmeli (consent yok → 409
 *    CONSENT_REQUIRED; push uygulama içi olarak muaf).
 * 3. PDF Türkçe karakter ve klinik marka: BELGE numarası + gömülü font + boyut.
 * 4. Prescription PDF imza/authorized status doğru gösterilmeli (taslak →
 *    TASLAK — İMZALANMAMIŞ; imzalı → veteriner + unvan + zaman).
 * 5. Provider secret web/mobile bundle'a girmemeli (config yazımı 400
 *    SECRET_NOT_ALLOWED; list yanıtı secret taşımaz; hasLiveIntegration=false).
 * 6. Provider başarısızlığı klinik ana işlemi bozmayıp retryable status
 *    üretmeli (dead-letter bütçesi; ardından encounter oluşturma 201).
 *
 * Ön koşul: gömülü PostgreSQL + migrate + seed (scripts/f12-api-e2e.sh).
 */

const DEMO_PASSWORD = 'VetCore2026!';
const runId = `f12-${Date.now().toString(36)}`;
/** Idempotency anahtarları UUID formatında ve koşuma özgü üretilir. */
const runNonce = Math.random().toString(16).slice(2, 11).padEnd(9, '0');
const idemKey = (n: number) => `c1200000-0000-4000-8000-${runNonce}${String(n % 1000).padStart(3, '0')}`;

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
let ownerId = '';
let ownerNoSmsId = '';
let veterinerStaffId = '';
let pushNotificationId = '';

const created = {
  notificationIds: [] as string[],
  templateIds: [] as string[],
  documentIds: [] as string[],
  prescriptionIds: [] as string[],
  encounterIds: [] as string[],
  labOrderIds: [] as string[],
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

/** Kuyruk işleme öncesi planlanan zamanı geçmişe çeker (backoff test hızlandırma). */
async function makeDue(notificationId: string): Promise<void> {
  await prisma.notification.update({
    where: { id: notificationId },
    data: { scheduledFor: new Date(Date.now() - 1000) },
  });
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

  const patient = await prisma.patient.findFirst({
    where: { clinicId: clinic.id, code: 'HP-0001' },
    select: { id: true, ownerId: true },
  });
  patientId = patient?.id ?? '';
  ownerId = patient?.ownerId ?? '';

  // sms onayı VERİLMEMİŞ sahip (seed: sms false, email true)
  const ownerNoSms = await prisma.owner.findFirst({
    where: {
      clinicId: clinic.id,
      consents: { some: { kind: 'sms', granted: false } },
    },
    select: { id: true },
  });
  ownerNoSmsId = ownerNoSms?.id ?? '';

  const vet = await prisma.staff.findUnique({
    where: { email: 'veteriner@vetcore-demo.example' },
    select: { id: true },
  });
  veterinerStaffId = vet?.id ?? '';

  adminToken = await login(app, 'admin@vetcore-demo.example');
  veterinerToken = await login(app, 'veteriner@vetcore-demo.example');
  resepsiyonToken = await login(app, 'resepsiyon@vetcore-demo.example');
  stokToken = await login(app, 'stok@vetcore-demo.example');
}, 120_000);

afterAll(async () => {
  // Test kayıtları temizlenir (private storage dosyaları dahil).
  if (prisma) {
    const documents = await prisma.printDocument.findMany({
      where: { id: { in: created.documentIds } },
      select: { id: true, storageKey: true },
    });
    await prisma.printDocument.deleteMany({ where: { id: { in: created.documentIds } } });
    for (const doc of documents) {
      try {
        const { join, resolve } = await import('node:path');
        const { rm } = await import('node:fs/promises');
        await rm(resolve(join(process.cwd(), '.uploads', doc.storageKey)), { force: true });
      } catch {
        // temizlik hatası test sonucunu etkilemez
      }
    }
    await prisma.notificationAttempt.deleteMany({
      where: { notificationId: { in: created.notificationIds } },
    });
    await prisma.notification.deleteMany({ where: { id: { in: created.notificationIds } } });
    await prisma.notificationTemplate.deleteMany({ where: { id: { in: created.templateIds } } });
    await prisma.prescription.deleteMany({ where: { id: { in: created.prescriptionIds } } });
    await prisma.encounter.deleteMany({ where: { id: { in: created.encounterIds } } });
    await prisma.labOrder.deleteMany({ where: { id: { in: created.labOrderIds } } });
  }
  await app?.close();
});

describe('Faz 12 — bildirimler, belgeler ve entegrasyonlar', () => {
  itDb('1. şablonlar listelenir ve yeni şablon oluşturulabilir', async () => {
    const list = await get(adminToken, '/notifications/templates');
    expect(list.status).toBe(200);
    const items = list.body as unknown as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThanOrEqual(6); // seed şablonları
    const appt = items.find((t) => t.code === 'APPT_REMINDER_SMS');
    expect(appt).toBeTruthy();
    expect(appt?.requiredVars).toContain('ownerName');

    const createdTpl = await post(adminToken, '/notifications/templates', {
      code: `E2E_${runId.toUpperCase().replace(/-/g, '_')}`,
      name: 'E2E Test Şablonu',
      channel: 'sms',
      category: 'custom',
      body: 'Merhaba {{ownerName}} — {{message}}',
    });
    expect(createdTpl.status).toBe(201);
    created.templateIds.push(createdTpl.body.id as string);
  });

  itDb('2. KABUL: onay kuralı — sms onaysız sahibe bildirim 409 CONSENT_REQUIRED', async () => {
    expect(ownerNoSmsId).toBeTruthy();
    const denied = await post(adminToken, '/notifications/enqueue', {
      channel: 'sms',
      ownerId: ownerNoSmsId,
      body: 'E2E — onaysız SMS denemesi',
      idempotencyKey: idemKey(1),
    });
    expect(denied.status).toBe(409);
    expect(denied.body.code).toBe('NOTIFICATION_CONSENT_REQUIRED');

    // Onaylı sahip (HP-0001 sahibi: sms granted) → 201
    const allowed = await post(adminToken, '/notifications/enqueue', {
      channel: 'sms',
      ownerId,
      body: 'E2E — onaylı SMS',
      idempotencyKey: idemKey(2),
    });
    expect(allowed.status).toBe(201);
    created.notificationIds.push(allowed.body.id as string);

    // push (uygulama içi) onay gerektirmez ve telefon/e-posta istemez
    const push = await post(adminToken, '/notifications/enqueue', {
      channel: 'push',
      ownerId,
      category: 'custom',
      subject: 'E2E iç bildirim',
      body: 'E2E — uygulama içi not',
      idempotencyKey: idemKey(3),
    });
    expect(push.status).toBe(201);
    created.notificationIds.push(push.body.id as string);
    pushNotificationId = push.body.id as string;
    expect(String(push.body.recipientValue)).toContain('in-app:');

    // onay durumu ucu kanal kilidi nedenlerini raporlar
    const consent = await get(adminToken, `/notifications/consents/${ownerNoSmsId}`);
    expect(consent.status).toBe(200);
    const channels = consent.body.channels as Record<string, { granted: boolean }>;
    expect(channels.sms?.granted).toBe(false);
    expect(channels.email?.granted).toBe(true);
    expect(channels.push?.granted).toBe(true);
  });

  itDb('3. KABUL: retry duplicate üretmez — email:once ile retry→sent tek satır', async () => {
    // ownerNoSmsId: sms onayı yok AMA email onayı VAR (seed) — email kanalı bu
    // sahip üzerinden test edilir.
    expect(ownerNoSmsId).toBeTruthy();
    const enqueue = await post(adminToken, '/notifications/enqueue', {
      channel: 'email',
      ownerId: ownerNoSmsId,
      category: 'lab',
      subject: 'Lab sonucu hazır',
      body: 'E2E — e-posta gövdesi',
      idempotencyKey: idemKey(4),
    });
    expect(enqueue.status).toBe(201);
    const notificationId = enqueue.body.id as string;
    created.notificationIds.push(notificationId);

    // Aynı anahtarla ikinci kuyruğa alma → REPLAY (yeni satır yok)
    const replay = await post(adminToken, '/notifications/enqueue', {
      channel: 'email',
      ownerId: ownerNoSmsId,
      body: 'E2E — e-posta gövdesi',
      idempotencyKey: idemKey(4),
    });
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(notificationId);
    expect(replay.body.replayed).toBe(true);

    // İlk işleme: sağlayıcı ilk denemede hata verir → retryable → queued
    const firstRun = await post(adminToken, '/notifications/run-queue', { limit: 10 });
    expect(firstRun.status).toBe(201);
    expect(firstRun.body.retrying).toBeGreaterThanOrEqual(1);

    // Backoff'lu kayıt due yapılır, ikinci işleme başarıyla biter
    await makeDue(notificationId);
    const secondRun = await post(adminToken, '/notifications/run-queue', { limit: 10 });
    expect(secondRun.status).toBe(201);

    const detail = await get(adminToken, `/notifications/${notificationId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.status).toBe('sent');
    // Tekil satır: aynı idempotencyKey için yalnızca 1 kayıt var
    const rowsForKey = await prisma.notification.count({
      where: { clinicId, idempotencyKey: idemKey(4) },
    });
    expect(rowsForKey).toBe(1);
    // sent kaydı tam olarak 1 adet ve providerMessageId deterministik türetilmiş
    const sentCount = await prisma.notification.count({
      where: { clinicId, idempotencyKey: idemKey(4), status: 'sent' },
    });
    expect(sentCount).toBe(1);
    const attempts = detail.body.attemptsLog as Array<{
      attemptNo: number;
      outcome: string;
      providerMessageId: string | null;
    }>;
    const successAttempts = attempts.filter((a) => a.outcome === 'success');
    expect(successAttempts).toHaveLength(1);
    expect(successAttempts[0]?.providerMessageId).toBe(`sbx-sandbox-email-${notificationId}`);
    expect(attempts.length).toBe(2); // once: 1 retryable + 1 success

    // Eşzamanlı çift run-queue: koşullu claim sayesinde ikisi de işleyemez
    const [a, b] = await Promise.all([
      post(adminToken, '/notifications/run-queue', { limit: 10 }),
      post(adminToken, '/notifications/run-queue', { limit: 10 }),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const pushRow = await prisma.notification.findUnique({ where: { id: pushNotificationId } });
    expect(pushRow?.status).toBe('sent');
  });

  itDb('4. KABUL: sağlayıcı hatası retryable üretir, bütçe bitince dead_letter; klinik akış bozulmaz', async () => {
    const enqueue = await post(adminToken, '/notifications/enqueue', {
      channel: 'sms',
      ownerId,
      body: 'E2E — her zaman hatalı SMS',
      idempotencyKey: idemKey(5),
    });
    expect(enqueue.status).toBe(201);
    const notificationId = enqueue.body.id as string;
    created.notificationIds.push(notificationId);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await makeDue(notificationId);
      const run = await post(adminToken, '/notifications/run-queue', { limit: 10 });
      expect(run.status).toBe(201);
      if (attempt < 2) {
        const row = await prisma.notification.findUnique({ where: { id: notificationId } });
        expect(row?.status).toBe('queued'); // retryable — kuyruğa geri
        expect(row?.lastError).toContain('PROVIDER_TIMEOUT');
      }
    }
    const exhausted = await prisma.notification.findUnique({ where: { id: notificationId } });
    expect(exhausted?.status).toBe('dead_letter');
    expect(exhausted?.attempts).toBe(3);
    const attemptRows = await prisma.notificationAttempt.findMany({
      where: { notificationId },
      orderBy: { attemptNo: 'asc' },
    });
    expect(attemptRows).toHaveLength(3);
    expect(attemptRows.every((a) => a.outcome === 'retryable')).toBe(true);

    // dead_letter terminaldir: yeniden run-queue işlemez
    await makeDue(notificationId);
    await post(adminToken, '/notifications/run-queue', { limit: 10 });
    const still = await prisma.notification.findUnique({ where: { id: notificationId } });
    expect(still?.status).toBe('dead_letter');

    // Manuel retry denemeyi sıfırlar ve yeniden kuyruğa alır (aynı satır)
    const retried = await post(adminToken, `/notifications/${notificationId}/retry`, {});
    expect(retried.status).toBe(201);
    expect(retried.body.status).toBe('queued');
    expect(retried.body.attempts).toBe(0);

    // Yeniden kuyruklanan kayıt sağlayıcı hatasıyla bütçeyi yeniden tüketir
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await makeDue(notificationId);
      await post(adminToken, '/notifications/run-queue', { limit: 10 });
    }
    const reDead = await prisma.notification.findUnique({ where: { id: notificationId } });
    expect(reDead?.status).toBe('dead_letter');

    // Klinik ana işlem etkilenmez: sağlayıcı hatalarına rağmen encounter 201
    const encounter = await post(
      veterinerToken,
      '/encounters',
      { patientId, veterinarianId: veterinerStaffId, chiefComplaint: 'E2E — klinik akış kanıtı' },
      merkezBranchId,
    );
    expect(encounter.status).toBe(201);
    created.encounterIds.push(encounter.body.id as string);
  });

  itDb('5. KABUL: PDF Türkçe karakter + klinik marka — muayene özeti üretilir', async () => {
    const encounterId = created.encounterIds[0];
    expect(encounterId).toBeTruthy();
    const created_ = await post(adminToken, '/documents/print', {
      kind: 'exam_summary',
      refId: encounterId,
    }, merkezBranchId);
    expect(created_.status).toBe(201);
    expect(String(created_.body.documentNo)).toMatch(/^BELGE-\d{4}$/);
    expect(created_.body.title).toBe('Muayene Özeti');
    expect(Number(created_.body.fileSize)).toBeGreaterThan(5_000);
    created.documentIds.push(created_.body.id as string);

    // PDF bayt akışı: %PDF imzası + gömülü font boyutu
    const pdf = await request(app.getHttpServer())
      .get(`/api/v1/documents/${created_.body.id}/pdf`)
      .set(authHeader(adminToken))
      .set({ 'X-Branch-Id': merkezBranchId })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    const bytes = pdf.body as Buffer;
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(5_000);
    expect(String(pdf.headers['content-type'])).toContain('application/pdf');
  });

  itDb('6. KABUL: reçete PDF imza/authorized status — taslak ve imzalı ayrımı', async () => {
    // Taslak reçete
    const draft = await post(
      veterinerToken,
      '/prescriptions',
      {
        patientId,
        veterinarianId: veterinerStaffId,
        lines: [
          {
            drugName: 'Amoksisilin 250mg',
            form: 'tablet',
            route: 'oral',
            frequency: 'günde 2 kez',
            durationDays: 7,
            quantity: 14,
            quantityUnit: 'adet',
            instructions: 'Yemle birlikte verilir',
          },
        ],
      },
      merkezBranchId,
    );
    expect(draft.status).toBe(201);
    created.prescriptionIds.push(draft.body.id as string);

    const draftDoc = await post(adminToken, '/documents/print', {
      kind: 'prescription',
      refId: draft.body.id,
    }, merkezBranchId);
    expect(draftDoc.status).toBe(201);
    created.documentIds.push(draftDoc.body.id as string);
    expect(draftDoc.body.authorizedStatus).toBe('TASLAK — İMZALANMAMIŞ');
    const draftDetail = await get(adminToken, `/documents/${draftDoc.body.id}`);
    const draftSnapshot = draftDetail.body.snapshot as Record<string, unknown>;
    expect(draftSnapshot.status).toBe('draft');
    expect(draftSnapshot.authorizedStatus).toBe('TASLAK — İMZALANMAMIŞ');

    // İmzalı reçete (prescription.sign — veteriner)
    const signed = await post(veterinerToken, `/prescriptions/${draft.body.id}/sign`, {}, merkezBranchId);
    expect(signed.status).toBe(201);
    expect(String(signed.body.code)).toMatch(/^REC-\d{4}$/);

    const signedDoc = await post(adminToken, '/documents/print', {
      kind: 'prescription',
      refId: draft.body.id,
    }, merkezBranchId);
    expect(signedDoc.status).toBe(201);
    created.documentIds.push(signedDoc.body.id as string);
    expect(String(signedDoc.body.authorizedStatus)).toContain('İmzalı');
    expect(String(signedDoc.body.authorizedStatus)).toContain('Yetkili Veteriner Hekim');
    const signedDetail = await get(adminToken, `/documents/${signedDoc.body.id}`);
    const signedSnapshot = signedDetail.body.snapshot as Record<string, unknown>;
    expect(signedSnapshot.status).toBe('signed');
    expect(signedSnapshot.signedByName).toBe('Ayşe Demir');
  });

  itDb('7. aşı kartı ve onam belgeleri üretilir; lab raporu siparişe bağlı', async () => {
    const vaccineCard = await post(adminToken, '/documents/print', {
      kind: 'vaccine_card',
      refId: patientId,
    }, merkezBranchId);
    expect(vaccineCard.status).toBe(201);
    expect(vaccineCard.body.title).toBe('Aşı Kartı');
    created.documentIds.push(vaccineCard.body.id as string);

    const consentDoc = await post(adminToken, '/documents/print', {
      kind: 'consent',
      refId: ownerId,
    }, merkezBranchId);
    expect(consentDoc.status).toBe(201);
    created.documentIds.push(consentDoc.body.id as string);

    const labOrder = await post(
      veterinerToken,
      '/lab/orders',
      { patientId, testId: (await prisma.labCatalog.findFirst({ where: { clinicId, code: 'LAB-CBC' } }))?.id, veterinarianId: veterinerStaffId },
      merkezBranchId,
    );
    expect(labOrder.status).toBe(201);
    created.labOrderIds.push(labOrder.body.id as string);
    const labReport = await post(adminToken, '/documents/print', {
      kind: 'lab_report',
      refId: labOrder.body.id,
    }, merkezBranchId);
    expect(labReport.status).toBe(201);
    expect(labReport.body.title).toBe('Lab Raporu');
    created.documentIds.push(labReport.body.id as string);

    // Belge listesi tür filtresiyle çalışır
    const list = await get(adminToken, '/documents?kind=prescription', merkezBranchId);
    expect(list.status).toBe(200);
    const items = list.body.items as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  itDb('8. KABUL: provider secret bundle/config giremez; canlı entegrasyon yok raporlanır', async () => {
    const secretAttempt = await post(adminToken, '/integrations', {
      kind: 'einvoice',
      providerName: 'vetcore-sandbox',
      config: { orgCode: 'X', apiKey: 'should-be-rejected' },
    });
    expect(secretAttempt.status).toBe(400);
    expect(secretAttempt.body.code).toBe('INTEGRATION_SECRET_NOT_ALLOWED');

    const list = await get(adminToken, '/integrations');
    expect(list.status).toBe(200);
    expect(list.body.hasLiveIntegration).toBe(false);
    expect(String(list.body.liveNotice)).toContain('Canlı yetkili entegrasyon yok');
    const items = list.body.items as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThanOrEqual(2);
    for (const item of items) {
      expect(item.mode).toBe('sandbox');
      const config = JSON.stringify(item.config ?? {});
      expect(config.toLowerCase()).not.toContain('apikey');
      expect(config.toLowerCase()).not.toContain('secret');
    }

    // Sandbox kontrolü adapter sözleşmesini koşar ve damgalanır
    const einv = items.find((i) => i.kind === 'einvoice')!;
    const check = await post(adminToken, `/integrations/${einv.id}/sandbox-check`, {});
    expect(check.status).toBe(201);
    expect(String(check.body.lastCheckResult)).toContain('OK');
    expect(String(check.body.lastCheckResult)).toContain('canlı bağlantı yok');
  });

  itDb('9. Yetki: stok rolü bildirim/belge/entegrasyon uçlarına erişemez', async () => {
    const notif = await get(stokToken, '/notifications', merkezBranchId);
    expect(notif.status).toBe(403);
    const doc = await post(stokToken, '/documents/print', { kind: 'consent', refId: ownerId }, merkezBranchId);
    expect(doc.status).toBe(403);
    const integration = await get(stokToken, '/integrations');
    expect(integration.status).toBe(403);
    const runQueue = await post(stokToken, '/notifications/run-queue', { limit: 5 });
    expect(runQueue.status).toBe(403);
  });

  itDb('10. Şube kapsamı: bildirim ve belge diğer şube bağlamında görünmez', async () => {
    // MRKZ bağlamında oluşturulan bildirim — veteriner (yalnız MRKZ) görür,
    // SUB2 X-Branch-Id ile liste boş kalır (branchId filtresi).
    const asVet = await get(veterinerToken, '/notifications', merkezBranchId);
    expect(asVet.status).toBe(200);
    const items = (asVet.body.items as Array<Record<string, unknown>>).filter(
      (n) => n.idempotencyKey === idemKey(2) || n.idempotencyKey === idemKey(4),
    );
    expect(items.length).toBe(2);

    // Belge: MRKZ'de üretilen belge SUB2 bağlamında okunamaz
    const docId = created.documentIds[0];
    const wrongBranch = await get(veterinerToken, `/documents/${docId}`, sube2BranchId);
    expect(wrongBranch.status).toBe(403);
    const rightBranch = await get(adminToken, `/documents/${docId}`, merkezBranchId);
    expect(rightBranch.status).toBe(200);
  });

  itDb('11. Teslim raporu — durum/kanal kırılımı tutarlı', async () => {
    const report = await get(adminToken, '/notifications/delivery-report');
    expect(report.status).toBe(200);
    const statusCounts = report.body.statusCounts as Record<string, number>;
    expect(statusCounts.sent).toBeGreaterThanOrEqual(2);
    expect(statusCounts.dead_letter).toBeGreaterThanOrEqual(1);
    const total = report.body.total as number;
    const sum = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    expect(total).toBe(sum);
    const channelBreakdown = report.body.channelBreakdown as Record<string, Record<string, number>>;
    expect(channelBreakdown.email?.sent ?? 0).toBeGreaterThanOrEqual(1);
    expect(channelBreakdown.sms?.dead_letter ?? 0).toBeGreaterThanOrEqual(1);
  });

  itDb('12. Şablon değişkeni eksik kuyruğa alma 400 döner', async () => {
    const tpl = await post(adminToken, '/notifications/templates', {
      code: `E2E_VAR_${runId.toUpperCase().replace(/-/g, '_')}`,
      name: 'E2E Değişken Şablonu',
      channel: 'sms',
      category: 'custom',
      body: 'Sayın {{ownerName}}, {{missingVar}} unutuldu',
    });
    expect(tpl.status).toBe(201);
    created.templateIds.push(tpl.body.id as string);

    const enqueue = await post(adminToken, '/notifications/enqueue', {
      channel: 'sms',
      ownerId,
      templateId: tpl.body.id,
      vars: { ownerName: 'Zeynep Aksoy' },
      idempotencyKey: idemKey(6),
    });
    expect(enqueue.status).toBe(400);
    expect(enqueue.body.code).toBe('NOTIFICATION_TEMPLATE_VAR_MISSING');
  });
});
