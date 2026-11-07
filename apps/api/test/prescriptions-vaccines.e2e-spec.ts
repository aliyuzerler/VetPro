import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/global-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.DATABASE_URL ??=
  'postgresql://vetcore:vetcore-dev@localhost:5433/vetcore?schema=public';
process.env.AUTH_JWT_SECRET ??= 'vetcore-test-secret-0123456789abcdef';

/**
 * Faz 10 API E2E — reçete, ilaç uygulaması, aşı ve takip kabul kriterleri:
 * 1. Reçete yalnızca yetkili veteriner tarafından imzalanmalı (prescription.sign).
 * 2. Doz yardımcısı formül/birimleri görünür döndürmeli; açık veteriner
 *    onayı olmadan imza kesinleşmemeli (409 DOSE_NOT_APPROVED).
 * 3. Prescribed/dispensed/administered kayıtları ayrışmalı (üç ayrı tablo/uç).
 * 4. Aşı kaydı lot ve son kullanma tarihini saklamalı (snapshot + stok düşümü).
 * 5. Aşı takvimi klinik protokolüyle yapılandırılmalı (sabit takvim yok).
 * 6. Hatırlatma aynı event için duplicate gönderilmemeli (kayıt + gönderim).
 *
 * Ek güvenceler: şube kapsamı (BRANCH_SCOPE), imzalı reçete değişmezliği,
 * dağıtım stok mutabakatı, idempotency tekilleştirme, yetersiz stok 409.
 *
 * Ön koşul: gömülü PostgreSQL + migrate + seed (scripts/f10-api-e2e.sh).
 * Temizlik test sonunda session_replication_role=replica geçici baypasıyla.
 */

const DEMO_PASSWORD = 'VetCore2026!';
const runId = `f10e2e-${Date.now().toString(36)}`;
/**
 * Idempotency anahtarları koşuma özgü üretilir: sabit anahtarlar, bir önceki
 * koşumun temizlik öncesi kalıntı defter hareketleriyle P2002 çakışması
 * üretirdi (500). UUID formatı korunur (son segment 12 hex).
 */
const runNonce = randomUUID().replaceAll('-', '').slice(0, 8);
const idem = (n: number) => `b1000000-0000-4000-8000-${runNonce}${String(n % 10000).padStart(4, '0')}`;

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
let veterinerStaffId = '';

let merkezWarehouseId = '';
let merkezBranchId = '';
let patientId = ''; // HP-0002 Karabaş (köpek)
let dogSpeciesId: string | null = null;

// Testin kendi ürettiği kayıtlar (temizlik için)
const created = {
  unitId: '',
  categoryId: '',
  productIds: [] as string[],
  lotIds: [] as string[],
  supplierId: '',
  prescriptionIds: [] as string[],
  vaccineProtocolIds: [] as string[],
  vaccineEventIds: [] as string[],
  vaccineReminderIds: [] as string[],
  dispenseIds: [] as string[],
  administrationIds: [] as string[],
  movementIds: [] as string[],
};

