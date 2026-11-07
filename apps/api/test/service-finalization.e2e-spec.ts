import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/global-exception.filter';

process.env.DATABASE_URL ??=
  'postgresql://vetcore:vetcore-dev@localhost:5433/vetcore?schema=public';
process.env.AUTH_JWT_SECRET ??= 'vetcore-test-secret-0123456789abcdef';

/**
 * Faz 08 API E2E — hizmet → stok → ücret atomik iş akışı kabul kriterleri,
 * gerçek veritabanı ve guard zinciriyle doğulanır:
 * 1. Başarılı finalize: klinik kayıt + stok hareketi + ücret satırı birlikte.
 * 2. Stok yazım hatası tüm transaction'ı geri alır (çok depolu kısmi yazım da).
 * 3. Aynı idempotency key ile tekrar çağrı duplicate yaratmaz (mobil retry).
 * 4. Son ürünü iki eşzamanlı istekten en fazla biri tüketir.
 * 5. Lot no, SKT ve kaynak hizmet kaydı hareket üzerinde izlenebilir.
 * 6. Reversal orijinal hareketi silmeden ters hareket + negatif ücret satırı.
 * 7. Yetkisiz kullanıcı (inventory.consume yok) finalize/reversal yapamaz.
 * Ayrıca: kural önizlemesi (preview), ürünsüz kural uyarısı, manual politika
 * kilidi ve şube kapsamı.
 *
 * Ön koşul: gömülü PostgreSQL + migrate + seed (scripts/f08-api-e2e.sh).
 * Test kendi verisini oluşturur; defter append-only olduğu için temizlik
 * session_replication_role=replica geçici baypasıyla yapılır.
 */

const DEMO_PASSWORD = 'VetCore2026!';
const runId = `f08e2e-${Date.now().toString(36)}`;

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

