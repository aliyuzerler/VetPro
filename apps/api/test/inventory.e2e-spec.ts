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
 * Faz 07 API E2E — ürün, depo, lot, tedarikçi ve stok defteri kabul
 * kriterleri, gerçek veritabanı ve guard zinciriyle doğulanır:
 * 1. Mal kabul lot/SKT/maliyet ile stok artırır.
 * 2. Lot bazlı bakiyeler defterle mutabık (SUM(satır) == bakiye).
 * 3. Expired/karantina partisi tüketim için seçilemez.
 * 4. Transfer: dispatch sonrası yolda, receive sonrası hedef stok artışı.
 * 5. Sayım tamamlama gerekçe + denetim gerektirir.
 * 6. Aynı lot eş zamanlı iki tüketimde negatif stok oluşmaz.
 * 7. Defter append-only: güncelleme/silme API ve veritabanı düzeyinde blokludur.
 *
 * Ön koşul: gömülü PostgreSQL + migrate + seed (scripts/f07-api-e2e.sh).
 * Test kendi verisini oluşturur; defter append-only olduğu için temizlik
 * test sonunda session_replication_role=replica geçici baypası ile yapılır.
 */

const DEMO_PASSWORD = 'VetCore2026!';
const runId = `f07e2e-${Date.now().toString(36)}`;

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