async function receipt(
  token: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/stock/receipts')
    .set(authHeader(token))
    .send({ idempotencyKey: idem(Math.floor(Math.random() * 1e9) % 1000000 + 1000), ...body });
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

  // Savunmacı ön-temizlik: önceki koşumların yarım kalan F10 test verisi
  // (UR-F10- önekli ürünler) sonraki koşumları bozmasın (idempotent fixture).
  const stale = await prisma.product.findMany({
    where: { clinicId: clinic.id, code: { startsWith: 'UR-F10-' } },
    select: { id: true },
  });
  if (stale.length > 0) {
    const staleIds = stale.map((p) => p.id);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.auditEvent.deleteMany({ where: { entityType: { in: ['DispenseEvent', 'AdministrationEvent', 'VaccineProtocol', 'VaccineEvent', 'VaccineReminder', 'PrescriptionLine'] } } });
      await tx.vaccineReminder.deleteMany({ where: { product: { id: { in: staleIds } } } });
      await tx.vaccineEvent.deleteMany({ where: { productId: { in: staleIds } } });
      await tx.vaccineProtocol.deleteMany({ where: { productId: { in: staleIds } } });
      await tx.administrationEvent.deleteMany({ where: { productId: { in: staleIds } } });
      await tx.dispenseEvent.deleteMany({ where: { productId: { in: staleIds } } });
      await tx.prescriptionLine.deleteMany({ where: { productId: { in: staleIds } } });
      await tx.prescription.deleteMany({ where: { patient: { clinicId: clinic.id }, notes: { contains: 'F10' } } });
      await tx.stockMovementLine.deleteMany({ where: { productId: { in: staleIds } } });
      await tx.stockMovement.deleteMany({ where: { lines: { some: { productId: { in: staleIds } } } } });
      await tx.stockBalance.deleteMany({ where: { productId: { in: staleIds } } });
      await tx.inventoryLot.deleteMany({ where: { productId: { in: staleIds } } });
      await tx.product.deleteMany({ where: { id: { in: staleIds } } });
    });
  }

  const branches = await prisma.branch.findMany({ where: { clinicId: clinic.id } });
  merkezBranchId = branches.find((b) => b.code === 'MRKZ')?.id ?? '';
  const warehouses = await prisma.warehouse.findMany({ where: { branchId: merkezBranchId } });
  merkezWarehouseId = warehouses.find((w) => w.name === 'Merkez Ana Depo')?.id ?? '';
  const patient = await prisma.patient.findFirst({
    where: { clinicId: clinic.id, code: 'HP-0002' },
    select: { id: true, speciesId: true },
  });
  patientId = patient?.id ?? '';
  dogSpeciesId = patient?.speciesId ?? null;

  adminToken = await login(app, 'admin@vetcore-demo.example');
  veterinerToken = await login(app, 'veteriner@vetcore-demo.example');
  resepsiyonToken = await login(app, 'resepsiyon@vetcore-demo.example');
  stokToken = await login(app, 'stok@vetcore-demo.example');
  const veterinerStaff = await prisma.staff.findUnique({
    where: { email: 'veteriner@vetcore-demo.example' },
    select: { id: true },
  });
  veterinerStaffId = veterinerStaff?.id ?? '';
});

afterAll(async () => {
  if (!dbReady) return;
  // Defter append-only: temizlik session_replication_role=replica baypasıyla.
  const productIds = created.productIds;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
    await tx.auditEvent.deleteMany({
      where: {
        OR: [
          { entityId: { in: created.prescriptionIds } },
          { entityType: 'PrescriptionLine' },
          { entityType: 'DispenseEvent', entityId: { in: created.dispenseIds } },
          { entityType: 'AdministrationEvent', entityId: { in: created.administrationIds } },
          { entityType: 'VaccineProtocol', entityId: { in: created.vaccineProtocolIds } },
          { entityType: 'VaccineEvent', entityId: { in: created.vaccineEventIds } },
          { entityType: 'VaccineReminder', entityId: { in: created.vaccineReminderIds } },
        ],
      },
    });
    await tx.vaccineReminder.deleteMany({ where: { vaccineEventId: { in: created.vaccineEventIds } } });
    await tx.vaccineEvent.deleteMany({ where: { id: { in: created.vaccineEventIds } } });
    await tx.vaccineProtocol.deleteMany({ where: { id: { in: created.vaccineProtocolIds } } });
    await tx.administrationEvent.deleteMany({
      where: { id: { in: created.administrationIds } },
    });
    await tx.dispenseEvent.deleteMany({ where: { id: { in: created.dispenseIds } } });
    await tx.prescriptionLine.deleteMany({
      where: { prescriptionId: { in: created.prescriptionIds } },
    });
    await tx.prescription.deleteMany({ where: { id: { in: created.prescriptionIds } } });
    await tx.stockMovementLine.deleteMany({ where: { productId: { in: productIds } } });
    await tx.stockMovement.deleteMany({ where: { lines: { some: { productId: { in: productIds } } } } });
    await tx.stockBalance.deleteMany({ where: { productId: { in: productIds } } });
    await tx.inventoryLot.deleteMany({ where: { productId: { in: productIds } } });
    await tx.product.deleteMany({ where: { id: { in: productIds } } });
    await tx.supplier.deleteMany({ where: { id: created.supplierId } });
    await tx.productCategory.deleteMany({ where: { id: created.categoryId } });
    await tx.unit.deleteMany({ where: { id: created.unitId } });
  });
  await app.close();
});

