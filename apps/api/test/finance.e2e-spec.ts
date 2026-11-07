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
 * Faz 09 API E2E — kasa, tahsilat, cari hesap ve gider kabul kriterleri,
 * gerçek veritabanı ve guard zinciriyle doğulanır:
 * 1. Kısmi ödeme ve dağıtım doğru bakiye üretir (Decimal kuruş hassasiyeti).
 * 2. Aynı idempotency key ile tekrar tahsilat REPLAY döner — çift kayıt yok.
 * 3. İade orijinal tahsilata bağlıdır ve REFUND_CREATED denetimi üretir.
 * 4. Kasa kapanışta fark hesaplanır; fark ≠ 0 iken açıklama zorunludur.
 * 5. Cari ekstre charge/payment/refund ilişkisini koşan bakiyeyle gösterir.
 * 6. finance.refund izni olmayan kullanıcı iade yapamaz (403).
 * 7. Money Decimal(12,2) — 0.1 + 0.2 türü kuruş kayması imkânsız.
 * Ayrıca: kasa başına tek açık oturum (409), kapalı oturuma hareket yazılamaz,
 * nakit gider oturum ister, tedarikçi borcu kısmi ödeme ile kapanır.
 *
 * Ön koşul: gömülü PostgreSQL + migrate + seed (scripts/f09-api-e2e.sh).
 * Test kendi verisini oluşturur; temizlik session_replication_role baypasıyla.
 */

const DEMO_PASSWORD = 'VetCore2026!';

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