describe('Faz 07 — ürün, depo, lot ve stok defteri (API kabul kriterleri)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let veterinerToken: string;
  let resepsiyonToken: string;
  let stokToken: string;
  let merkezWarehouseId: string;
  let sube2WarehouseId: string;
  let merkezBranchId: string;
  let sube2BranchId: string;

  // Test süresince oluşturulan kayıtlar (temizlik için)
  const created = {
    productIds: [] as string[],
    supplierIds: [] as string[],
    categoryIds: [] as string[],
    unitIds: [] as string[],
    transferIds: [] as string[],
    countIds: [] as string[],
    movementIds: [] as string[],
    lotIds: [] as string[],
    temperatureLogIds: [] as string[],
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

    prisma = app.get(PrismaService);
    const clinic = await prisma.clinic.findUnique({ where: { slug: 'vetcore-demo' } });
    if (!clinic) throw new Error('Seed klinik bulunamadı — önce seed çalıştırılmalı');
    const branches = await prisma.branch.findMany({ where: { clinicId: clinic.id } });
    merkezBranchId = branches.find((b) => b.code === 'MRKZ')?.id ?? '';
    sube2BranchId = branches.find((b) => b.code === 'SUB2')?.id ?? '';
    const warehouses = await prisma.warehouse.findMany({
      where: { branchId: { in: [merkezBranchId, sube2BranchId] } },
    });
    merkezWarehouseId = warehouses.find((w) => w.name === 'Merkez Ana Depo')?.id ?? '';
    sube2WarehouseId = warehouses.find((w) => w.name === 'Şube Deposu')?.id ?? '';

    adminToken = await login(app, 'admin@vetcore-demo.example');
    veterinerToken = await login(app, 'veteriner@vetcore-demo.example');
    resepsiyonToken = await login(app, 'resepsiyon@vetcore-demo.example');
    stokToken = await login(app, 'stok@vetcore-demo.example');
  });

  afterAll(async () => {
    if (dbReady && app) {
      // Defter append-only olduğundan temizlik yalnızca test ortamında tetikleyici
      // baypasıyla yapılır (session_replication_role=replica — işlem kapsamlı).
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
          const productIds = created.productIds;
          await tx.stockMovement.deleteMany({
            where: {
              OR: [
                { id: { in: created.movementIds } },
                { lines: { some: { productId: { in: productIds } } } },
                { refId: { in: [...created.transferIds, ...created.countIds] } },
              ],
            },
          });
          await tx.stockBalance.deleteMany({ where: { productId: { in: productIds } } });
          await tx.inventoryLot.deleteMany({ where: { productId: { in: productIds } } });
          await tx.stockTransferLine.deleteMany({
            where: { transferId: { in: created.transferIds } },
          });
          await tx.stockTransfer.deleteMany({ where: { id: { in: created.transferIds } } });
          await tx.stockCountLine.deleteMany({ where: { stockCountId: { in: created.countIds } } });
          await tx.stockCount.deleteMany({ where: { id: { in: created.countIds } } });
          await tx.temperatureLog.deleteMany({ where: { id: { in: created.temperatureLogIds } } });
          await tx.serviceConsumptionRule.deleteMany({
            where: { productId: { in: productIds } },
          });
          await tx.productUnitConversion.deleteMany({
            where: { productId: { in: productIds } },
          });
          await tx.product.deleteMany({ where: { id: { in: productIds } } });
          await tx.supplier.deleteMany({ where: { id: { in: created.supplierIds } } });
          await tx.productCategory.deleteMany({ where: { id: { in: created.categoryIds } } });
          await tx.unit.deleteMany({ where: { id: { in: created.unitIds } } });
          await tx.auditEvent.deleteMany({
            where: { entityType: 'StockMovement', entityId: { in: created.auditEntityIds } },
          });
        });
      } catch {
        // Temizlik hatası test sonucunu etkilemez (kalıntı sentetik test verisi)
      }
    }
    if (app) await app.close();
  });

  // ── Yardımcılar ───────────────────────────────────────────────────────────

  async function createTestProduct(
    overrides: Partial<{ trackingType: string; minStock: number; code: string; name: string }> = {},
  ): Promise<{ id: string; code: string; trackingType: string }> {
    const unitRes = await request(app.getHttpServer())
      .get('/api/v1/units')
      .set(authHeader(adminToken));
    const unit = (unitRes.body as { items: { id: string; key: string }[] }).items.find(
      (u) => u.key === 'ml',
    );
    const res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set(authHeader(adminToken))
      .send({
        code: overrides.code ?? `TST-${runId}-${created.productIds.length + 1}`,
        name: overrides.name ?? `Stok Test Ürünü ${runId}`,
        trackingType: overrides.trackingType ?? 'lot',
        baseUnitId: unit!.id,
        minStock: overrides.minStock ?? 5,
      });
    expect(res.status).toBe(201);
    const product = res.body as { id: string; code: string; trackingType: string };
    created.productIds.push(product.id);
    return product;
  }

  async function postReceipt(
    token: string,
    body: Record<string, unknown>,
    expectedStatus = 201,
  ): Promise<Record<string, unknown>> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/stock/receipts')
      .set(authHeader(token))
      .send(body);
    expect(res.status).toBe(expectedStatus);
    if (res.status === 201) {
      const movement = res.body as { id: string; lines: { lotId: string | null }[] };
      created.movementIds.push(movement.id);
      for (const line of movement.lines) {
        if (line.lotId && !created.lotIds.includes(line.lotId)) created.lotIds.push(line.lotId);
      }
      created.auditEntityIds.push(movement.id);
    }
    return res.body as Record<string, unknown>;
  }

  async function postConsumption(
    token: string,
    body: Record<string, unknown>,
    expectedStatus = 201,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/stock/consumptions')
      .set(authHeader(token))
      .send(body);
    if (res.status === expectedStatus && res.status === 201) {
      const movement = res.body as { id: string };
      created.movementIds.push(movement.id);
      created.auditEntityIds.push(movement.id);
    }
    return res;
  }

  async function balanceFor(productId: string, lotId?: string): Promise<number> {
    const balance = await prisma.stockBalance.findFirst({
      where: { productId, warehouseId: merkezWarehouseId, lotId: lotId ?? null },
    });
    return balance?.qtyOnHand.toNumber() ?? 0;
  }

  // ── 1. Mal kabul ──────────────────────────────────────────────────────────

  describe('Kabul kriteri 1 — mal kabul lot/SKT/maliyet ile stok artırır', () => {
    itDb('mal kabul hareketi parti açar, bakiyeyi artırır ve maliyeti kaydeder', async () => {
      const product = await createTestProduct();
      const expiresAt = new Date(Date.now() + 120 * 24 * 3600 * 1000).toISOString();
      const receipt = (await postReceipt(veterinerToken, {
        warehouseId: merkezWarehouseId,
        note: 'e2e mal kabul',
        lines: [
          { productId: product.id, lotCode: `LOT-${runId}-1`, expiresAt, unitCost: 12.5, qty: 20 },
        ],
      })) as {
        id: string;
        kind: string;
        lines: { lotId: string; qty: string; unitCost: string; productId: string }[];
      };
      expect(receipt.kind).toBe('goods_receipt');
      expect(receipt.lines).toHaveLength(1);
      expect(receipt.lines[0]!.qty).toBe('20');
      expect(receipt.lines[0]!.unitCost).toBe('12.5');

      const lot = await prisma.inventoryLot.findUnique({
        where: { id: receipt.lines[0]!.lotId },
      });
      expect(lot).not.toBeNull();
      expect(lot!.expiresAt!.toISOString()).toBe(new Date(expiresAt).toISOString());
      expect(lot!.unitCost.toNumber()).toBe(12.5);

      expect(await balanceFor(product.id, lot!.id)).toBe(20);
    });

    itDb('aynı lot kodu + SKT + maliyet tekrar gelirse mevcut partiye eklenir', async () => {
      const product = await createTestProduct();
      const expiresAt = new Date(Date.now() + 100 * 24 * 3600 * 1000).toISOString();
      await postReceipt(veterinerToken, {
        warehouseId: merkezWarehouseId,
        lines: [{ productId: product.id, lotCode: 'MERGE-1', expiresAt, unitCost: 8, qty: 10 }],
      });
      await postReceipt(veterinerToken, {
        warehouseId: merkezWarehouseId,
        lines: [{ productId: product.id, lotCode: 'MERGE-1', expiresAt, unitCost: 8, qty: 5 }],
      });
      const lots = await prisma.inventoryLot.findMany({
        where: { productId: product.id, lotCode: 'MERGE-1' },
      });
      expect(lots).toHaveLength(1);
      expect(await balanceFor(product.id, lots[0]!.id)).toBe(15);
    });

    itDb('aynı lot kodu farklı SKT/maliyet ile gelirse LOT_CONFLICT döner', async () => {
      const product = await createTestProduct();
      const expiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
      await postReceipt(veterinerToken, {
        warehouseId: merkezWarehouseId,
        lines: [{ productId: product.id, lotCode: 'CONF-1', expiresAt, unitCost: 8, qty: 10 }],
      });
      const res = await request(app.getHttpServer())
        .post('/api/v1/stock/receipts')
        .set(authHeader(veterinerToken))
        .send({
          warehouseId: merkezWarehouseId,
          lines: [
            {
              productId: product.id,
              lotCode: 'CONF-1',
              expiresAt: new Date(Date.now() + 300 * 24 * 3600 * 1000).toISOString(),
              unitCost: 9,
              qty: 5,
            },
          ],
        });
      expect(res.status).toBe(409);
      expect((res.body as ApiErrorBody).code).toBe('LOT_CONFLICT');
    });
  });

  // ── 2. Mutabakat ──────────────────────────────────────────────────────────

  describe('Kabul kriteri 2 — lot bazlı bakiyeler defterle mutabık', () => {
    itDb('her parti için SUM(defter satırları) == bakiye', async () => {
      const product = await createTestProduct();
      const expiresAt = new Date(Date.now() + 80 * 24 * 3600 * 1000).toISOString();
      const receipt = (await postReceipt(veterinerToken, {
        warehouseId: merkezWarehouseId,
        lines: [{ productId: product.id, lotCode: 'RECON-1', expiresAt, unitCost: 5, qty: 30 }],
      })) as { lines: { lotId: string }[] };
      const lotId = receipt.lines[0]!.lotId;
      // Çıkış: 12 → beklenen bakiye 18
      await postConsumption(veterinerToken, {
        warehouseId: merkezWarehouseId,
        lines: [{ productId: product.id, lotId, qty: 12 }],
      });

      const agg = await prisma.stockMovementLine.aggregate({
        where: { productId: product.id, lotId },
        _sum: { qty: true },
      });
      const ledgerSum = agg._sum.qty?.toNumber() ?? 0;
      const balance = await balanceFor(product.id, lotId);
      expect(ledgerSum).toBe(30 - 12);
      expect(balance).toBe(ledgerSum);
    });
  });

  // ── 3. Bloklu partiler ────────────────────────────────────────────────────

  describe('Kabul kriteri 3 — expired/karantina parti tüketim için seçilemez', () => {
    itDb('süresi geçmiş partiye açık tüketim isteği LOT_BLOCKED döner', async () => {
      const product = await createTestProduct();
      const expiredAt = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();
      const receipt = (await postReceipt(veterinerToken, {
        warehouseId: merkezWarehouseId,
        lines: [{ productId: product.id, lotCode: 'EXP-1', expiresAt: expiredAt, unitCost: 4, qty: 10 }],
      })) as { lines: { lotId: string }[] };
      const res = await postConsumption(
        veterinerToken,
        { warehouseId: merkezWarehouseId, lines: [{ productId: product.id, lotId: receipt.lines[0]!.lotId, qty: 1 }] },
        409,
      );
      expect((res.body as ApiErrorBody).code).toBe('LOT_BLOCKED');
    });

    itDb('karantina partisi tüketilemez', async () => {
      const product = await createTestProduct();
      const receipt = (await postReceipt(veterinerToken, {
        warehouseId: merkezWarehouseId,
        lines: [
          {
            productId: product.id,
            lotCode: 'QRT-1',
            expiresAt: new Date(Date.now() + 50 * 24 * 3600 * 1000).toISOString(),
            unitCost: 4,
            qty: 10,
          },
        ],
      })) as { lines: { lotId: string }[] };
      const lotId = receipt.lines[0]!.lotId;
      await prisma.inventoryLot.update({ where: { id: lotId }, data: { status: 'quarantined' } });
      const res = await postConsumption(
        veterinerToken,
        { warehouseId: merkezWarehouseId, lines: [{ productId: product.id, lotId, qty: 1 }] },
        409,
      );
      expect((res.body as ApiErrorBody).code).toBe('LOT_BLOCKED');
    });

    itDb('FEFO parti listesi bloklu partileri içermez; FEFO tahsis blokluyu atlar', async () => {
      // Self-contained küme: süresi geçmiş + yakın SKT + uzak SKT partileri
      const product = await createTestProduct();
      const receipt = (await postReceipt(veterinerToken, {
        warehouseId: merkezWarehouseId,
        lines: [
          { productId: product.id, lotCode: 'FEFO-EXP', expiresAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(), unitCost: 1, qty: 20 },
          { productId: product.id, lotCode: 'FEFO-OK', expiresAt: new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString(), unitCost: 2, qty: 5 },
          { productId: product.id, lotCode: 'FEFO-FAR', expiresAt: new Date(Date.now() + 200 * 24 * 3600 * 1000).toISOString(), unitCost: 3, qty: 10 },
        ],
      })) as { lines: { lotId: string; lot: { lotCode: string } | null }[] };
      const lotByCode = new Map(
        receipt.lines.map((l) => [l.lot?.lotCode ?? '', l.lotId] as const),
      );

      const lotsRes = await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}/lots?warehouseId=${merkezWarehouseId}`)
        .set(authHeader(veterinerToken));
      expect(lotsRes.status).toBe(200);
      const selectable = (lotsRes.body as { items: { lotCode: string; blockReason: string | null }[] }).items;
      expect(selectable.some((l) => l.lotCode === 'FEFO-EXP')).toBe(false);
      expect(selectable[0]!.lotCode).toBe('FEFO-OK');

      // Bloklu partiler includeBlocked ile görünür ve gerekçe taşınır
      const allRes = await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}/lots?warehouseId=${merkezWarehouseId}&includeBlocked=true`)
        .set(authHeader(veterinerToken));
      const all = (allRes.body as { items: { lotCode: string; blockReason: string | null }[] }).items;
      expect(all.find((l) => l.lotCode === 'FEFO-EXP')?.blockReason).toBe('expired');

      // FEFO otomatik tahsis: 12 birim → FEFO-OK 5 + FEFO-FAR 7; bloklu parti dokunulmaz
      const movement = await postConsumption(veterinerToken, {
        warehouseId: merkezWarehouseId,
        note: 'FEFO otomatik',
        lines: [{ productId: product.id, qty: 12 }],
      });
      expect(movement.status).toBe(201);
      const lines = (movement.body as { lines: { lotId: string | null; qty: string }[] }).lines;
      expect(Number(lines[0]!.qty)).toBe(-5);
      expect(lines[0]!.lotId).toBe(lotByCode.get('FEFO-OK'));
      expect(Number(lines[1]!.qty)).toBe(-7);
      expect(lines[1]!.lotId).toBe(lotByCode.get('FEFO-FAR'));
      expect(await balanceFor(product.id, lotByCode.get('FEFO-EXP'))).toBe(20);
      expect(await balanceFor(product.id, lotByCode.get('FEFO-OK'))).toBe(0);
      expect(await balanceFor(product.id, lotByCode.get('FEFO-FAR'))).toBe(3);
    });
  });

  // ── 4. Transfer ───────────────────────────────────────────────────────────

  describe('Kabul kriteri 4 — transfer dispatch → yolda, receive → hedef stok artışı', () => {
    itDb('iki aşamalı transfer: kaynak düşer, yolda görünür, hedef artar', async () => {
      const product = await createTestProduct();
      const receipt = (await postReceipt(veterinerToken, {
        warehouseId: merkezWarehouseId,
        lines: [
          {
            productId: product.id,
            lotCode: 'TRF-LOT-1',
            expiresAt: new Date(Date.now() + 70 * 24 * 3600 * 1000).toISOString(),
            unitCost: 6,
            qty: 25,
          },
        ],
      })) as { lines: { lotId: string }[] };
      const lotId = receipt.lines[0]!.lotId;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/stock/transfers')
        .set(authHeader(veterinerToken))
        .send({
          fromWarehouseId: merkezWarehouseId,
          toWarehouseId: sube2WarehouseId,
          note: 'e2e transfer',
          lines: [{ productId: product.id, lotId, qty: 10 }],
        });
      expect(createRes.status).toBe(201);
      const transfer = createRes.body as { id: string; status: string; code: string };
      created.transferIds.push(transfer.id);
      expect(transfer.status).toBe('draft');

      // Kaynak şube yetkilisi (veteriner MRKZ) sevk eder
      const dispatchRes = await request(app.getHttpServer())
        .patch(`/api/v1/stock/transfers/${transfer.id}/dispatch`)
        .set(authHeader(veterinerToken));
      expect(dispatchRes.status).toBe(200);
      expect((dispatchRes.body as { status: string }).status).toBe('dispatched');

      // Kaynak bakiye düştü, yoldaki miktar transfer kaydında görünür
      expect(await balanceFor(product.id, lotId)).toBe(15);
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/stock/transfers?status=dispatched')
        .set(authHeader(adminToken));
      const dispatched = (listRes.body as {
        items: { id: string; lines: { qty: string; lotId: string | null }[] }[];
      }).items.find((t) => t.id === transfer.id);
      expect(dispatched).toBeDefined();
      expect(Number(dispatched!.lines[0]!.qty)).toBe(10);

      // Hedef şube yetkilisi (stok SUB2) teslim alır → hedef depoda yeni parti
      const receiveRes = await request(app.getHttpServer())
        .patch(`/api/v1/stock/transfers/${transfer.id}/receive`)
        .set(authHeader(stokToken));
      expect(receiveRes.status).toBe(200);
      expect((receiveRes.body as { status: string }).status).toBe('received');

      const targetBalance = await prisma.stockBalance.findFirst({
        where: { productId: product.id, warehouseId: sube2WarehouseId },
      });
      expect(targetBalance!.qtyOnHand.toNumber()).toBe(10);
      const receivedLot = await prisma.inventoryLot.findFirst({
        where: { productId: product.id, warehouseId: sube2WarehouseId, lotCode: 'TRF-LOT-1' },
      });
      expect(receivedLot).not.toBeNull();
      expect(receivedLot!.unitCost.toNumber()).toBe(6);
      // Kaynak defterde transfer_out, hedefte transfer_in
      const outCount = await prisma.stockMovement.count({
        where: { refType: 'StockTransfer', refId: transfer.id, kind: 'transfer_out' },
      });
      const inCount = await prisma.stockMovement.count({
        where: { refType: 'StockTransfer', refId: transfer.id, kind: 'transfer_in' },
      });
      expect(outCount).toBe(1);
      expect(inCount).toBe(1);
    });
  });

  // ── 5. Sayım ──────────────────────────────────────────────────────────────

  describe('Kabul kriteri 5 — sayım düzeltmesi gerekçe ve denetim gerektirir', () => {
    itDb('gerekçesiz tamamlama reddedilir; gerekçeyle fark adjustment + denetim üretir', async () => {
      const product = await createTestProduct();
      const receipt = (await postReceipt(veterinerToken, {
        warehouseId: merkezWarehouseId,
        lines: [
          {
            productId: product.id,
            lotCode: 'SAY-LOT-1',
            expiresAt: new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString(),
            unitCost: 3,
            qty: 40,
          },
        ],
      })) as { lines: { lotId: string }[] };
      const lotId = receipt.lines[0]!.lotId;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/stock/counts')
        .set(authHeader(adminToken))
        .send({ warehouseId: merkezWarehouseId });
      expect(createRes.status).toBe(201);
      const count = createRes.body as {
        id: string;
        status: string;
        code: string;
        lines: { id: string; productId: string; lotId: string | null; expectedQty: string }[];
      };
      created.countIds.push(count.id);
      expect(count.status).toBe('draft');
      const line = count.lines.find((l) => l.productId === product.id);
      expect(line).toBeDefined();
      expect(Number(line!.expectedQty)).toBe(40);

      // Boşluk gerekçe DTO'yu geçer ama servis düzeyi kontrol COUNT_REASON_REQUIRED verir
      const noReason = await request(app.getHttpServer())
        .post(`/api/v1/stock/counts/${count.id}/complete`)
        .set(authHeader(adminToken))
        .send({ reason: '   ' });
      expect(noReason.status).toBe(400);
      expect((noReason.body as ApiErrorBody).code).toBe('COUNT_REASON_REQUIRED');

      // 37 sayıldı → fark -3 → adjustment
      const lineUpdate = await request(app.getHttpServer())
        .patch(`/api/v1/stock/counts/${count.id}/lines`)
        .set(authHeader(adminToken))
        .send({ lines: [{ lineId: line!.id, countedQty: 37 }] });
      expect(lineUpdate.status).toBe(200);

      const completeRes = await request(app.getHttpServer())
        .post(`/api/v1/stock/counts/${count.id}/complete`)
        .set(authHeader(adminToken))
        .send({ reason: 'Kırık şişe tespit edildi (e2e)' });
      expect(completeRes.status).toBe(201);
      expect((completeRes.body as { status: string }).status).toBe('completed');

      expect(await balanceFor(product.id, lotId)).toBe(37);
      const adjustment = await prisma.stockMovement.findFirst({
        where: {
          refType: 'StockCount',
          refId: count.id,
          kind: 'adjustment',
        },
        include: { lines: true },
      });
      expect(adjustment).not.toBeNull();
      expect(adjustment!.reason).toBe('Kırık şişe tespit edildi (e2e)');
      expect(adjustment!.lines[0]!.qty.toNumber()).toBe(-3);

      const audit = await prisma.auditEvent.findFirst({
        where: { action: 'STOCK_COUNT_COMPLETED', entityId: count.id },
      });
      expect(audit).not.toBeNull();
    });
  });

  // ── 6. Eş zamanlı tüketim ─────────────────────────────────────────────────

  describe('Kabul kriteri 6 — eş zamanlı iki tüketimde negatif stok oluşmaz', () => {
    itDb('tek partide 8 birim: iki paralel 5 birim tüketimden biri başarılı biri 409', async () => {
      const product = await createTestProduct();
      const receipt = (await postReceipt(veterinerToken, {
        warehouseId: merkezWarehouseId,
        lines: [
          {
            productId: product.id,
            lotCode: 'CONC-LOT-1',
            expiresAt: new Date(Date.now() + 40 * 24 * 3600 * 1000).toISOString(),
            unitCost: 2,
            qty: 8,
          },
        ],
      })) as { lines: { lotId: string }[] };
      const lotId = receipt.lines[0]!.lotId;

      const body = {
        warehouseId: merkezWarehouseId,
        note: 'paralel tüketim',
        lines: [{ productId: product.id, lotId, qty: 5 }],
      };
      const [r1, r2] = await Promise.all([
        postConsumption(veterinerToken, body, 0),
        postConsumption(veterinerToken, body, 0),
      ]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 409]);
      const failed = [r1, r2].find((r) => r.status === 409)!;
      expect((failed.body as ApiErrorBody).code).toBe('INSUFFICIENT_STOCK');

      expect(await balanceFor(product.id, lotId)).toBe(3);
      const agg = await prisma.stockMovementLine.aggregate({
        where: { productId: product.id, lotId },
        _sum: { qty: true },
      });
      expect(agg._sum.qty!.toNumber()).toBe(3);
    });
  });

  // ── 7. Append-only defter ─────────────────────────────────────────────────

  describe('Kabul kriteri 7 — defter kaydı güncellenemez/silinemez', () => {
    itDb('API düzeyinde hareket güncelleme/silme ucu yoktur (404)', async () => {
      const product = await createTestProduct();
      const receipt = (await postReceipt(veterinerToken, {
        warehouseId: merkezWarehouseId,
        lines: [
          {
            productId: product.id,
            lotCode: 'APP-LOT-1',
            expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
            unitCost: 1,
            qty: 5,
          },
        ],
      })) as { id: string };
      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/stock/movements/${receipt.id}`)
        .set(authHeader(adminToken))
        .send({ note: 'değiştirme denemesi' });
      expect(patchRes.status).toBe(404);
      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/stock/movements/${receipt.id}`)
        .set(authHeader(adminToken));
      expect(deleteRes.status).toBe(404);
    });

    itDb('veritabanı tetikleyicisi doğrudan update/delete girişimini bloklar', async () => {
      const product = await createTestProduct();
      const receipt = (await postReceipt(veterinerToken, {
        warehouseId: merkezWarehouseId,
        lines: [
          {
            productId: product.id,
            lotCode: 'APP-LOT-2',
            expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
            unitCost: 1,
            qty: 5,
          },
        ],
      })) as { id: string };
      let updateFailed = false;
      try {
        await prisma.stockMovement.update({
          where: { id: receipt.id },
          data: { note: 'yasak' },
        });
      } catch {
        updateFailed = true;
      }
      expect(updateFailed).toBe(true);
      let deleteFailed = false;
      try {
        await prisma.stockMovement.delete({ where: { id: receipt.id } });
      } catch {
        deleteFailed = true;
      }
      expect(deleteFailed).toBe(true);
      // Satır düzeyi koruma
      const line = await prisma.stockMovementLine.findFirst({
        where: { movementId: receipt.id },
      });
      let lineDeleteFailed = false;
      try {
        await prisma.stockMovementLine.delete({ where: { id: line!.id } });
      } catch {
        lineDeleteFailed = true;
      }
      expect(lineDeleteFailed).toBe(true);
    });
  });

  // ── Yetki ve şube kapsamı ─────────────────────────────────────────────────

  describe('Yetki ve şube kapsamı (API düzeyi)', () => {
    itDb('inventory.receive izni olmayan resepsiyon mal kabul yapamaz (403)', async () => {
      const product = await createTestProduct();
      const res = await request(app.getHttpServer())
        .post('/api/v1/stock/receipts')
        .set(authHeader(resepsiyonToken))
        .send({
          warehouseId: merkezWarehouseId,
          lines: [{ productId: product.id, lotCode: 'X', qty: 1 }],
        });
      expect(res.status).toBe(403);
    });

    itDb('şube kapsamı dışı depoya tüketim isteği 403 döner', async () => {
      const product = await createTestProduct();
      // veteriner yalnız MRKZ erişimli; SUB2 deposu kapsam dışı
      const res = await postConsumption(
        veterinerToken,
        { warehouseId: sube2WarehouseId, lines: [{ productId: product.id, qty: 1 }] },
        403,
      );
      expect((res.body as ApiErrorBody).code).toBe('BRANCH_SCOPE');
    });

    itDb('stok rolü kendi şubesinde mal kabul + tüketim yapabilir (pozitif)', async () => {
      // stok rolü: SUB2 kapsamlı; ürünü kendi şubesinde kabul edip tüketir
      const product = await createTestProduct({ trackingType: 'none', minStock: 1 });
      await postReceipt(stokToken, {
        warehouseId: sube2WarehouseId,
        lines: [{ productId: product.id, qty: 10, unitCost: 3 }],
      });
      const res = await postConsumption(
        stokToken,
        { warehouseId: sube2WarehouseId, lines: [{ productId: product.id, qty: 2 }] },
        201,
      );
      expect(res.status).toBe(201);
      const balance = await prisma.stockBalance.findFirst({
        where: { productId: product.id, warehouseId: sube2WarehouseId, lotId: null },
      });
      expect(balance!.qtyOnHand.toNumber()).toBe(8);
    });
  });
});
