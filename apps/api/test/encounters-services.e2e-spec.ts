import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/global-exception.filter';
import { ServicesService } from '../src/services/services.service';

process.env.DATABASE_URL ??=
  'postgresql://vetcore:vetcore-dev@localhost:5433/vetcore?schema=public';
process.env.AUTH_JWT_SECRET ??= 'vetcore-test-secret-0123456789abcdef';

/**
 * Faz 06 API E2E — muayene, SOAP, vital bulgular ve hizmet kataloğu kabul
 * kriterleri, gerçek veritabanı ve guard zinciriyle doğulanır:
 * 1. SOAP alanları kaydedilip yeniden açılır (PATCH → GET aynı alanlar).
 * 2. Aynı vital bulgunun geçmiş ölçümleri korunur (her kayıt yeni satır).
 * 3. Yetkisiz kişi encounter imzalayamaz (clinical.sign izni zorunlu → 403).
 * 4. Signed encounter doğrudan update/delete edilemez (409 ENCOUNTER_SIGNED).
 * 5. Addendum orijinal kaydı referanslar ve denetim üretir (ADDENDUM_CREATED).
 * 6. Hizmet fiyat geçerlilik tarihleri ve branch override doğru çözülür.
 *
 * Ön koşul: gömülü PostgreSQL + migrate + seed (scripts/with-pg.sh sarmalayıcısı).
 * Test kendi verisini oluşturur ve sonda temizler.
 */

const DEMO_PASSWORD = 'VetCore2026!';
const runId = `f06e2e-${Date.now().toString(36)}`;

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