describe('Faz 09 — kasa, tahsilat, cari hesap ve gider (API kabul kriterleri)', () => {
  let app: INestApplication;
  let adminToken: string;
  let veterinerToken: string;
  let merkezBranchId: string;
  let registerId: string;
  let ownerId = '';
  let noRefundToken = '';

  const created = {
    ownerIds: [] as string[],
    chargeIds: [] as string[],
    paymentIds: [] as string[],
    refundIds: [] as string[],
    sessionIds: [] as string[],
    movementIds: [] as string[],
    expenseIds: [] as string[],
    payableIds: [] as string[],
    roleIds: [] as string[],
    staffIds: [] as string[],
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
    const register = await prisma.cashRegister.findFirst({
      where: { clinicId: clinic.id, branchId: merkezBranchId },
    });
    registerId = register?.id ?? '';
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
          await tx.cashMovement.deleteMany({ where: { sessionId: { in: created.sessionIds } } });
          await tx.paymentAllocation.deleteMany({ where: { chargeId: { in: created.chargeIds } } });
          await tx.refund.deleteMany({ where: { id: { in: created.refundIds } } });
          await tx.payment.deleteMany({ where: { id: { in: created.paymentIds } } });
          await tx.cashSession.deleteMany({ where: { id: { in: created.sessionIds } } });
          await tx.expense.deleteMany({ where: { id: { in: created.expenseIds } } });
          await tx.supplierPayable.deleteMany({ where: { id: { in: created.payableIds } } });
          await tx.charge.deleteMany({ where: { id: { in: created.chargeIds } } });
          if (created.staffIds.length > 0) {
            await tx.staffBranch.deleteMany({ where: { staffId: { in: created.staffIds } } });
            await tx.staffRole.deleteMany({ where: { staffId: { in: created.staffIds } } });
            await tx.session.deleteMany({ where: { staffId: { in: created.staffIds } } });
            await tx.staff.deleteMany({ where: { id: { in: created.staffIds } } });
          }
          if (created.roleIds.length > 0) {
            await tx.rolePermission.deleteMany({ where: { roleId: { in: created.roleIds } } });
            await tx.role.deleteMany({ where: { id: { in: created.roleIds } } });
          }
          await tx.auditEvent.deleteMany({
            where: {
              OR: [
                { entityType: 'Payment', entityId: { in: created.paymentIds } },
                { entityType: 'Refund', entityId: { in: created.refundIds } },
                { entityType: 'CashSession', entityId: { in: created.sessionIds } },
                { entityType: 'CashMovement', entityId: { in: created.movementIds } },
                { entityType: 'Expense', entityId: { in: created.expenseIds } },
                { entityType: 'SupplierPayable', entityId: { in: created.payableIds } },
              ],
            },
          });
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

  // ---- Test verisi ----

  itDb('kurulum: sahip ve iki açık ücret oluşturulur (450.00 + 1234.56)', async () => {
    const prisma = new (await import('@prisma/client')).PrismaClient();
    const owner = await prisma.owner.create({
      data: {
        clinicId: (await prisma.clinic.findUniqueOrThrow({ where: { slug: 'vetcore-demo' } })).id,
        firstName: 'Faz09',
        lastName: `TestSahibi-${Date.now().toString(36)}`,
      },
    });
    ownerId = owner.id;
    created.ownerIds.push(owner.id);

    const charge1 = await prisma.charge.create({
      data: {
        clinicId: owner.clinicId,
        branchId: merkezBranchId,
        ownerId: owner.id,
        total: '450.00',
        status: 'open',
      },
    });
    created.chargeIds.push(charge1.id);
    const charge2 = await prisma.charge.create({
      data: {
        clinicId: owner.clinicId,
        branchId: merkezBranchId,
        ownerId: owner.id,
        total: '1234.56',
        status: 'open',
      },
    });
    created.chargeIds.push(charge2.id);
    await prisma.$disconnect();
    expect(created.chargeIds).toHaveLength(2);
  });

  // ---- Kabul kriteri 1: kısmi ödeme + dağıtım bakiyesi ----

  itDb('K1 kısmi ödeme: 400.00 FIFO dağıtım → ücret kısmen kapansın, bakiye doğru', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/finance/payments')
      .set(authHeader(adminToken))
      .send({ ownerId, method: 'cash', amount: '400.00', note: 'kısmi tahsilat' });
    expect(res.status).toBe(201);
    const body = res.body as {
      payment: {
        id: string;
        allocations: Array<{ chargeId: string; amount: string; chargeStatus: string }>;
      };
    };
    created.paymentIds.push(body.payment.id);
    // FIFO: eski ücret (450) ilk hedef → 400 dağıtılır, 50 kalan
    expect(body.payment.allocations).toHaveLength(1);
    expect(body.payment.allocations[0]?.amount).toBe('400.00');
    expect(body.payment.allocations[0]?.chargeStatus).toBe('partial');

    const charges = await request(app.getHttpServer())
      .get(`/api/v1/finance/charges?ownerId=${ownerId}`)
      .set(authHeader(adminToken));
    expect(charges.status).toBe(200);
    const items = (charges.body as { items: Array<{ balance: string; status: string }> }).items;
    const eski = items.find((c) => c.status === 'partial');
    expect(eski?.balance).toBe('50.00');
  });

  itDb('K1 dağıtım devamı: 1750.00 → kalan ücretler tam kapansın (450→50 + 1234.56, artan 465.44 ileri kredi)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/finance/payments')
      .set(authHeader(adminToken))
      .send({ ownerId, method: 'card', amount: '1750.00' });
    expect(res.status).toBe(201);
    const body = res.body as {
      payment: { id: string; allocations: Array<{ amount: string; chargeStatus: string }> };
    };
    created.paymentIds.push(body.payment.id);
    // 50.00 (eski) + 1234.56 (yeni) dağıtılır; 465.44 dağıtılmaz kalır
    expect(body.payment.allocations).toHaveLength(2);
    const amounts = body.payment.allocations.map((a) => a.amount).sort();
    expect(amounts).toEqual(['1234.56', '50.00']);

    const charges = await request(app.getHttpServer())
      .get(`/api/v1/finance/charges?ownerId=${ownerId}`)
      .set(authHeader(adminToken));
    const items = (charges.body as { items: Array<{ balance: string; status: string }> }).items;
    expect(items.every((c) => c.status === 'paid')).toBe(true);
    expect(items.every((c) => c.balance === '0.00')).toBe(true);
  });

  // ---- Kabul kriteri 7: Decimal hassasiyeti ----

  itDb('K7 Decimal hassasiyeti: 0.10 + 0.20 ödeme kuruş kayması üretmez', async () => {
    const owner2 = await request(app.getHttpServer())
      .post('/api/v1/owners')
      .set(authHeader(adminToken))
      .send({ firstName: 'Faz09', lastName: `Decimal-${Date.now().toString(36)}`, contacts: [] });
    expect(owner2.status).toBe(201);
    const ownerId2 = (owner2.body as { id: string }).id;
    created.ownerIds.push(ownerId2);

    const prisma = new (await import('@prisma/client')).PrismaClient();
    const charge = await prisma.charge.create({
      data: {
        clinicId: (await prisma.clinic.findUniqueOrThrow({ where: { slug: 'vetcore-demo' } })).id,
        branchId: merkezBranchId,
        ownerId: ownerId2,
        total: '1234.56',
        status: 'open',
      },
    });
    created.chargeIds.push(charge.id);
    await prisma.$disconnect();

    const res = await request(app.getHttpServer())
      .post('/api/v1/finance/payments')
      .set(authHeader(adminToken))
      .send({ ownerId: ownerId2, method: 'other', amount: '1234.55' });
    expect(res.status).toBe(201);
    const body = res.body as { payment: { id: string } };
    created.paymentIds.push(body.payment.id);

    const statement = await request(app.getHttpServer())
      .get(`/api/v1/finance/owners/${ownerId2}/statement`)
      .set(authHeader(adminToken));
    const data = statement.body as { closingBalance: string };
    // 1234.56 − 1234.55 = 0.01 (float toplamında 0.009999999999990905 olurdu)
    expect(data.closingBalance).toBe('0.01');
  });

  // ---- Kabul kriteri 2: idempotency ----

  itDb('K2 idempotency: aynı anahtar REPLAY döner, çift tahsilat oluşmaz', async () => {
    const key = `f09e2e-key-${Date.now().toString(36)}`;
    const first = await request(app.getHttpServer())
      .post('/api/v1/finance/payments')
      .set(authHeader(adminToken))
      .send({ ownerId, method: 'cash', amount: '10.00', idempotencyKey: key });
    expect(first.status).toBe(201);
    const firstBody = first.body as { payment: { id: string }; replayed: boolean };
    created.paymentIds.push(firstBody.payment.id);
    expect(firstBody.replayed).toBe(false);

    const second = await request(app.getHttpServer())
      .post('/api/v1/finance/payments')
      .set(authHeader(adminToken))
      .send({ ownerId, method: 'cash', amount: '10.00', idempotencyKey: key });
    expect(second.status).toBe(201);
    const secondBody = second.body as { payment: { id: string }; replayed: boolean };
    expect(secondBody.replayed).toBe(true);
    expect(secondBody.payment.id).toBe(firstBody.payment.id);

    // Toplam tahsilat sayısı artmadı
    const list = await request(app.getHttpServer())
      .get(`/api/v1/finance/payments?ownerId=${ownerId}`)
      .set(authHeader(adminToken));
    const payments = (list.body as { items: Array<{ id: string }> }).items;
    expect(payments.filter((p) => p.id === firstBody.payment.id)).toHaveLength(1);
  });

  // ---- Kabul kriteri 6: finance.refund yetkisi ----

  itDb('K6 yetkisiz kullanıcı: finance.refund izni olmadan iade 403', async () => {
    const payments = await request(app.getHttpServer())
      .get(`/api/v1/finance/payments?ownerId=${ownerId}`)
      .set(authHeader(adminToken));
    const target = (payments.body as { items: Array<{ id: string; amount: string }> }).items.find(
      (p) => p.amount === '10.00',
    );
    expect(target).toBeDefined();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/finance/payments/${target?.id}/refund`)
      .set(authHeader(veterinerToken))
      .send({ method: 'cash', amount: '5.00', reason: 'yetkisiz iade denemesi' });
    expect(res.status).toBe(403);
    // Guard mesajı eksik izni adlandırır (finance.refund)
    expect((res.body as { message?: string }).message ?? '').toContain('finance.refund');
  });

  itDb('K6 özel rol: finance.pay olan resepsiyon (finance.refund yok) iade yapamaz — 403', async () => {
    // veterinerToken K6 testinde 403 kanıtını üretti (hiç finance izni yok);
    // burada ikinci bağımsız kanıt: tahsilat alabilen ama iade edemeyen rol.
    const resepsiyonToken = await login(app, 'resepsiyon@vetcore-demo.example');
    const payments = await request(app.getHttpServer())
      .get(`/api/v1/finance/payments?ownerId=${ownerId}`)
      .set(authHeader(adminToken));
    const target = (payments.body as { items: Array<{ id: string }> }).items[0];
    const res = await request(app.getHttpServer())
      .post(`/api/v1/finance/payments/${target?.id}/refund`)
      .set(authHeader(resepsiyonToken))
      .send({ method: 'cash', amount: '1.00', reason: 'iade denemesi' });
    expect(res.status).toBe(403);
  });

  // ---- Kabul kriteri 3: iade bağlantısı + denetim ----

  itDb('K3 iade: orijinal tahsilata bağlı, tutar sınırlı ve REFUND_CREATED denetimi üretir', async () => {
    const payments = await request(app.getHttpServer())
      .get(`/api/v1/finance/payments?ownerId=${ownerId}`)
      .set(authHeader(adminToken));
    const target = (payments.body as { items: Array<{ id: string; amount: string }> }).items.find(
      (p) => p.amount === '10.00',
    );
    expect(target).toBeDefined();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/finance/payments/${target?.id}/refund`)
      .set(authHeader(adminToken))
      .send({ method: 'cash', amount: '4.00', reason: 'hizmet iptali — test iadesi' });
    expect(res.status).toBe(201);
    const body = res.body as {
      refund: { id: string };
      payment: { refunds: Array<{ id: string; amount: string }>; refundable: string; refunded: string };
    };
    created.refundIds.push(body.refund.id);
    expect(body.payment.refunds).toHaveLength(1);
    expect(body.payment.refunded).toBe('4.00');
    expect(body.payment.refundable).toBe('6.00');

    // İade toplamı kalanı aşamaz → 400
    const over = await request(app.getHttpServer())
      .post(`/api/v1/finance/payments/${target?.id}/refund`)
      .set(authHeader(adminToken))
      .send({ method: 'cash', amount: '99.00', reason: 'aşım denemesi' });
    expect(over.status).toBe(400);

    // Denetim kaydı
    const prisma = new (await import('@prisma/client')).PrismaClient();
    const audit = await prisma.auditEvent.findFirst({
      where: { entityType: 'Refund', entityId: body.refund.id, action: 'REFUND_CREATED' },
    });
    await prisma.$disconnect();
    expect(audit).not.toBeNull();
  });

  // ---- Kabul kriteri 5: cari ekstre ----

  itDb('K5 cari ekstre: charge(+), payment(−), refund(+) satırları ve koşan bakiye', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/finance/owners/${ownerId}/statement`)
      .set(authHeader(adminToken));
    expect(res.status).toBe(200);
    const body = res.body as {
      rows: Array<{ kind: string; direction: string; runningBalance: string }>;
      closingBalance: string;
    };
    const kinds = body.rows.map((row) => row.kind);
    expect(kinds).toContain('charge');
    expect(kinds).toContain('payment');
    expect(kinds).toContain('refund');
    // charges: 450 + 1234.56 = 1684.56; payments: 400 + 1750 + 10 = 2160; refunds: 4
    // bakiye = 1684.56 − 2160 + 4 = −471.44 (ileri kredi)
    expect(body.closingBalance).toBe('-471.44');
    // Bakiye satırları kronolojik koşar
    const last = body.rows[body.rows.length - 1];
    expect(last?.runningBalance).toBe(body.closingBalance);
  });

  // ---- Kabul kriteri 4: kasa oturumu ve kapanış farkı ----

  itDb('K4 kasa: açılış + nakit tahsilat hareketi + tek açık oturum kuralı (409)', async () => {
    expect(registerId).not.toBe('');
    const open = await request(app.getHttpServer())
      .post('/api/v1/cash/sessions/open')
      .set(authHeader(adminToken))
      .send({ registerId, openingFloat: '500.00' });
    expect(open.status).toBe(201);
    const session = (open.body as { id: string }).id;
    created.sessionIds.push(session);

    // Aynı kasaya ikinci açık oturum → 409
    const again = await request(app.getHttpServer())
      .post('/api/v1/cash/sessions/open')
      .set(authHeader(adminToken))
      .send({ registerId, openingFloat: '500.00' });
    expect(again.status).toBe(409);

    // Nakit tahsilat oturuma bağlanır → giriş hareketi
    const pay = await request(app.getHttpServer())
      .post('/api/v1/finance/payments')
      .set(authHeader(adminToken))
      .send({
        ownerId,
        method: 'cash',
        amount: '100.00',
        cashSessionId: session,
        note: 'kasa tahsilatı',
      });
    expect(pay.status).toBe(201);
    created.paymentIds.push((pay.body as { payment: { id: string } }).payment.id);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/cash/sessions/${session}`)
      .set(authHeader(adminToken));
    const data = detail.body as {
      live: { expected: string; cashIn: string };
      movements: Array<{ sourceType: string; direction: string }>;
    };
    expect(data.live.cashIn).toBe('100.00');
    expect(data.live.expected).toBe('600.00'); // 500 açılış + 100 giriş
    expect(data.movements.some((m) => m.sourceType === 'payment' && m.direction === 'in')).toBe(
      true,
    );
  });

  itDb('K4 kapanış: fark ≠ 0 iken açıklama zorunlu (400), gerekli alanla kapanır ve fark saklanır', async () => {
    const sessions = await request(app.getHttpServer())
      .get('/api/v1/cash/sessions?status=open')
      .set(authHeader(adminToken));
    const openSession = (sessions.body as { items: Array<{ id: string; register: { id: string } }> })
      .items.find((s) => s.register.id === registerId);
    expect(openSession).toBeDefined();
    const sessionId = openSession?.id ?? '';

    // Açıklama olmadan yanlış sayım → 400 CASH_DIFFERENCE_NOTE_REQUIRED
    const noNote = await request(app.getHttpServer())
      .post(`/api/v1/cash/sessions/${sessionId}/close`)
      .set(authHeader(adminToken))
      .send({ countedTotal: '590.00' });
    expect(noNote.status).toBe(400);
    expect((noNote.body as { code?: string }).code).toBe('CASH_DIFFERENCE_NOTE_REQUIRED');

    // Açıklama ile → fark −10.00 saklanır
    const closed = await request(app.getHttpServer())
      .post(`/api/v1/cash/sessions/${sessionId}/close`)
      .set(authHeader(adminToken))
      .send({ countedTotal: '590.00', differenceNote: '10 TL kısa sayım — günlük fark' });
    expect(closed.status).toBe(201);
    const body = closed.body as {
      status: string;
      expectedTotal: string | null;
      countedTotal: string | null;
      difference: string | null;
    };
    expect(body.status).toBe('closed');
    expect(body.expectedTotal).toBe('600.00');
    expect(body.countedTotal).toBe('590.00');
    expect(body.difference).toBe('-10.00');

    // Kapalı oturuma hareket yazılamaz → 409
    const movement = await request(app.getHttpServer())
      .post(`/api/v1/cash/sessions/${sessionId}/movements`)
      .set(authHeader(adminToken))
      .send({ sourceType: 'manual_in', amount: '10.00', reason: 'geç hareket denemesi' });
    expect(movement.status).toBe(409);
  });

  itDb('K4 elle nakit çıkışı: açık oturumda manual_out hareketi deftere yazılır', async () => {
    const open = await request(app.getHttpServer())
      .post('/api/v1/cash/sessions/open')
      .set(authHeader(adminToken))
      .send({ registerId, openingFloat: '200.00' });
    expect(open.status).toBe(201);
    const sessionId = (open.body as { id: string }).id;
    created.sessionIds.push(sessionId);

    const movement = await request(app.getHttpServer())
      .post(`/api/v1/cash/sessions/${sessionId}/movements`)
      .set(authHeader(adminToken))
      .send({ sourceType: 'manual_out', amount: '50.00', reason: 'kurye ücreti peşin ödeme' });
    expect(movement.status).toBe(201);
    const body = movement.body as { session: { live: { expected: string } } };
    expect(body.session.live.expected).toBe('150.00'); // 200 − 50
  });

  // ---- Gider ----

  itDb('gider: nakit gider oturum ister, oturumlu gider çıkış hareketi üretir', async () => {
    const sessions = await request(app.getHttpServer())
      .get('/api/v1/cash/sessions?status=open')
      .set(authHeader(adminToken));
    const openSession = (sessions.body as { items: Array<{ id: string }> }).items[0];
    expect(openSession).toBeDefined();

    // Nakit gider oturumsuz → 400
    const noSession = await request(app.getHttpServer())
      .post('/api/v1/finance/expenses')
      .set(authHeader(adminToken))
      .send({
        category: 'medication',
        method: 'cash',
        amount: '75.50',
        description: 'oturumsuz nakit gider reddedilir',
        spentAt: new Date().toISOString(),
      });
    expect(noSession.status).toBe(400);

    // Oturumlu nakit gider → çıkış hareketi
    const ok = await request(app.getHttpServer())
      .post('/api/v1/finance/expenses')
      .set(authHeader(adminToken))
      .send({
        category: 'utility',
        method: 'cash',
        amount: '75.50',
        description: 'elektrik ara ödemesi',
        spentAt: new Date().toISOString(),
        cashSessionId: openSession?.id,
      });
    expect(ok.status).toBe(201);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/cash/sessions/${openSession?.id}`)
      .set(authHeader(adminToken));
    const data = detail.body as { movements: Array<{ sourceType: string; amount: string }> };
    expect(
      data.movements.some((m) => m.sourceType === 'expense' && m.amount === '75.50'),
    ).toBe(true);
  });

  // ---- Tedarikçi borcu ----

  itDb('tedarikçi borcu: açma, kısmi ödeme ve bakiye kapanınca settled', async () => {
    const suppliers = await request(app.getHttpServer())
      .get('/api/v1/suppliers?active=true')
      .set(authHeader(adminToken));
    const supplier = (suppliers.body as { items: Array<{ id: string }> }).items[0];
    expect(supplier).toBeDefined();

    const createdPayable = await request(app.getHttpServer())
      .post('/api/v1/finance/payables')
      .set(authHeader(adminToken))
      .send({
        supplierId: supplier?.id,
        amount: '1000.00',
        documentNo: `F09-${Date.now().toString(36)}`,
        description: 'e2e tedarikçi borcu',
      });
    expect(createdPayable.status).toBe(201);
    const payableId = (createdPayable.body as { payable: { id: string } }).payable.id;
    created.payableIds.push(payableId);

    const partial = await request(app.getHttpServer())
      .post(`/api/v1/finance/payables/${payableId}/pay`)
      .set(authHeader(adminToken))
      .send({ amount: '400.00' });
    expect(partial.status).toBe(201);
    expect((partial.body as { payable: { status: string; paidAmount: string } }).payable.status).toBe(
      'open',
    );
    expect((partial.body as { payable: { paidAmount: string } }).payable.paidAmount).toBe('400.00');

    const over = await request(app.getHttpServer())
      .post(`/api/v1/finance/payables/${payableId}/pay`)
      .set(authHeader(adminToken))
      .send({ amount: '999.00' });
    expect(over.status).toBe(400);

    const settle = await request(app.getHttpServer())
      .post(`/api/v1/finance/payables/${payableId}/pay`)
      .set(authHeader(adminToken))
      .send({ amount: '600.00' });
    expect(settle.status).toBe(201);
    const settled = (settle.body as { payable: { status: string } }).payable;
    expect(settled.status).toBe('settled');
  });

  // ---- Şube kapsamı ----

  itDb('şube kapsamı: veteriner (yalnız MRKZ) kendi şubesindeki tahsilatı görür', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/finance/owners/${ownerId}/statement`)
      .set(authHeader(veterinerToken));
    expect(res.status).toBe(200);
  });
});