describe('Faz 10 — reçete, ilaç uygulaması, aşı ve takip', () => {
  itDb(
    'kurulum: test ürünleri ve partileri mal kabul edilir',
    async () => {
      expect(merkezWarehouseId).toBeTruthy();
      expect(patientId).toBeTruthy();

      // Teste özel birim/kategori/tedarikçi (seed verisine dokunmadan)
      const unit = await request(app.getHttpServer())
        .post('/api/v1/units')
        .set(authHeader(adminToken))
        .send({ key: `ml-${runId}`, name: 'Mililitre (test)' });
      expect(unit.status).toBe(201);
      created.unitId = (unit.body as { id: string }).id;

      const category = await request(app.getHttpServer())
        .post('/api/v1/product-categories')
        .set(authHeader(adminToken))
        .send({ name: `F10 Test Kategori ${runId}` });
      expect(category.status).toBe(201);
      created.categoryId = (category.body as { id: string }).id;

      const supplier = await request(app.getHttpServer())
        .post('/api/v1/suppliers')
        .set(authHeader(adminToken))
        .send({ name: `F10 Tedarikçi ${runId}` });
      expect(supplier.status).toBe(201);
      created.supplierId = (supplier.body as { id: string }).id;

      // Antibiyotik (parti takipli) + aşı ürünü
      for (const [code, name] of [
        [`UR-F10-AB-${runId}`, 'F10 Antibiyotik'],
        [`UR-F10-ASI-${runId}`, 'F10 Karma Aşı'],
      ] as const) {
        const product = await request(app.getHttpServer())
          .post('/api/v1/products')
          .set(authHeader(adminToken))
          .send({
            code,
            name,
            trackingType: 'lot',
            baseUnitId: created.unitId,
            categoryId: created.categoryId,
            minStock: 0,
          });
        expect(product.status).toBe(201);
        created.productIds.push((product.body as { id: string }).id);
      }

      // Mal kabul: antibiyotik 100 ml (C-lot geçerli) + A-lot süresi geçmiş + K-lot karantina;
      // aşı 10 doz (V-lot geçerli, SKT ~200 gün)
      const receipts: Array<[string, string, number]> = [
        [created.productIds[0]!, 'C2601', 100],
        [created.productIds[0]!, 'A2410', 50],
        [created.productIds[0]!, 'K2605', 30],
        [created.productIds[1]!, 'V2608', 10],
      ];
      for (const [productId, lotCode, qty] of receipts) {
        const res = await receipt(veterinerToken, {
          warehouseId: merkezWarehouseId,
          supplierId: created.supplierId,
          lines: [
            {
              productId,
              lotCode,
              qty,
              expiresAt:
                lotCode === 'A2410'
                  ? new Date(Date.now() - 5 * 86_400_000).toISOString()
                  : new Date(Date.now() + 200 * 86_400_000).toISOString(),
              unitCost: 25,
            },
          ],
        });
        expect(res.status).toBe(201);
        for (const line of res.body.lines as Array<{ lot: { id: string } }>) {
          created.lotIds.push(line.lot.id);
        }
      }
      // K-lot karantinaya alınır (veteriner MRKZ kapsamındadır — stok SUB2'dedir)
      const karantinaLotId = created.lotIds[2]!;
      const quarantine = await request(app.getHttpServer())
        .patch(`/api/v1/stock/lots/${karantinaLotId}/status`)
        .set(authHeader(veterinerToken))
        .send({ status: 'quarantined' });
      expect(quarantine.status).toBe(200);
    },
  );

  // ── Kabul kriteri 1: imza yalnızca yetkili veterinerde ─────────────────────

  itDb(
    '1. resepsiyon reçete taslağı oluşturabilir ama imzalayamaz (403)',
    async () => {
      const create = await request(app.getHttpServer())
        .post('/api/v1/prescriptions')
        .set(authHeader(resepsiyonToken))
        .send({
          patientId,
          veterinarianId: veterinerStaffId,
          notes: 'Kabul kriteri 1 — yetkisiz imza denemesi',
          lines: [
            {
              drugName: 'Amoksisilin 250mg',
              form: 'tablet',
              route: 'oral',
              frequency: 'günde 2 kez',
              durationDays: 7,
              quantity: 14,
              quantityUnit: 'tablet',
              productId: created.productIds[0],
            },
          ],
        });
      expect(create.status).toBe(201);
      const prescription = create.body as { id: string; status: string; lines: unknown[] };
      created.prescriptionIds.push(prescription.id);
      expect(prescription.status).toBe('draft');
      expect(prescription.lines).toHaveLength(1);

      const sign = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/${prescription.id}/sign`)
        .set(authHeader(resepsiyonToken))
        .send({});
      expect(sign.status).toBe(403);
      expect(String((sign.body as ApiErrorBody).message)).toContain('izin');
    },
  );

  itDb(
    '2. doz yardımcısı formül ve birimleri görünür döndürür; onaysız öneri imzalamayı bloklar',
    async () => {
      // (kabul kriteri 2a) helper yanıtı: formül + birimler görünür
      const helper = await request(app.getHttpServer())
        .post('/api/v1/prescriptions/dose-helper')
        .set(authHeader(veterinerToken))
        .send({ weightKg: 20, mgPerKg: 10, frequencyPerDay: 2, durationDays: 5 });
      expect(helper.status).toBe(201);
      expect(helper.body.formula).toBe('20 kg × 10 mg/kg');
      expect(helper.body.singleDose).toBe(200);
      expect(helper.body.doseUnit).toBe('mg');
      expect(helper.body.dailyDose).toBe(400);
      expect(helper.body.courseTotal).toBe(2000);

      // Doz önerisi taşıyan satır eklenir (onaysız)
      const line = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/${created.prescriptionIds[0]}/lines`)
        .set(authHeader(veterinerToken))
        .send({
          productId: created.productIds[0],
          drugName: 'Amoksisilin enjeksiyon',
          form: 'enjeksiyon',
          route: 'kas_ici',
          frequency: 'günde 1 kez',
          durationDays: 3,
          quantity: 1,
          quantityUnit: 'flakon',
          doseCalcWeightKg: 20,
          doseCalcMgPerKg: 10,
        });
      expect(line.status).toBe(201);
      expect(line.body.doseCalcFormula).toBe('20 kg × 10 mg/kg');
      expect(Number(line.body.doseCalcSuggested)).toBe(200);
      expect(line.body.doseApproved).toBe(false);

      // (kabul kriteri 2b) onaysız öneriyle imza bloklanır
      const signBlocked = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/${created.prescriptionIds[0]}/sign`)
        .set(authHeader(veterinerToken))
        .send({});
      expect(signBlocked.status).toBe(409);
      expect((signBlocked.body as ApiErrorBody).code).toBe('DOSE_NOT_APPROVED');
      expect(signBlocked.body.unapprovedLineIds).toHaveLength(1);

      // Doz onayı izni prescription.sign'a bağlı: resepsiyon onay veremez
      const unapprovedLineId = signBlocked.body.unapprovedLineIds[0] as string;
      const denied = await request(app.getHttpServer())
        .post(
          `/api/v1/prescriptions/${created.prescriptionIds[0]}/lines/${unapprovedLineId}/approve-dose`,
        )
        .set(authHeader(resepsiyonToken))
        .send({});
      expect(denied.status).toBe(403);

      // Veteriner açıkça onaylar → imza kesinleşir
      const approve = await request(app.getHttpServer())
        .post(
          `/api/v1/prescriptions/${created.prescriptionIds[0]}/lines/${unapprovedLineId}/approve-dose`,
        )
        .set(authHeader(veterinerToken))
        .send({ note: 'Klinik değerlendirme onayı' });
      expect(approve.status).toBe(201);
      expect(approve.body.doseApproved).toBe(true);

      const sign = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/${created.prescriptionIds[0]}/sign`)
        .set(authHeader(veterinerToken))
        .send({});
      expect(sign.status).toBe(201);
      const signed = sign.body as { status: string; code: string; signedAt: string };
      expect(signed.status).toBe('signed');
      expect(signed.code).toMatch(/^REC-\d{4}$/);
    },
  );

  itDb(
    '3. imzalı reçete değişmez: satır ekleme ve iptal reddedilir',
    async () => {
      const addLine = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/${created.prescriptionIds[0]}/lines`)
        .set(authHeader(veterinerToken))
        .send({
          drugName: 'Ek ilaç',
          form: 'tablet',
          route: 'oral',
          frequency: 'günde 1 kez',
          quantity: 1,
          quantityUnit: 'tablet',
        });
      expect(addLine.status).toBe(409);
      expect((addLine.body as ApiErrorBody).code).toBe('PRESCRIPTION_SIGNED');

      const voided = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/${created.prescriptionIds[0]}/void`)
        .set(authHeader(veterinerToken))
        .send({ reason: 'Test iptali' });
      expect(voided.status).toBe(409);
      expect((voided.body as ApiErrorBody).code).toBe('PRESCRIPTION_SIGNED');
    },
  );

  itDb(
    '4. taslak reçeteden dağıtım yapılamaz; dağıtım stok düşürür ve kayıt ayrışır',
    async () => {
      // Yeni imzalı reçete (dağıtım testi için) — resepsiyon oluşturur, veteriner imzalar
      const create = await request(app.getHttpServer())
        .post('/api/v1/prescriptions')
        .set(authHeader(veterinerToken))
        .send({
          patientId,
          lines: [
            {
              productId: created.productIds[0],
              drugName: 'F10 Antibiyotik şurup',
              form: 'sirup',
              route: 'oral',
              frequency: 'günde 2 kez',
              durationDays: 5,
              quantity: 30,
              quantityUnit: 'ml',
            },
          ],
        });
      expect(create.status).toBe(201);
      const prescription = create.body as { id: string; lines: Array<{ id: string }> };
      created.prescriptionIds.push(prescription.id);
      const lineId = prescription.lines[0]!.id;

      // Taslakta dağıtım → 409
      const draftDispense = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/${prescription.id}/dispense`)
        .set(authHeader(veterinerToken))
        .send({ lineId, warehouseId: merkezWarehouseId, qty: 10 });
      expect(draftDispense.status).toBe(409);
      expect((draftDispense.body as ApiErrorBody).code).toBe('PRESCRIPTION_SIGNED');

      const sign = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/${prescription.id}/sign`)
        .set(authHeader(veterinerToken))
        .send({});
      expect(sign.status).toBe(201);

      // Dağıtım öncesi bakiye
      const productId = created.productIds[0]!;
      const balanceBefore = await prisma.stockBalance.findFirst({
        where: { productId, warehouseId: merkezWarehouseId, lot: { lotCode: 'C2601' } },
      });
      expect(balanceBefore).toBeTruthy();

      // Stok sorumlusu dağıtır (prescription.dispense izni) — stok yalnız SUB2
      // kapsamındadır; MRKZ reçetesi için veteriner dağıtır.
      const dispense = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/${prescription.id}/dispense`)
        .set(authHeader(veterinerToken))
        .send({
          lineId,
          warehouseId: merkezWarehouseId,
          qty: 30,
          idempotencyKey: idem(2001),
        });
      expect(dispense.status).toBe(201);
      const event = dispense.body as { id: string; lotCode: string; movementId: string };
      created.dispenseIds.push(event.id);
      created.movementIds.push(event.movementId);
      expect(event.lotCode).toBe('C2601'); // FEFO: en yakın SKT'li geçerli parti

      // Stok bakiyesi düşmeli (100 → 70)
      const balanceAfter = await prisma.stockBalance.findUnique({
        where: { id: balanceBefore!.id },
      });
      expect(Number(balanceAfter!.qtyOnHand)).toBe(Number(balanceBefore!.qtyOnHand) - 30);

      // Defter mutabakatı: tüketim satırı −30, refType DispenseEvent
      const movement = await prisma.stockMovement.findUnique({
        where: { id: event.movementId },
        include: { lines: true },
      });
      expect(movement?.kind).toBe('consumption');
      expect(movement?.refType).toBe('DispenseEvent');
      expect(movement?.refId).toBe(event.id);
      expect(Number(movement!.lines[0]!.qty)).toBe(-30);

      // İdempotency: aynı anahtarla tekrar → aynı event, stok değişmez
      const repeat = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/${prescription.id}/dispense`)
        .set(authHeader(veterinerToken))
        .send({
          lineId,
          warehouseId: merkezWarehouseId,
          qty: 30,
          idempotencyKey: idem(2001),
        });
      expect(repeat.status).toBe(201);
      expect((repeat.body as { id: string }).id).toBe(event.id);
      const balanceAfterRepeat = await prisma.stockBalance.findUnique({
        where: { id: balanceBefore!.id },
      });
      expect(Number(balanceAfterRepeat!.qtyOnHand)).toBe(Number(balanceAfter!.qtyOnHand));

      // Yetersiz stok → 409 INSUFFICIENT_STOCK (100'lük tek partide 70 kaldı)
      const tooMuch = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/${prescription.id}/dispense`)
        .set(authHeader(veterinerToken))
        .send({ lineId, warehouseId: merkezWarehouseId, qty: 999 });
      expect(tooMuch.status).toBe(409);
      expect((tooMuch.body as ApiErrorBody).code).toBe('INSUFFICIENT_STOCK');

      // API düzeyi rol denetimi: resepsiyon (prescription.dispense yok) dağıtamaz
      const deniedDispense = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/${prescription.id}/dispense`)
        .set(authHeader(resepsiyonToken))
        .send({ lineId, warehouseId: merkezWarehouseId, qty: 1 });
      expect(deniedDispense.status).toBe(403);

      // İlaç uygulama kaydı (ADMINISTERED) — resepsiyon application kaydı tutabilir
      const administer = await request(app.getHttpServer())
        .post('/api/v1/prescriptions/administrations')
        .set(authHeader(resepsiyonToken))
        .send({
          lineId,
          doseGiven: 5,
          doseUnit: 'ml',
          route: 'oral',
          idempotencyKey: idem(3001),
        });
      expect(administer.status).toBe(201);
      const administration = administer.body as { id: string };
      created.administrationIds.push(administration.id);

      // Uygulama tekrarı aynı anahtarla → tekilleşir
      const administerRepeat = await request(app.getHttpServer())
        .post('/api/v1/prescriptions/administrations')
        .set(authHeader(resepsiyonToken))
        .send({
          lineId,
          doseGiven: 5,
          doseUnit: 'ml',
          route: 'oral',
          idempotencyKey: idem(3001),
        });
      expect(administerRepeat.status).toBe(201);
      expect((administerRepeat.body as { id: string }).id).toBe(administration.id);

      // (kabul kriteri 3) Üç kayıt ayrışır: prescribed satır + dispensed event +
      // administered event aynı detayda ayrı listelerde döner
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/prescriptions/${prescription.id}`)
        .set(authHeader(veterinerToken));
      expect(detail.status).toBe(200);
      const detailBody = detail.body as {
        lines: unknown[];
        dispenses: unknown[];
        administrations: unknown[];
      };
      expect(detailBody.lines).toHaveLength(1);
      expect(detailBody.dispenses).toHaveLength(1);
      expect(detailBody.administrations).toHaveLength(1);
    },
  );

  itDb(
    '5. dağıtımda süresi geçmiş ve karantinalı parti seçilemez',
    async () => {
      const productId = created.productIds[0]!;
      const lots = await prisma.inventoryLot.findMany({
        where: { productId, warehouseId: merkezWarehouseId },
      });
      const expiredLot = lots.find((l) => l.lotCode === 'A2410')!;
      const quarantinedLot = lots.find((l) => l.lotCode === 'K2605')!;

      const create = await request(app.getHttpServer())
        .post('/api/v1/prescriptions')
        .set(authHeader(veterinerToken))
        .send({
          patientId,
          lines: [
            {
              productId,
              drugName: 'F10 Antibiyotik',
              form: 'sirup',
              route: 'oral',
              frequency: 'günde 1 kez',
              quantity: 5,
              quantityUnit: 'ml',
            },
          ],
        });
      const prescription = create.body as { id: string; lines: Array<{ id: string }> };
      created.prescriptionIds.push(prescription.id);
      const lineId = prescription.lines[0]!.id;
      const sign = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/${prescription.id}/sign`)
        .set(authHeader(veterinerToken))
        .send({});
      expect(sign.status).toBe(201);

      const expired = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/${prescription.id}/dispense`)
        .set(authHeader(veterinerToken))
        .send({ lineId, warehouseId: merkezWarehouseId, qty: 5, lotId: expiredLot.id });
      expect(expired.status).toBe(409);
      expect((expired.body as ApiErrorBody).code).toBe('LOT_BLOCKED');

      const quarantined = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/${prescription.id}/dispense`)
        .set(authHeader(veterinerToken))
        .send({ lineId, warehouseId: merkezWarehouseId, qty: 5, lotId: quarantinedLot.id });
      expect(quarantined.status).toBe(409);
      expect((quarantined.body as ApiErrorBody).code).toBe('LOT_BLOCKED');
    },
  );

  itDb(
    '6. şube kapsamı dışı istek 403 döner',
    async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/prescriptions/${created.prescriptionIds[0]}`)
        .set({ ...authHeader(veterinerToken), 'X-Branch-Id': 'not-a-branch' });
      expect([403, 400]).toContain(res.status);
    },
  );

  // ── Aşı: kayıt (kriter 4), takvim (kriter 5), hatırlatma (kriter 6) ───────

  itDb(
    '7. aşı kaydı lot + SKT saklar, süresi geçmiş partiyi reddeder, stok düşer',
    async () => {
      const vaccineProductId = created.productIds[1]!;
      const lots = await prisma.inventoryLot.findMany({
        where: { productId: vaccineProductId, warehouseId: merkezWarehouseId },
      });
      const validLot = lots[0]!;
      expect(validLot.status).toBe('active');

      const balanceBefore = await prisma.stockBalance.findFirst({
        where: { productId: vaccineProductId, lotId: validLot.id },
      });
      expect(balanceBefore).toBeTruthy();

      const event = await request(app.getHttpServer())
        .post('/api/v1/vaccines/events')
        .set(authHeader(veterinerToken))
        .send({
          patientId,
          productId: vaccineProductId,
          warehouseId: merkezWarehouseId,
          lotId: validLot.id,
          route: 'deri_alti',
          site: 'boyun sol',
          note: 'Yıllık karma aşı',
        });
      expect(event.status).toBe(201);
      const vaccineEvent = event.body as {
        id: string;
        lotCode: string;
        expiresAt: string | null;
      };
      created.vaccineEventIds.push(vaccineEvent.id);
      // (kabul kriteri 4) lot kodu + SKT kayıtta dondurulur
      expect(vaccineEvent.lotCode).toBe(validLot.lotCode);
      expect(vaccineEvent.expiresAt).toBeTruthy();

      const balanceAfter = await prisma.stockBalance.findUnique({
        where: { id: balanceBefore!.id },
      });
      expect(Number(balanceAfter!.qtyOnHand)).toBe(Number(balanceBefore!.qtyOnHand) - 1);

      // Süresi geçmiş aşı partisi reddedilir
      const expiredReceipt = await receipt(veterinerToken, {
        warehouseId: merkezWarehouseId,
        supplierId: created.supplierId,
        lines: [
          {
            productId: vaccineProductId,
            lotCode: 'AEXP1',
            qty: 5,
            expiresAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
            unitCost: 40,
          },
        ],
      });
      expect(expiredReceipt.status).toBe(201);
      const expiredLotId = (
        (expiredReceipt.body as { lines: Array<{ lot: { id: string } }> }).lines[0]!.lot
      ).id;
      created.lotIds.push(expiredLotId);
      const expired = await request(app.getHttpServer())
        .post('/api/v1/vaccines/events')
        .set(authHeader(veterinerToken))
        .send({
          patientId,
          productId: vaccineProductId,
          warehouseId: merkezWarehouseId,
          lotId: expiredLotId,
        });
      expect(expired.status).toBe(409);
      expect((expired.body as ApiErrorBody).code).toBe('LOT_EXPIRED');
    },
  );

  itDb(
    '8. aşı takvimi klinik protokolünden türetilir (sabit evrensel takvim yok)',
    async () => {
      const vaccineProductId = created.productIds[1]!;

      // Protokol yokken takvim boş — evrensel varsayım üretilmez
      const before = await request(app.getHttpServer())
        .get(`/api/v1/vaccines/schedule/${patientId}`)
        .set(authHeader(veterinerToken));
      expect(before.status).toBe(200);
      const beforeBody = before.body as { entries: Array<{ protocolId: string }> };
      expect(beforeBody.entries).toHaveLength(0);

      // Klinik protokolü: köpek, 180 gün tekrar, 14 gün önce hatırlatma
      const protocol = await request(app.getHttpServer())
        .post('/api/v1/vaccines/protocols')
        .set(authHeader(veterinerToken))
        .send({
          productId: vaccineProductId,
          speciesId: dogSpeciesId,
          name: `F10 Köpek Karma Protokolü ${runId}`,
          firstDoseAgeDays: 60,
          boosterIntervalDays: 180,
          reminderLeadDays: 14,
          doseLabel: '1 ml',
          route: 'deri_alti',
        });
      expect(protocol.status).toBe(201);
      const protocolBody = protocol.body as { id: string };
      created.vaccineProtocolIds.push(protocolBody.id);

      // Aynı ad ikinci kez → 409
      const duplicate = await request(app.getHttpServer())
        .post('/api/v1/vaccines/protocols')
        .set(authHeader(veterinerToken))
        .send({
          productId: vaccineProductId,
          name: `F10 Köpek Karma Protokolü ${runId}`,
          firstDoseAgeDays: 60,
          boosterIntervalDays: 180,
          reminderLeadDays: 14,
        });
      expect(duplicate.status).toBe(409);
      expect((duplicate.body as ApiErrorBody).code).toBe('VACCINE_PROTOCOL_DUPLICATE_NAME');

      // Kayıtlı aşı + protokol → tekrar vadesi son aşı + 180 gün
      const lastEvent = await prisma.vaccineEvent.findFirst({
        where: { id: { in: created.vaccineEventIds } },
        orderBy: { administeredAt: 'desc' },
      });
      expect(lastEvent).toBeTruthy();
      const schedule = await request(app.getHttpServer())
        .get(`/api/v1/vaccines/schedule/${patientId}`)
        .set(authHeader(veterinerToken));
      expect(schedule.status).toBe(200);
      const scheduleBody = schedule.body as {
        entries: Array<{ protocolId: string; basis: string; dueAt: string }>;
      };
      expect(scheduleBody.entries).toHaveLength(1);
      const entry = scheduleBody.entries[0]!;
      expect(entry.protocolId).toBe(protocolBody.id);
      expect(entry.basis).toBe('booster');
      const expectedDue = new Date(lastEvent!.administeredAt.getTime() + 180 * 86_400_000);
      expect(new Date(entry.dueAt).getUTCFullYear()).toBe(expectedDue.getUTCFullYear());
      expect(new Date(entry.dueAt).getUTCMonth()).toBe(expectedDue.getUTCMonth());
      expect(new Date(entry.dueAt).getUTCDate()).toBe(expectedDue.getUTCDate());
    },
  );

  itDb(
    '9. hatırlatma aynı aşı kaydı için duplicate yaratılamaz ve tekrar gönderilemez',
    async () => {
      const eventId = created.vaccineEventIds[0]!;

      // (kabul kriteri 6a) ilk hatırlatma yazılır
      const reminder = await request(app.getHttpServer())
        .post(`/api/v1/vaccines/events/${eventId}/reminders`)
        .set(authHeader(resepsiyonToken))
        .send({});
      expect(reminder.status).toBe(201);
      const reminderBody = reminder.body as { id: string; kind: string; status: string };
      created.vaccineReminderIds.push(reminderBody.id);
      expect(reminderBody.kind).toBe('booster_due');
      expect(reminderBody.status).toBe('scheduled');

      // (kabul kriteri 6b) aynı event+kind ikinci kez → 409 REMINDER_DUPLICATE
      const duplicate = await request(app.getHttpServer())
        .post(`/api/v1/vaccines/events/${eventId}/reminders`)
        .set(authHeader(resepsiyonToken))
        .send({});
      expect(duplicate.status).toBe(409);
      expect((duplicate.body as ApiErrorBody).code).toBe('VACCINE_REMINDER_DUPLICATE');

      // Gönderim işaretlenir; ikinci gönderim 409 döner
      const send = await request(app.getHttpServer())
        .post(`/api/v1/vaccines/reminders/${reminderBody.id}/send`)
        .set(authHeader(resepsiyonToken))
        .send({ channel: 'phone' });
      expect(send.status).toBe(201);
      expect(send.body.status).toBe('sent');
      expect(send.body.sentAt).toBeTruthy();

      const repeatSend = await request(app.getHttpServer())
        .post(`/api/v1/vaccines/reminders/${reminderBody.id}/send`)
        .set(authHeader(resepsiyonToken))
        .send({ channel: 'phone' });
      expect(repeatSend.status).toBe(409);
      expect((repeatSend.body as ApiErrorBody).code).toBe('VACCINE_REMINDER_ALREADY_SENT');
    },
  );

  itDb(
    '10. yaklaşan/geciken hatırlatma listesi ve izin denetimi çalışır',
    async () => {
      // Overdue penceresi boş dönebilir ama endpoint yanıt vermelidir
      const overdue = await request(app.getHttpServer())
        .get('/api/v1/vaccines/reminders?window=overdue')
        .set(authHeader(veterinerToken));
      expect(overdue.status).toBe(200);
      expect(Array.isArray((overdue.body as { items: unknown[] }).items)).toBe(true);

      const upcoming = await request(app.getHttpServer())
        .get('/api/v1/vaccines/reminders?window=upcoming&horizonDays=200')
        .set(authHeader(resepsiyonToken));
      expect(upcoming.status).toBe(200);

      // stok sorumlusu vaccine.manage iznine sahip değil → 403
      const denied = await request(app.getHttpServer())
        .get('/api/v1/vaccines/events')
        .set(authHeader(stokToken));
      expect(denied.status).toBe(403);
    },
  );

  itDb(
    '11. denetim kayıtları üretilir (imza, dağıtım, aşı, hatırlatma)',
    async () => {
      const audits = await prisma.auditEvent.findMany({
        where: {
          action: {
            in: [
              'PRESCRIPTION_SIGNED',
              'PRESCRIPTION_DISPENSED',
              'ADMINISTRATION_RECORDED',
              'VACCINE_RECORDED',
              'VACCINE_REMINDER_SENT',
            ],
          },
        },
        select: { action: true },
      });
      const actions = new Set(audits.map((a) => a.action));
      expect(actions.has('PRESCRIPTION_SIGNED')).toBe(true);
      expect(actions.has('PRESCRIPTION_DISPENSED')).toBe(true);
      expect(actions.has('ADMINISTRATION_RECORDED')).toBe(true);
      expect(actions.has('VACCINE_RECORDED')).toBe(true);
      expect(actions.has('VACCINE_REMINDER_SENT')).toBe(true);
    },
  );
});