describe('Faz 06 — muayene, SOAP, vital bulgular ve hizmet kataloğu (API kabul kriterleri)', () => {
  let app: INestApplication;
  let adminToken: string;
  let veterinerToken: string;
  let resepsiyonToken: string;
  let merkezBranchId: string;
  let sube2BranchId: string;
  let vetStaffId: string;
  let ownerId: string;
  let patientId: string;
  let cachedSpeciesId: string | null = null;

  const created = {
    encounterIds: [] as string[],
    serviceIds: [] as string[],
    servicePriceIds: [] as string[],
    ownerIds: [] as string[],
    patientIds: [] as string[],
  };

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

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    await app.listen(0);

    // Seed verisinden kimlikler (sentetik demo kümesi)
    const prisma = new (await import('@prisma/client')).PrismaClient();
    const clinic = await prisma.clinic.findUnique({ where: { slug: 'vetcore-demo' } });
    if (!clinic) throw new Error('Seed klinik bulunamadı — önce seed çalıştırılmalı');
    const branches = await prisma.branch.findMany({ where: { clinicId: clinic.id } });
    merkezBranchId = branches.find((b) => b.code === 'MRKZ')?.id ?? '';
    sube2BranchId = branches.find((b) => b.code === 'SUB2')?.id ?? '';
    const vet = await prisma.staff.findUnique({
      where: { email: 'veteriner@vetcore-demo.example' },
    });
    vetStaffId = vet?.id ?? '';
    await prisma.$disconnect();

    adminToken = await login(app, 'admin@vetcore-demo.example');
    veterinerToken = await login(app, 'veteriner@vetcore-demo.example');
    resepsiyonToken = await login(app, 'resepsiyon@vetcore-demo.example');
  });

  afterAll(async () => {
    if (dbReady) {
      const prisma = new (await import('@prisma/client')).PrismaClient();
      // Faz 08: finalize artık gerçek Charge yaratır — sahibi silinmeden ücretler
      // temizlenmelidir (owner_id Restrict; satırlar cascade).
      if (created.ownerIds.length > 0) {
        await prisma.charge.deleteMany({ where: { ownerId: { in: created.ownerIds } } });
      }
      // Encounter cascade: vitals/diagnoses/attachments/serviceRecords/addendums
      if (created.encounterIds.length > 0) {
        await prisma.encounter.deleteMany({ where: { id: { in: created.encounterIds } } });
      }
      if (created.servicePriceIds.length > 0) {
        await prisma.servicePrice.deleteMany({ where: { id: { in: created.servicePriceIds } } });
      }
      if (created.serviceIds.length > 0) {
        await prisma.service.deleteMany({ where: { id: { in: created.serviceIds } } });
      }
      if (created.patientIds.length > 0) {
        await prisma.patient.deleteMany({ where: { id: { in: created.patientIds } } });
      }
      if (created.ownerIds.length > 0) {
        await prisma.owner.deleteMany({ where: { id: { in: created.ownerIds } } });
      }
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  async function speciesId(): Promise<string> {
    if (cachedSpeciesId) return cachedSpeciesId;
    const res = await request(app.getHttpServer())
      .get('/api/v1/species')
      .set(authHeader(adminToken));
    const species = (res.body as { id: string; key: string }[]).find((s) => s.key === 'cat');
    cachedSpeciesId = species?.id ?? '';
    return cachedSpeciesId;
  }

  async function createTestOwnerPatient(): Promise<void> {
    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/owners')
      .set(authHeader(veterinerToken))
      .send({
        firstName: `Faz06Test${runId}`,
        lastName: 'MuayeneSahibi',
        contacts: [{ kind: 'phone', value: '+90 555 222 33 44', label: 'Cep', isPrimary: true }],
        consents: { kvkk: true },
      });
    expect(ownerRes.status).toBe(201);
    ownerId = (ownerRes.body as { id: string }).id;
    created.ownerIds.push(ownerId);

    const patientRes = await request(app.getHttpServer())
      .post(`/api/v1/owners/${ownerId}/patients`)
      .set(authHeader(veterinerToken))
      .send({ name: `MuayeneTest-${runId}`, speciesId: await speciesId() });
    expect(patientRes.status).toBe(201);
    patientId = (patientRes.body as { id: string }).id;
    created.patientIds.push(patientId);
  }

  async function createEncounter(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; status: string }> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/encounters')
      .set(authHeader(veterinerToken))
      .send({
        patientId,
        veterinarianId: vetStaffId,
        chiefComplaint: `Test muayenesi ${runId}`,
        ...overrides,
      });
    expect(res.status).toBe(201);
    const body = res.body as { id: string; status: string };
    created.encounterIds.push(body.id);
    return body;
  }

  async function createService(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; code: string }> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/services')
      .set(authHeader(adminToken))
      .send({
        code: `F06-${runId}-${created.serviceIds.length}`,
        name: `Test Hizmeti ${created.serviceIds.length}`,
        category: 'muayene',
        durationMin: 15,
        ...overrides,
      });
    expect(res.status).toBe(201);
    const body = res.body as { id: string; code: string };
    created.serviceIds.push(body.id);
    return body;
  }

  itDb('kurulum: test hastası oluşturulur', async () => {
    await createTestOwnerPatient();
    expect(patientId).toBeTruthy();
  });

  // ---- Kabul kriteri 1: SOAP alanları kaydedilip yeniden açılmalı ----
  itDb('1. SOAP alanları kaydedilir ve yeniden açılır', async () => {
    const encounter = await createEncounter();
    const soapPayload = {
      chiefComplaint: 'İştah kaybı ve halsizlik',
      subjective: 'Sahip: 3 gündür mama yemiyor, su içiyor.',
      objective: 'Ateş 39.8°C, mukozalar soluk, karında hassasiyet.',
      assessment: 'Gastroenterit şüphesi; dehidratasyon derecesi ~%5.',
      plan: 'Sıvı tedavisi, diyet mama, 2 gün sonra kontrol.',
      notes: 'Aşı kartı tam.',
      status: 'in_progress',
    };
    const patchRes = await request(app.getHttpServer())
      .patch(`/api/v1/encounters/${encounter.id}`)
      .set(authHeader(veterinerToken))
      .send(soapPayload);
    expect(patchRes.status).toBe(200);

    // Yeniden açma — GET ile aynı alanlar geri döner
    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/encounters/${encounter.id}`)
      .set(authHeader(veterinerToken));
    expect(getRes.status).toBe(200);
    const body = getRes.body as Record<string, unknown>;
    expect(body.chiefComplaint).toBe(soapPayload.chiefComplaint);
    expect(body.subjective).toBe(soapPayload.subjective);
    expect(body.objective).toBe(soapPayload.objective);
    expect(body.assessment).toBe(soapPayload.assessment);
    expect(body.plan).toBe(soapPayload.plan);
    expect(body.notes).toBe(soapPayload.notes);
    expect(body.status).toBe('in_progress');
    // Versiyon arttı
    expect(body.version).toBeGreaterThan(1);
  });

  // ---- Kabul kriteri 2: Aynı vital bulgunun geçmiş ölçümleri korunmalı ----
  itDb('2. Aynı vital bulgunun geçmiş ölçümleri korunur', async () => {
    const encounter = await createEncounter();
    const base = Date.now() - 60_000;
    for (const [i, temp] of [38.4, 39.1, 39.8].entries()) {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/encounters/${encounter.id}/vitals`)
        .set(authHeader(veterinerToken))
        .send({
          kind: 'temp',
          value: temp,
          unit: '°C',
          measuredAt: new Date(base + i * 30_000).toISOString(),
        });
      expect(res.status).toBe(201);
    }

    const history = await request(app.getHttpServer())
      .get(`/api/v1/encounters/patient/${patientId}/vitals`)
      .query({ kind: 'temp' })
      .set(authHeader(veterinerToken));
    expect(history.status).toBe(200);
    const items = (history.body as { items: { value: string; kind: string }[] }).items;
    // Seed'in Karabaş temp kaydı bu hastaya değil; bu hastada tam 3 kayıt olmalı
    const ownTemps = items.filter(() => items.every((v) => v.kind === 'temp'));
    expect(ownTemps.length).toBe(3);
    // En yeni ölçüm ilk sırada (desc)
    expect(Number(items[0]?.value)).toBe(39.8);

    // Ayrı kind ayrı geçmiş: weight kaydı temp listesini etkilemez
    const weightRes = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/vitals`)
      .set(authHeader(veterinerToken))
      .send({ kind: 'weight', value: 4.7, unit: 'kg', measuredAt: new Date().toISOString() });
    expect(weightRes.status).toBe(201);
    const tempAgain = await request(app.getHttpServer())
      .get(`/api/v1/encounters/patient/${patientId}/vitals`)
      .query({ kind: 'temp' })
      .set(authHeader(veterinerToken));
    expect((tempAgain.body as { items: unknown[] }).items.length).toBe(3);
  });

  // ---- Kabul kriteri 3: Yetkisiz kişi encounter imzalayamamalı ----
  itDb('3. Yetkisiz kişi encounter oluşturamaz ve imzalayamaz (403)', async () => {
    const encounter = await createEncounter();

    // Resepsiyon: encounter.manage izni yok → oluşturamaz
    const createAttempt = await request(app.getHttpServer())
      .post('/api/v1/encounters')
      .set(authHeader(resepsiyonToken))
      .send({ patientId, veterinarianId: vetStaffId, chiefComplaint: 'İzinsiz deneme' });
    expect(createAttempt.status).toBe(403);

    // Resepsiyon: clinical.sign izni yok → imzalayamaz
    const signAttempt = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/sign`)
      .set(authHeader(resepsiyonToken));
    expect(signAttempt.status).toBe(403);

    // Kayıt hâlâ draft
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/encounters/${encounter.id}`)
      .set(authHeader(veterinerToken));
    expect((detail.body as { status: string }).status).toBe('draft');

    // Veteriner (clinical.sign sahibi) imzalayabilir — pozitif kontrol
    const signOk = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/sign`)
      .set(authHeader(veterinerToken));
    expect(signOk.status).toBe(201);
    expect((signOk.body as { status: string; signedAt: string | null }).status).toBe('signed');
    expect((signOk.body as { signedAt: string | null }).signedAt).toBeTruthy();
  });

  // ---- Kabul kriteri 4: Signed encounter doğrudan update/delete edilememeli ----
  itDb('4. İmzalı kayıt update/delete edilemez (409 ENCOUNTER_SIGNED)', async () => {
    const encounter = await createEncounter();
    const signRes = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/sign`)
      .set(authHeader(veterinerToken));
    expect(signRes.status).toBe(201);
    const signedId = (signRes.body as { id: string }).id;

    // PATCH engellenir
    const patchRes = await request(app.getHttpServer())
      .patch(`/api/v1/encounters/${signedId}`)
      .set(authHeader(veterinerToken))
      .send({ subjective: 'İmza sonrası değişiklik denemesi' });
    expect(patchRes.status).toBe(409);
    expect((patchRes.body as { code?: string }).code ?? (patchRes.body as { message?: string }).message).toContain('ENCOUNTER_SIGNED');

    // DELETE engellenir
    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/v1/encounters/${signedId}`)
      .set(authHeader(veterinerToken));
    expect(deleteRes.status).toBe(409);

    // İmzadan sonra vital/tanı/hizmet eklenemez (kayıt kilitli)
    const vitalRes = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${signedId}/vitals`)
      .set(authHeader(veterinerToken))
      .send({ kind: 'temp', value: 38, unit: '°C', measuredAt: new Date().toISOString() });
    expect(vitalRes.status).toBe(409);

    const diagnosisRes = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${signedId}/diagnoses`)
      .set(authHeader(veterinerToken))
      .send({ name: 'İmza sonrası tanı denemesi' });
    expect(diagnosisRes.status).toBe(409);

    // Kayıt değişmemiş: içerik eski haliyle duruyor
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/encounters/${signedId}`)
      .set(authHeader(veterinerToken));
    expect((detail.body as { subjective: string | null }).subjective).toBeNull();
  });

  // ---- Kabul kriteri 5: Addendum orijinal kaydı referanslamalı ve audit üretmeli ----
  itDb('5. Addendum orijinal kaydı referanslar ve denetim üretir', async () => {
    const encounter = await createEncounter();

    // İmzasız kayda addendum yazılamaz
    const unsignedAttempt = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/addendums`)
      .set(authHeader(veterinerToken))
      .send({ body: 'İmzasız kayda addendum denemesi' });
    expect(unsignedAttempt.status).toBe(409);

    await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/sign`)
      .set(authHeader(veterinerToken));

    const addendumBody = 'Sahip telefonla arandı: kusma başlangıcı dün öğleden sonra — anamnez güncellendi.';
    const addRes = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/addendums`)
      .set(authHeader(veterinerToken))
      .send({ body: addendumBody });
    expect(addRes.status).toBe(201);
    const addendum = addRes.body as { id: string; encounterId: string; body: string };

    // Orijinal kayda referans
    expect(addendum.encounterId).toBe(encounter.id);

    // Detayda yazar ve gövde ile görünür
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/encounters/${encounter.id}`)
      .set(authHeader(veterinerToken));
    const addendums = (detail.body as { addendums: { id: string; body: string; author: { id: string } }[] })
      .addendums;
    expect(addendums.some((a) => a.id === addendum.id && a.body === addendumBody)).toBe(true);

    // Denetim defterine ADDENDUM_CREATED yazıldı (encounter referansı metadata'da)
    const prisma = new (await import('@prisma/client')).PrismaClient();
    try {
      const audit = await prisma.auditEvent.findFirst({
        where: {
          action: 'ADDENDUM_CREATED',
          entityType: 'ClinicalAddendum',
          entityId: addendum.id,
        },
      });
      expect(audit).toBeTruthy();
      const metadata = (audit?.metadata ?? {}) as { encounterId?: string };
      expect(metadata.encounterId).toBe(encounter.id);
    } finally {
      await prisma.$disconnect();
    }
  });

  // ---- Kabul kriteri 6: Hizmet fiyat geçerlilik tarihleri ve branch override ----
  itDb('6. Fiyat çözümleme: süresi dolmuş satır seçilmez, şube override kazanır', async () => {
    // Katalog: geçerli genel fiyat + süresi dolmuş satır + SUB2 override
    const svc = await createService({ code: `F06-P-${runId}`, name: 'Fiyat Test Hizmeti' });
    const svcId = svc.id;

    // 1) Geçerli genel fiyat (450) — seed HIZ-001 desenine uygun
    const globalPrice = await request(app.getHttpServer())
      .post(`/api/v1/services/${svcId}/prices`)
      .set(authHeader(adminToken))
      .send({ amount: 450, currency: 'TRY', validFrom: '2026-01-01T00:00:00.000Z' });
    expect(globalPrice.status).toBe(201);
    created.servicePriceIds.push((globalPrice.body as { id: string }).id);

    // Süresi dolmuş satır (2025) — çözümlemede asla seçilmemeli
    const expired = await request(app.getHttpServer())
      .post(`/api/v1/services/${svcId}/prices`)
      .set(authHeader(adminToken))
      .send({
        amount: 380,
        currency: 'TRY',
        validFrom: '2025-01-01T00:00:00.000Z',
        validTo: '2025-12-31T23:59:59.999Z',
      });
    expect(expired.status).toBe(201);
    created.servicePriceIds.push((expired.body as { id: string }).id);

    // SUB2 override (480) — MRKZ fiyatından farklı
    const override = await request(app.getHttpServer())
      .post(`/api/v1/services/${svcId}/prices`)
      .set(authHeader(adminToken))
      .send({
        branchId: sube2BranchId,
        amount: 480,
        currency: 'TRY',
        validFrom: '2026-01-01T00:00:00.000Z',
      });
    expect(override.status).toBe(201);
    created.servicePriceIds.push((override.body as { id: string }).id);

    // MRKZ'de hizmet kaydı → genel fiyat 450 (süresi dolmuş 380 değil)
    const encounterMrkz = await createEncounter();
    const recordMrkz = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounterMrkz.id}/service-records`)
      .set(authHeader(veterinerToken))
      .send({ lines: [{ serviceId: svcId, qty: 2 }] });
    expect(recordMrkz.status).toBe(201);
    const mrkzLine = (
      recordMrkz.body as { lines: { unitPrice: string; qty: string; lineTotal: string }[] }
    ).lines[0];
    if (!mrkzLine) throw new Error('MRKZ satırı yok');
    expect(Number(mrkzLine.unitPrice)).toBe(450);
    expect(Number(mrkzLine.lineTotal)).toBe(900);

    // Fiyat listesi: yalnız bir geçerli genel satır + SUB2 override satırı
    const priceList = await request(app.getHttpServer())
      .get(`/api/v1/services/${svcId}/prices`)
      .set(authHeader(adminToken));
    expect(priceList.status).toBe(200);
    const prices = priceList.body as {
      items: { branchId: string | null; amount: string; validTo: string | null }[];
    };
    const validRows = prices.items.filter(
      (p) => p.validTo === null && p.branchId === null,
    );
    expect(validRows.length).toBe(1);
    expect(validRows[0]?.amount).toBe('450');
    const sub2Row = prices.items.find((p) => p.branchId === sube2BranchId);
    expect(sub2Row?.amount).toBe('480');

    // Şube override çözümü servis seviyesinde (SUB2: 480, MRKZ: 450) —
    // encounter şubesi hasta şubesinden türediği için SUB2 yolu 6b'de
    // fiyat çözümleyicisiyle doğrulanır (seed HIZ-002 SUB2 override).
    const servicesSvc = app.get(ServicesService);
    const prisma = new (await import('@prisma/client')).PrismaClient();
    let clinicId = '';
    try {
      const clinic = await prisma.clinic.findUnique({ where: { slug: 'vetcore-demo' } });
      clinicId = clinic?.id ?? '';
    } finally {
      await prisma.$disconnect();
    }
    expect(clinicId).toBeTruthy();
    const resolvedSub2 = await servicesSvc.resolvePricesForRecord(
      clinicId,
      sube2BranchId,
      [svcId],
    );
    expect(resolvedSub2.get(svcId)?.amount).toBe(480);
    expect(resolvedSub2.get(svcId)?.source).toBe('branch_override');
    const resolvedMrkz = await servicesSvc.resolvePricesForRecord(
      clinicId,
      merkezBranchId,
      [svcId],
    );
    expect(resolvedMrkz.get(svcId)?.amount).toBe(450);
    expect(resolvedMrkz.get(svcId)?.source).toBe('global');
  });

  itDb('6b. Faz 06 seed hizmetlerinde şube override doğru çözülür (HIZ-002)', async () => {
    // Seed: HIZ-002 Kuduz Asısı base 520 / SUB2 override 480 / HIZ-001 expired 380
    const prisma = new (await import('@prisma/client')).PrismaClient();
    let clinicId2 = '';
    let hiz2Id = '';
    let hiz1Id = '';
    try {
      const clinic = await prisma.clinic.findUnique({ where: { slug: 'vetcore-demo' } });
      clinicId2 = clinic?.id ?? '';
      hiz2Id =
        (await prisma.service.findFirst({
          where: { clinicId: clinicId2, code: 'HIZ-002' },
        }))?.id ?? '';
      hiz1Id =
        (await prisma.service.findFirst({
          where: { clinicId: clinicId2, code: 'HIZ-001' },
        }))?.id ?? '';
    } finally {
      await prisma.$disconnect();
    }
    const servicesSvc = app.get(ServicesService);
    expect(clinicId2).toBeTruthy();
    // SUB2 override: 480 (global 520 değil)
    const sub2 = await servicesSvc.resolvePricesForRecord(clinicId2, sube2BranchId, [hiz2Id]);
    expect(sub2.get(hiz2Id)?.amount).toBe(480);
    expect(sub2.get(hiz2Id)?.source).toBe('branch_override');
    // MRKZ global: 520
    const mrkz = await servicesSvc.resolvePricesForRecord(clinicId2, merkezBranchId, [hiz2Id]);
    expect(mrkz.get(hiz2Id)?.amount).toBe(520);
    expect(mrkz.get(hiz2Id)?.source).toBe('global');
    // HIZ-001: süresi dolmuş 380 asla seçilmez → 450
    const hiz1 = await servicesSvc.resolvePricesForRecord(clinicId2, merkezBranchId, [hiz1Id]);
    expect(hiz1.get(hiz1Id)?.amount).toBe(450);
  });

  itDb('6c. Fiyatı olmayan hizmet kayda giremez (409 SERVICE_PRICE_MISSING)', async () => {
    const noPriceService = await createService({ code: `F06-NP-${runId}` });
    const encounter = await createEncounter();
    const res = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/service-records`)
      .set(authHeader(veterinerToken))
      .send({ lines: [{ serviceId: noPriceService.id, qty: 1 }] });
    expect(res.status).toBe(409);
    const body = res.body as { code?: string; message?: string };
    const code = body.code ?? body.message ?? '';
    expect(code).toContain('SERVICE_PRICE_MISSING');
  });

  itDb('6d. Hizmet kaydı kesinleştirilir; kesinleşmiş kayıt değiştirilemez', async () => {
    const svc = await createService({ code: `F06-F-${runId}` });
    await request(app.getHttpServer())
      .post(`/api/v1/services/${svc.id}/prices`)
      .set(authHeader(adminToken))
      .send({ amount: 250, currency: 'TRY', validFrom: '2026-01-01T00:00:00.000Z' });

    const encounter = await createEncounter();
    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/service-records`)
      .set(authHeader(veterinerToken))
      .send({ lines: [{ serviceId: svc.id, qty: 1, discount: 10 }] });
    expect(createRes.status).toBe(201);
    const record = createRes.body as { id: string; status: string; lines: { lineTotal: string }[] };
    expect(record.status).toBe('draft');
    expect(Number(record.lines[0]?.lineTotal)).toBe(240);

    const finalizeRes = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/service-records/${record.id}/finalize`)
      .set(authHeader(veterinerToken));
    expect(finalizeRes.status).toBe(201);
    expect((finalizeRes.body as { status: string }).status).toBe('finalized');

    // Kesinleşmiş kayıt güncellenemez
    const replaceRes = await request(app.getHttpServer())
      .patch(`/api/v1/encounters/${encounter.id}/service-records/${record.id}/lines`)
      .set(authHeader(veterinerToken))
      .send({ lines: [{ serviceId: svc.id, qty: 3 }] });
    expect(replaceRes.status).toBe(409);
  });

  itDb('7. Katalog: kod tekili ve fiyat penceresi doğrulanır', async () => {
    const svc = await createService({ code: `F06-D-${runId}` });
    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/services')
      .set(authHeader(adminToken))
      .send({ code: svc.code, name: 'Tekrar', category: 'muayene', durationMin: 10 });
    expect(duplicate.status).toBe(409);

    const invalidWindow = await request(app.getHttpServer())
      .post(`/api/v1/services/${svc.id}/prices`)
      .set(authHeader(adminToken))
      .send({
        amount: 100,
        currency: 'TRY',
        validFrom: '2026-02-01T00:00:00.000Z',
        validTo: '2026-01-01T00:00:00.000Z',
      });
    expect(invalidWindow.status).toBe(409);
  });

  itDb('8. Tüketim kuralı oluşturulur ve listelenir', async () => {
    const svc = await createService({ code: `F06-R-${runId}` });
    const ruleRes = await request(app.getHttpServer())
      .post(`/api/v1/services/${svc.id}/consumption-rules`)
      .set(authHeader(adminToken))
      .send({ defaultQty: 2.5, unit: 'ml', required: true });
    expect(ruleRes.status).toBe(201);
    const rule = ruleRes.body as { id: string; defaultQty: string; required: boolean };
    expect(rule.required).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/services/${svc.id}`)
      .set(authHeader(adminToken));
    const rules = (detail.body as { consumptionRules: { id: string }[] }).consumptionRules;
    expect(rules.some((r) => r.id === rule.id)).toBe(true);
  });
});