describe('Faz 08 — hizmet → stok → ücret atomik iş akışı (API kabul kriterleri)', () => {
  let app: INestApplication;
  let adminToken: string;
  let veterinerToken: string;
  let noConsumeToken: string;
  let merkezBranchId: string;
  let merkezWarehouseId: string;
  let ikinciWarehouseId: string;
  let vetStaffId: string;
  let ownerId: string;
  let patientId: string;
  let lotProductId: string;
  let lotId: string;
  let noneProductId: string;
  let lotServiceId: string;
  let noneServiceId: string;
  let manualServiceId: string;
  let speciesIdValue: string;
  let noConsumeStaffId = '';
  let noConsumeRoleId = '';

  const created = {
    encounterIds: [] as string[],
    recordIds: [] as string[],
    chargeIds: [] as string[],
    serviceIds: [] as string[],
    servicePriceIds: [] as string[],
    ruleIds: [] as string[],
    productIds: [] as string[],
    movementIds: [] as string[],
    lotIds: [] as string[],
    warehouseIds: [] as string[],
    ownerIds: [] as string[],
    patientIds: [] as string[],
    staffIds: [] as string[],
    roleIds: [] as string[],
    auditEntityIds: [] as string[],
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

    const prisma = new (await import('@prisma/client')).PrismaClient();
    const clinic = await prisma.clinic.findUnique({ where: { slug: 'vetcore-demo' } });
    if (!clinic) throw new Error('Seed klinik bulunamadı — önce seed çalıştırılmalı');
    const branches = await prisma.branch.findMany({ where: { clinicId: clinic.id } });
    merkezBranchId = branches.find((b) => b.code === 'MRKZ')?.id ?? '';
    const warehouses = await prisma.warehouse.findMany({
      where: { branchId: merkezBranchId },
      orderBy: { createdAt: 'asc' },
    });
    merkezWarehouseId = warehouses[0]?.id ?? '';
    const vet = await prisma.staff.findUnique({ where: { email: 'veteriner@vetcore-demo.example' } });
    vetStaffId = vet?.id ?? '';
    const species = await prisma.species.findFirst({ where: { key: 'cat' } });
    speciesIdValue = species?.id ?? '';
    await prisma.$disconnect();

    adminToken = await login(app, 'admin@vetcore-demo.example');
    veterinerToken = await login(app, 'veteriner@vetcore-demo.example');
  });

  afterAll(async () => {
    if (dbReady && app) {
      const prisma = new (await import('@prisma/client')).PrismaClient();
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
          if (created.chargeIds.length > 0) {
            await tx.charge.deleteMany({ where: { id: { in: created.chargeIds } } });
          }
          if (created.encounterIds.length > 0) {
            await tx.encounter.deleteMany({ where: { id: { in: created.encounterIds } } });
          }
          if (created.recordIds.length > 0) {
            await tx.serviceRecord.deleteMany({ where: { id: { in: created.recordIds } } });
          }
          await tx.stockMovement.deleteMany({
            where: {
              OR: [
                { id: { in: created.movementIds } },
                { refId: { in: created.recordIds }, refType: 'ServiceRecord' },
              ],
            },
          });
          await tx.stockMovementLine.deleteMany({
            where: { productId: { in: created.productIds } },
          });
          await tx.stockBalance.deleteMany({ where: { productId: { in: created.productIds } } });
          await tx.inventoryLot.deleteMany({ where: { productId: { in: created.productIds } } });
          await tx.serviceConsumptionRule.deleteMany({ where: { id: { in: created.ruleIds } } });
          if (created.servicePriceIds.length > 0) {
            await tx.servicePrice.deleteMany({ where: { id: { in: created.servicePriceIds } } });
          }
          if (created.serviceIds.length > 0) {
            await tx.service.deleteMany({ where: { id: { in: created.serviceIds } } });
          }
          await tx.product.deleteMany({ where: { id: { in: created.productIds } } });
          await tx.warehouse.deleteMany({ where: { id: { in: created.warehouseIds } } });
          if (created.staffIds.length > 0) {
            await tx.staff.deleteMany({ where: { id: { in: created.staffIds } } });
          }
          if (created.roleIds.length > 0) {
            await tx.role.deleteMany({ where: { id: { in: created.roleIds } } });
          }
          await tx.auditEvent.deleteMany({
            where: {
              OR: [
                { entityType: 'ServiceRecord', entityId: { in: created.recordIds } },
                { entityType: 'StockMovement', entityId: { in: created.auditEntityIds } },
              ],
            },
          });
          if (created.patientIds.length > 0) {
            await tx.patient.deleteMany({ where: { id: { in: created.patientIds } } });
          }
          if (created.ownerIds.length > 0) {
            await tx.owner.deleteMany({ where: { id: { in: created.ownerIds } } });
          }
        });
      } catch {
        // Temizlik hatası test sonucunu etkilemez (kalıntı sentetik test verisi)
      }
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  // ---- Test verisi kurulumu ----

  itDb('kurulum: sahip, hasta, ürün, parti, hizmet ve kural oluşturulur', async () => {
    // Sahip + hasta
    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/owners')
      .set(authHeader(veterinerToken))
      .send({
        firstName: `Faz08Test${runId}`,
        lastName: 'KesinleşmeSahibi',
        contacts: [{ kind: 'phone', value: '+90 555 444 33 22', label: 'Cep', isPrimary: true }],
        consents: { kvkk: true },
      });
    expect(ownerRes.status).toBe(201);
    ownerId = (ownerRes.body as { id: string }).id;
    created.ownerIds.push(ownerId);

    const patientRes = await request(app.getHttpServer())
      .post(`/api/v1/owners/${ownerId}/patients`)
      .set(authHeader(veterinerToken))
      .send({ name: `FinalizeTest-${runId}`, speciesId: speciesIdValue });
    expect(patientRes.status).toBe(201);
    patientId = (patientRes.body as { id: string }).id;
    created.patientIds.push(patientId);

    // Ürünler: parti takipli (LOT) ve partisiz (NONE)
    const unitRes = await request(app.getHttpServer())
      .get('/api/v1/units')
      .set(authHeader(adminToken));
    const unit = (unitRes.body as { items: { id: string; key: string }[] }).items.find(
      (u) => u.key === 'ml',
    )!;
    const lotRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(authHeader(adminToken))
      .send({
        code: `F08LOT-${runId}`,
        name: `Faz08 Parti Takipli Ürün ${runId}`,
        trackingType: 'lot',
        baseUnitId: unit.id,
        minStock: 1,
      });
    expect(lotRes.status).toBe(201);
    lotProductId = (lotRes.body as { id: string }).id;
    created.productIds.push(lotProductId);

    const noneRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(authHeader(adminToken))
      .send({
        code: `F08NONE-${runId}`,
        name: `Faz08 Partisiz Ürün ${runId}`,
        trackingType: 'none',
        baseUnitId: unit.id,
        minStock: 0,
      });
    expect(noneRes.status).toBe(201);
    noneProductId = (noneRes.body as { id: string }).id;
    created.productIds.push(noneProductId);

    // Mal kabul: LOT × 4 ( concurrency'de son birim testi için tam miktar), NONE × 50
    const receiptRes = await request(app.getHttpServer())
      .post('/api/v1/stock/receipts')
      .set(authHeader(adminToken))
      .send({
        warehouseId: merkezWarehouseId,
        lines: [
          { productId: lotProductId, lotCode: `F08L-${runId}`, expiresAt: '2028-06-01', unitCost: 40, qty: 4 },
          { productId: noneProductId, qty: 50, unitCost: 5 },
        ],
      });
    expect(receiptRes.status).toBe(201);
    const receipt = receiptRes.body as { id: string; lines: { lotId: string | null }[] };
    created.movementIds.push(receipt.id);
    const lotLine = receipt.lines.find((l) => l.lotId !== null);
    expect(lotLine).toBeTruthy();
    lotId = lotLine!.lotId!;
    created.lotIds.push(lotId);

    // Hizmetler + fiyatlar + kurallar
    const svcRes = await request(app.getHttpServer())
      .post('/api/v1/services')
      .set(authHeader(adminToken))
      .send({
        code: `F08SVC-${runId}`,
        name: `Faz08 Kesinleşme Hizmeti ${runId}`,
        category: 'muayene',
        durationMin: 10,
      });
    expect(svcRes.status).toBe(201);
    lotServiceId = (svcRes.body as { id: string }).id;
    created.serviceIds.push(lotServiceId);

    const svc2Res = await request(app.getHttpServer())
      .post('/api/v1/services')
      .set(authHeader(adminToken))
      .send({
        code: `F08NONESVC-${runId}`,
        name: `Faz08 Partisiz Tüketim ${runId}`,
        category: 'muayene',
        durationMin: 10,
      });
    expect(svc2Res.status).toBe(201);
    noneServiceId = (svc2Res.body as { id: string }).id;
    created.serviceIds.push(noneServiceId);

    const svc3Res = await request(app.getHttpServer())
      .post('/api/v1/services')
      .set(authHeader(adminToken))
      .send({
        code: `F08MAN-${runId}`,
        name: `Faz08 Manuel Tahsis ${runId}`,
        category: 'cerrahi',
        durationMin: 20,
      });
    expect(svc3Res.status).toBe(201);
    manualServiceId = (svc3Res.body as { id: string }).id;
    created.serviceIds.push(manualServiceId);

    for (const [serviceId, amount] of [
      [lotServiceId, '1000.00'],
      [noneServiceId, '250.00'],
      [manualServiceId, '300.00'],
    ] as const) {
      const priceRes = await request(app.getHttpServer())
        .post(`/api/v1/services/${serviceId}/prices`)
        .set(authHeader(adminToken))
        .send({ amount, currency: 'TRY', validFrom: '2026-01-01T00:00:00.000Z' });
      expect(priceRes.status).toBe(201);
      created.servicePriceIds.push((priceRes.body as { id: string }).id);
    }

    const ruleRes = await request(app.getHttpServer())
      .post(`/api/v1/services/${lotServiceId}/consumption-rules`)
      .set(authHeader(adminToken))
      .send({ productId: lotProductId, defaultQty: 1, unit: 'doz', required: true, allocationPolicy: 'fifo' });
    expect(ruleRes.status).toBe(201);
    created.ruleIds.push((ruleRes.body as { id: string }).id);

    const rule2Res = await request(app.getHttpServer())
      .post(`/api/v1/services/${noneServiceId}/consumption-rules`)
      .set(authHeader(adminToken))
      .send({ productId: noneProductId, defaultQty: 2, unit: 'adet', required: false, allocationPolicy: 'fifo' });
    expect(rule2Res.status).toBe(201);
    created.ruleIds.push((rule2Res.body as { id: string }).id);

    const rule3Res = await request(app.getHttpServer())
      .post(`/api/v1/services/${manualServiceId}/consumption-rules`)
      .set(authHeader(adminToken))
      .send({ productId: lotProductId, defaultQty: 1, unit: 'doz', required: true, allocationPolicy: 'manual' });
    expect(rule3Res.status).toBe(201);
    created.ruleIds.push((rule3Res.body as { id: string }).id);

    // rollback testi için aynı şubede ikinci (boş) depo
    const whRes = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set(authHeader(adminToken))
      .send({ branchId: merkezBranchId, name: `Faz08 Boş Depo ${runId}` });
    expect(whRes.status).toBe(201);
    ikinciWarehouseId = (whRes.body as { id: string }).id;
    created.warehouseIds.push(ikinciWarehouseId);
  });

  // ---- Yardımcılar ----

  async function createEncounter(): Promise<{ id: string }> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/encounters')
      .set(authHeader(veterinerToken))
      .send({
        patientId,
        veterinarianId: vetStaffId,
        chiefComplaint: `Faz08 test muayenesi ${runId}`,
      });
    expect(res.status).toBe(201);
    const body = res.body as { id: string };
    created.encounterIds.push(body.id);
    return body;
  }

  async function addRecord(
    encounterId: string,
    serviceId: string,
    qty = 1,
  ): Promise<{ id: string }> {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounterId}/service-records`)
      .set(authHeader(veterinerToken))
      .send({ lines: [{ serviceId, qty }] });
    expect(res.status).toBe(201);
    const body = res.body as { id: string };
    created.recordIds.push(body.id);
    return body;
  }

  async function balanceOf(productId: string, warehouseId: string): Promise<number> {
    const prisma = new (await import('@prisma/client')).PrismaClient();
    try {
      const rows = await prisma.stockBalance.findMany({ where: { productId, warehouseId } });
      return rows.reduce((acc, r) => acc + Number(r.qtyOnHand), 0);
    } finally {
      await prisma.$disconnect();
    }
  }

  async function movementsFor(recordId: string): Promise<
    { id: string; kind: string; warehouseId: string; lines: { lotId: string | null; qty: string; productId: string }[] }[]
  > {
    const prisma = new (await import('@prisma/client')).PrismaClient();
    try {
      const movements = await prisma.stockMovement.findMany({
        where: { refType: 'ServiceRecord', refId: recordId },
        include: { lines: true },
        orderBy: { postedAt: 'asc' },
      });
      return movements.map((m) => ({
        id: m.id,
        kind: m.kind,
        warehouseId: m.warehouseId,
        lines: m.lines.map((l) => ({
          lotId: l.lotId,
          qty: l.qty.toString(),
          productId: l.productId,
        })),
      }));
    } finally {
      await prisma.$disconnect();
    }
  }

  function trackCharge(recordBody: { charge?: { id: string } | null }): void {
    if (recordBody.charge?.id && !created.chargeIds.includes(recordBody.charge.id)) {
      created.chargeIds.push(recordBody.charge.id);
    }
  }

  // ---- Kabul kriteri 1 + 5: atomik finalize ve izlenebilirlik ----

  itDb('1. finalize: klinik kayıt + stok düşümü + ücret satırı birlikte oluşur; hareket izlenebilir', async () => {
    const encounter = await createEncounter();
    const record = await addRecord(encounter.id, lotServiceId, 1);
    const before = await balanceOf(lotProductId, merkezWarehouseId);
    expect(before).toBe(4);

    const finalizeRes = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/service-records/${record.id}/finalize`)
      .set(authHeader(veterinerToken))
      .send({
        consumptions: [
          { productId: lotProductId, warehouseId: merkezWarehouseId, lotId, qty: 1 },
        ],
      });
    expect(finalizeRes.status).toBe(201);
    const body = finalizeRes.body as {
      status: string;
      finalizedAt: string | null;
      performedBy: { firstName: string } | null;
      lines: { lineTotal: string }[];
      charge: {
        id: string;
        status: string;
        total: string;
        currency: string;
        lines: { sourceType: string; description: string; qty: string; total: string }[];
      } | null;
    };
    trackCharge(body);
    expect(body.status).toBe('finalized');
    expect(body.finalizedAt).toBeTruthy();
    expect(body.performedBy).toBeTruthy();
    expect(body.charge).toBeTruthy();
    expect(body.charge!.status).toBe('open');
    expect(body.charge!.currency).toBe('TRY');
    expect(Number(body.charge!.total)).toBe(1000);
    expect(body.charge!.lines).toHaveLength(1);
    expect(body.charge!.lines[0]!.sourceType).toBe('service');

    // Bakiye düşümü — defterle mutabık
    const after = await balanceOf(lotProductId, merkezWarehouseId);
    expect(after).toBe(3);

    // Kabul kriteri 5: lot + SKT + kaynak hizmet kaydı izlenebilir
    const movements = await movementsFor(record.id);
    expect(movements).toHaveLength(1);
    const movement = movements[0]!;
    expect(movement.kind).toBe('service_consumption');
    expect(movement.lines[0]!.lotId).toBe(lotId);
    expect(Number(movement.lines[0]!.qty)).toBe(-1);

    const prisma = new (await import('@prisma/client')).PrismaClient();
    try {
      const lot = await prisma.inventoryLot.findUnique({ where: { id: lotId } });
      expect(lot?.expiresAt).toBeTruthy(); // SKT parti üzerinden izlenir
      const audit = await prisma.auditEvent.findFirst({
        where: { action: 'SERVICE_RECORD_FINALIZED', entityType: 'ServiceRecord', entityId: record.id },
      });
      expect(audit).toBeTruthy();
      created.auditEntityIds.push(`finalize-${record.id}`);
    } finally {
      await prisma.$disconnect();
    }
  });

  // ---- Kabul kriteri 3: idempotency (mobil retry) ----

  itDb('3. aynı idempotency key ile tekrar çağrı duplicate yaratmaz (REPLAY)', async () => {
    const encounter = await createEncounter();
    const record = await addRecord(encounter.id, lotServiceId, 1);
    const idemKey = '3f2c1a4e-0000-4000-8000-00000000f008';

    const first = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/service-records/${record.id}/finalize`)
      .set(authHeader(veterinerToken))
      .set('Idempotency-Key', idemKey)
      .send({}); // gövde boş → kural planı otomatik (1 doz LOT)
    expect(first.status).toBe(201);
    const firstBody = first.body as { status: string; charge: { id: string } | null };
    trackCharge(firstBody);
    expect(firstBody.status).toBe('finalized');
    expect(await balanceOf(lotProductId, merkezWarehouseId)).toBe(2);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/service-records/${record.id}/finalize`)
      .set(authHeader(veterinerToken))
      .set('Idempotency-Key', idemKey)
      .send({});
    expect(second.status).toBe(201);
    const secondBody = second.body as { status: string; charge: { id: string } | null };
    expect(secondBody.status).toBe('finalized');
    expect(secondBody.charge?.id).toBe(firstBody.charge?.id); // aynı ücret — yeni post yok

    // Farklı anahtarla tekrar → 409
    const conflict = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/service-records/${record.id}/finalize`)
      .set(authHeader(veterinerToken))
      .set('Idempotency-Key', '3f2c1a4e-0000-4000-8000-00000000f009')
      .send({});
    expect(conflict.status).toBe(409);

    const movements = await movementsFor(record.id);
    expect(movements).toHaveLength(1); // duplicate hareket yok

    const prisma = new (await import('@prisma/client')).PrismaClient();
    try {
      const charges = await prisma.charge.count({ where: { serviceRecordId: record.id } });
      expect(charges).toBe(1); // duplicate ücret yok
    } finally {
      await prisma.$disconnect();
    }
  });

  // ---- Kabul kriteri 2: stok yazım hatası tüm transaction'ı geri alır ----

  itDb('2. ikinci depoda stok yazım hatası: kısmi yazım yok, tüm işlem geri alınır', async () => {
    const encounter = await createEncounter();
    const record = await addRecord(encounter.id, noneServiceId, 1);
    const beforeLot = await balanceOf(lotProductId, merkezWarehouseId);

    // WH1'de LOT tüketimi geçerli; WH2'de NONE stoğu yok → 2. hareket yazımı patlar
    const finalizeRes = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/service-records/${record.id}/finalize`)
      .set(authHeader(veterinerToken))
      .send({
        consumptions: [
          { productId: lotProductId, warehouseId: merkezWarehouseId, lotId, qty: 1 },
          { productId: noneProductId, warehouseId: ikinciWarehouseId, qty: 1 },
        ],
      });
    expect(finalizeRes.status).toBe(409);
    const err = finalizeRes.body as { code?: string };
    expect(err.code).toBe('INSUFFICIENT_STOCK');

    // Kayıt hâlâ taslak; ücret ve hareket YOK; WH1 bakiyesi değişmedi
    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/encounters/${encounter.id}`)
      .set(authHeader(veterinerToken));
    const detail = detailRes.body as {
      serviceRecords: { id: string; status: string; charge: unknown }[];
    };
    const rec = detail.serviceRecords.find((r) => r.id === record.id)!;
    expect(rec.status).toBe('draft');
    expect(rec.charge).toBeNull();

    const prisma = new (await import('@prisma/client')).PrismaClient();
    try {
      const movementCount = await prisma.stockMovement.count({
        where: { refType: 'ServiceRecord', refId: record.id },
      });
      expect(movementCount).toBe(0);
      const chargeCount = await prisma.charge.count({ where: { serviceRecordId: record.id } });
      expect(chargeCount).toBe(0);
      const ghostBalance = await prisma.stockBalance.count({
        where: { productId: noneProductId, warehouseId: ikinciWarehouseId },
      });
      expect(ghostBalance).toBe(0); // ensureBalance yaradığı hayalet satır da geri alındı
    } finally {
      await prisma.$disconnect();
    }
    expect(await balanceOf(lotProductId, merkezWarehouseId)).toBe(beforeLot);
  });

  // ---- Kabul kriteri 4: eşzamanlılık — son ürün tek tüketim ----

  itDb('4. son ürünü iki eşzamanlı istekten en fazla biri tüketir', async () => {
    const encounter = await createEncounter();
    const record = await addRecord(encounter.id, lotServiceId, 1);
    // Önceki testlerde düşülen stokla tam 2 doz kalmalı (4 − 1 − 1; rollback yazmadı)
    expect(await balanceOf(lotProductId, merkezWarehouseId)).toBe(2);

    const finalize = (): Promise<request.Response> =>
      request(app.getHttpServer())
        .post(`/api/v1/encounters/${encounter.id}/service-records/${record.id}/finalize`)
        .set(authHeader(veterinerToken))
        .send({}); // otomatik kural planı — her iki istek de 1 doz ister

    const [a, b] = await Promise.all([finalize(), finalize()]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(await balanceOf(lotProductId, merkezWarehouseId)).toBe(1);

    const movements = await movementsFor(record.id);
    expect(movements).toHaveLength(1); // tek hareket — koşullu azaltım diğerini aldı

    const prisma = new (await import('@prisma/client')).PrismaClient();
    try {
      const charges = await prisma.charge.count({ where: { serviceRecordId: record.id } });
      expect(charges).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  });

  itDb('4b. aynı partiyi tüketen iki farklı kayıt: koşullu azaltım ikinciyi geri alır', async () => {
    // Kalan son 1 doz → iki farklı kayıt aynı lotu talep eder
    expect(await balanceOf(lotProductId, merkezWarehouseId)).toBe(1);

    const enc1 = await createEncounter();
    const rec1 = await addRecord(enc1.id, lotServiceId, 1);
    const enc2 = await createEncounter();
    const rec2 = await addRecord(enc2.id, lotServiceId, 1);

    const finalize = (encounterId: string, recordId: string): Promise<request.Response> =>
      request(app.getHttpServer())
        .post(`/api/v1/encounters/${encounterId}/service-records/${recordId}/finalize`)
        .set(authHeader(veterinerToken))
        .send({});

    const [a, b] = await Promise.all([
      finalize(enc1.id, rec1.id),
      finalize(enc2.id, rec2.id),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(await balanceOf(lotProductId, merkezWarehouseId)).toBe(0);

    // Başarılı kayıtta tam yazım; başarısız kayıtta hiç yazım yok
    const m1 = await movementsFor(rec1.id);
    const m2 = await movementsFor(rec2.id);
    expect(m1.length + m2.length).toBe(1);
    const prisma = new (await import('@prisma/client')).PrismaClient();
    try {
      const charges = await prisma.charge.count({
        where: { serviceRecordId: { in: [rec1.id, rec2.id] } },
      });
      expect(charges).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  });

  // ---- Kabul kriteri 6: reversal ----

  itDb('6. reversal: orijinal hareket silinmeden ters hareket + negatif ücret satırı', async () => {
    // Stoka iade için önce 1 doz mal kabul yap (aynı kod/SKT/maliyet → var olan lota eklenir)
    const topup = await request(app.getHttpServer())
      .post('/api/v1/stock/receipts')
      .set(authHeader(adminToken))
      .send({
        warehouseId: merkezWarehouseId,
        lines: [
          { productId: lotProductId, lotCode: `F08L-${runId}`, expiresAt: '2028-06-01', unitCost: 40, qty: 1 },
        ],
      });
    expect(topup.status).toBe(201);
    created.movementIds.push((topup.body as { id: string }).id);

    const encounter = await createEncounter();
    const record = await addRecord(encounter.id, lotServiceId, 1);
    const fin = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/service-records/${record.id}/finalize`)
      .set(authHeader(veterinerToken))
      .send({});
    expect(fin.status).toBe(201);
    const finBody = fin.body as { charge: { id: string; total: string } | null };
    trackCharge(finBody);
    expect(Number(finBody.charge!.total)).toBe(1000);
    expect(await balanceOf(lotProductId, merkezWarehouseId)).toBe(0);

    const revRes = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/service-records/${record.id}/reverse`)
      .set(authHeader(veterinerToken))
      .send({ reason: 'Yanlış hizmet girildi — Faz08 reversal testi' });
    expect(revRes.status).toBe(201);
    const revBody = revRes.body as {
      status: string;
      reversedAt: string | null;
      reversedBy: { firstName: string } | null;
      charge: {
        status: string;
        total: string;
        lines: { sourceType: string; total: string }[];
      } | null;
    };
    expect(revBody.reversedAt).toBeTruthy();
    expect(revBody.reversedBy).toBeTruthy();
    expect(revBody.charge!.status).toBe('void'); // tam iade → void
    expect(Number(revBody.charge!.total)).toBe(0);
    const sourceTypes = revBody.charge!.lines.map((l) => l.sourceType).sort();
    expect(sourceTypes).toEqual(['service', 'service_reversal']); // orijinal + düzeltme

    // Orijinal hareket hâlâ yerinde + ters hareket stoğu iade etti
    const movements = await movementsFor(record.id);
    expect(movements).toHaveLength(2);
    const kinds = movements.map((m) => m.kind).sort();
    expect(kinds).toEqual(['service_consumption', 'service_reversal']);
    expect(await balanceOf(lotProductId, merkezWarehouseId)).toBe(1);

    // İkinci reversal → 409 SERVICE_RECORD_REVERSED
    const secondRev = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/service-records/${record.id}/reverse`)
      .set(authHeader(veterinerToken))
      .send({ reason: 'ikinci deneme reddedilmeli' });
    expect(secondRev.status).toBe(409);
    expect((secondRev.body as { code?: string }).code).toBe('SERVICE_RECORD_REVERSED');

    const prisma = new (await import('@prisma/client')).PrismaClient();
    try {
      const audit = await prisma.auditEvent.findFirst({
        where: { action: 'SERVICE_RECORD_REVERSED', entityType: 'ServiceRecord', entityId: record.id },
      });
      expect(audit).toBeTruthy();
    } finally {
      await prisma.$disconnect();
    }
  });

  // ---- Kabul kriteri 7: yetkilendirme (API düzeyi rol denetimi) ----

  itDb('kurulum: encounter.manage sahibi ama inventory.consume olmayan test kullanıcısı', async () => {
    const roleRes = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set(authHeader(adminToken))
      .send({
        key: `f08nc-${runId}`.slice(0, 40),
        name: `Faz08 Tüketimsiz Rol ${runId}`,
        allBranches: false,
      });
    expect(roleRes.status).toBe(201);
    noConsumeRoleId = (roleRes.body as { id: string }).id;
    created.roleIds.push(noConsumeRoleId);

    const permRes = await request(app.getHttpServer())
      .put(`/api/v1/roles/${noConsumeRoleId}/permissions`)
      .set(authHeader(adminToken))
      .send({ permissionKeys: ['encounter.manage', 'owner.manage', 'patient.manage'] });
    expect(permRes.status).toBe(200);

    const staffRes = await request(app.getHttpServer())
      .post('/api/v1/staff')
      .set(authHeader(adminToken))
      .send({
        email: `f08nc-${runId}@vetcore-demo.example`,
        password: DEMO_PASSWORD,
        firstName: 'Faz08',
        lastName: 'Tüketimsiz',
        roleIds: [noConsumeRoleId],
        branchIds: [merkezBranchId],
      });
    expect(staffRes.status).toBe(201);
    noConsumeStaffId = (staffRes.body as { id: string }).id;
    created.staffIds.push(noConsumeStaffId);

    noConsumeToken = await login(app, `f08nc-${runId}@vetcore-demo.example`);
    expect(noConsumeToken).toBeTruthy();
  });

  itDb('7. yetkisiz kullanıcı finalize edemez (403 PERMISSION_DENIED), stok hareketi oluşmaz', async () => {
    const encounter = await createEncounter();
    const record = await addRecord(encounter.id, lotServiceId, 1);
    const before = await balanceOf(lotProductId, merkezWarehouseId);

    const fin = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/service-records/${record.id}/finalize`)
      .set(authHeader(noConsumeToken))
      .send({});
    expect(fin.status).toBe(403);
    expect((fin.body as { code?: string }).code).toBe('PERMISSION_DENIED');
    expect(await balanceOf(lotProductId, merkezWarehouseId)).toBe(before);

    // Reversal izni de yok — servis katmanı izni durum denetiminden önce ister
    const rec2 = await addRecord(encounter.id, lotServiceId, 1);
    const rev = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/service-records/${rec2.id}/reverse`)
      .set(authHeader(noConsumeToken))
      .send({ reason: 'yetkisiz iptal denemesi' });
    expect(rev.status).toBe(403);
    expect((rev.body as { code?: string }).code).toBe('PERMISSION_DENIED');
  });

  // ---- Önizleme ve kural davranışları ----

  itDb('preview: kural planı, üretim uyarıları ve ücret önizlemesi doğru', async () => {
    // Stoğa 1 doz ekle → preview 3 isteyecek, 2 bulacak → uyarı
    const topup = await request(app.getHttpServer())
      .post('/api/v1/stock/receipts')
      .set(authHeader(adminToken))
      .send({
        warehouseId: merkezWarehouseId,
        lines: [
          { productId: lotProductId, lotCode: `F08L-${runId}`, expiresAt: '2028-06-01', unitCost: 40, qty: 1 },
        ],
      });
    expect(topup.status).toBe(201);
    created.movementIds.push((topup.body as { id: string }).id);

    const encounter = await createEncounter();
    const record = await addRecord(encounter.id, lotServiceId, 3); // 3 × 1 doz = 3 ihtiyaç

    const previewRes = await request(app.getHttpServer())
      .get(`/api/v1/encounters/${encounter.id}/service-records/${record.id}/consumption-preview`)
      .set(authHeader(veterinerToken));
    expect(previewRes.status).toBe(200);
    const preview = previewRes.body as {
      consumptions: {
        productId: string;
        qty: number;
        allocationPolicy: string;
        suggestedWarehouseId: string | null;
        suggestedAllocations: { lotId: string; qty: number }[];
        shortfall: number;
        warning: string | null;
        lots: { lotId: string; lotCode: string; qtyOnHand: number; blockReason: string | null }[];
      }[];
      issues: { code: string }[];
      charge: { total: string; lines: { description: string }[] };
    };
    expect(preview.consumptions).toHaveLength(1);
    const plan = preview.consumptions[0]!;
    expect(plan.productId).toBe(lotProductId);
    expect(plan.qty).toBe(3); // defaultQty 1 × hizmet satırı 3
    expect(plan.suggestedWarehouseId).toBe(merkezWarehouseId);
    expect(plan.shortfall).toBe(1); // yalnız 2 doz var
    expect(plan.warning).toBeTruthy();
    expect(plan.suggestedAllocations[0]!.lotId).toBe(lotId);
    expect(Number(preview.charge.total)).toBe(3000); // fiyat önizlemesi 3 × 1000
  });

  itDb('preview: ürünsüz kural RULE_WITHOUT_PRODUCT uyarısı verir, finalize tüketimsiz geçer', async () => {
    const encounter = await createEncounter();
    // HIZ-004 (seed) — kuralı ürünle bağlı değil
    const svcRes = await request(app.getHttpServer())
      .get('/api/v1/services')
      .set(authHeader(veterinerToken));
    const hiz004 = (svcRes.body as { items: { id: string; code: string }[] }).items.find(
      (s) => s.code === 'HIZ-004',
    )!;

    const previewRecord = await addRecord(encounter.id, hiz004.id, 1);
    const previewRes = await request(app.getHttpServer())
      .get(`/api/v1/encounters/${encounter.id}/service-records/${previewRecord.id}/consumption-preview`)
      .set(authHeader(veterinerToken));
    expect(previewRes.status).toBe(200);
    const preview = previewRes.body as {
      consumptions: unknown[];
      issues: { code: string }[];
      charge: { total: string };
    };
    expect(preview.consumptions).toHaveLength(0);
    expect(preview.issues.some((i) => i.code === 'RULE_WITHOUT_PRODUCT')).toBe(true);
    expect(Number(preview.charge.total)).toBe(1250); // HIZ-004 temel fiyat

    // Finalize: tüketim yok — yalnız klinik kayıt + ücret
    const fin = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/service-records/${previewRecord.id}/finalize`)
      .set(authHeader(veterinerToken))
      .send({});
    expect(fin.status).toBe(201);
    const finBody = fin.body as { status: string; charge: { id: string; total: string } | null };
    trackCharge(finBody);
    expect(finBody.status).toBe('finalized');
    expect(Number(finBody.charge!.total)).toBe(1250);

    const movements = await movementsFor(previewRecord.id);
    expect(movements).toHaveLength(0); // tüketim yok → hareket yok
  });

  itDb('manual politika: otomatik finalize kilitli, açık parti seçimi ile geçer', async () => {
    const encounter = await createEncounter();
    const record = await addRecord(encounter.id, manualServiceId, 1);

    // Otomatik plan — manual politika → 409 REQUIRED_CONSUMPTION_MISSING
    const auto = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/service-records/${record.id}/finalize`)
      .set(authHeader(veterinerToken))
      .send({});
    expect(auto.status).toBe(409);
    expect((auto.body as { code?: string }).code).toBe('REQUIRED_CONSUMPTION_MISSING');

    // Açık parti seçimi ile finalize
    const explicit = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/service-records/${record.id}/finalize`)
      .set(authHeader(veterinerToken))
      .send({
        consumptions: [
          { productId: lotProductId, warehouseId: merkezWarehouseId, lotId, qty: 1 },
        ],
      });
    expect(explicit.status).toBe(201);
    const body = explicit.body as { status: string; charge: { id: string; total: string } | null };
    trackCharge(body);
    expect(body.status).toBe('finalized');
    expect(await balanceOf(lotProductId, merkezWarehouseId)).toBe(1);
  });

  itDb('şube kapsamı: başka şube deposuyla finalize WAREHOUSE_NOT_IN_BRANCH', async () => {
    const prisma = new (await import('@prisma/client')).PrismaClient();
    let sube2WarehouseId = '';
    try {
      const sube2 = await prisma.branch.findFirst({ where: { code: 'SUB2' } });
      const wh = await prisma.warehouse.findFirst({ where: { branchId: sube2?.id } });
      sube2WarehouseId = wh?.id ?? '';
    } finally {
      await prisma.$disconnect();
    }
    if (!sube2WarehouseId) return;

    const encounter = await createEncounter();
    const record = await addRecord(encounter.id, manualServiceId, 1);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/service-records/${record.id}/finalize`)
      .set(authHeader(veterinerToken))
      .send({
        consumptions: [
          { productId: lotProductId, warehouseId: sube2WarehouseId, lotId, qty: 1 },
        ],
      });
    expect(res.status).toBe(400);
    expect((res.body as { code?: string }).code).toBe('WAREHOUSE_NOT_IN_BRANCH');
  });

  itDb('geçersiz parti: süresi dolmuş parti LOT_BLOCKED ile reddedilir', async () => {
    // Süresi dolmuş parti ile mal kabul
    const receipt = await request(app.getHttpServer())
      .post('/api/v1/stock/receipts')
      .set(authHeader(adminToken))
      .send({
        warehouseId: merkezWarehouseId,
        lines: [
          {
            productId: lotProductId,
            lotCode: `F08EXP-${runId}`,
            expiresAt: '2020-01-01',
            unitCost: 10,
            qty: 5,
          },
        ],
      });
    expect(receipt.status).toBe(201);
    const expiredLotId = (receipt.body as { lines: { lotId: string | null }[] }).lines[0]!.lotId!;
    created.lotIds.push(expiredLotId);
    created.movementIds.push((receipt.body as { id: string }).id);

    const encounter = await createEncounter();
    const record = await addRecord(encounter.id, manualServiceId, 1);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/encounters/${encounter.id}/service-records/${record.id}/finalize`)
      .set(authHeader(veterinerToken))
      .send({
        consumptions: [
          { productId: lotProductId, warehouseId: merkezWarehouseId, lotId: expiredLotId, qty: 1 },
        ],
      });
    expect(res.status).toBe(409);
    expect((res.body as { code?: string }).code).toBe('LOT_BLOCKED');
  });
});
