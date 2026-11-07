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
 * Faz 05 API E2E — randevu takvimi ve akış panosu kabul kriterleri, gerçek
 * veritabanı ve guard zinciriyle doğulanır:
 * 1. Aynı hekim/oda çakışması engellenir (409 APPOINTMENT_CONFLICT).
 * 2. Çalışma saati dışı randevu 422 APPOINTMENT_OUTSIDE_WORKING_HOURS; yetkili
 *    override (izin + gerekçe) ile kabul edilir; izinsiz override 403.
 * 3. Geçersiz durum geçişleri 409 APPOINTMENT_INVALID_TRANSITION.
 * 4. Check-in akış panosuna yansır (arrived şeridi).
 * 5. Şube ve hekim filtreleri API'de uygulanır (şube kapsamı 403/gizli liste).
 * 6. Europe/Istanbul: UTC instant'ların yerel gün/hafta eşlemesi doğru çalışır.
 *
 * Ön koşul: gömülü PostgreSQL + migrate + seed (scripts/with-pg.sh sarmalayıcısı).
 * Test kendi verisini oluşturur ve sonda temizler (Playwright E2E seed verisine dokunmaz).
 */

const DEMO_PASSWORD = 'VetCore2026!';
const runId = `f05e2e-${Date.now().toString(36)}`;

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

/** Europe/Istanbul yerel saatini UTC instant'a çevirir (sabit +03). */
const istanbulInstant = (dateISO: string, hour: number, minute: number): string => {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(Date.parse(`${dateISO}T${hh}:${mm}:00Z`) - 3 * 60 * 60_000).toISOString();
};

describe('Faz 05 — randevu takvimi ve akış panosu (API kabul kriterleri)', () => {
  let app: INestApplication;
  let adminToken: string;
  let veterinerToken: string;
  let resepsiyonToken: string;
  let stokToken: string;
  let merkezBranchId: string;
  let sube2BranchId: string;
  let vetStaffId: string;
  let adminStaffId: string;
  let muayeneRoomId: string;
  let operasyonRoomId: string;
  let typeIdMuayene: string;
  let typeIdKontrol: string;

  const created = {
    ownerIds: [] as string[],
    patientIds: [] as string[],
    appointmentIds: [] as string[],
    waitlistIds: [] as string[],
    scheduleBlockIds: [] as string[],
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
    // Repo-düzeyi `pnpm test` DB'siz koşar; DB yoksa testler atlanır
    // (e2e zinciri scripts/with-pg.sh sarmalayıcısıyla koşar — Faz 04 deseni).
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
    // Supertest'in kendi listen/close yaşam döngüsündeki yarış durumunu önler:
    // sunucu açıkça dinlemede olursa address() her zaman doludur.
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
    const admin = await prisma.staff.findUnique({
      where: { email: 'admin@vetcore-demo.example' },
    });
    vetStaffId = vet?.id ?? '';
    adminStaffId = admin?.id ?? '';
    const room = await prisma.room.findFirst({
      where: { branchId: merkezBranchId, name: 'Muayene Odası 2' },
    });
    muayeneRoomId = room?.id ?? '';
    const operasyon = await prisma.room.findFirst({
      where: { branchId: merkezBranchId, name: 'Operasyon Odası' },
    });
    operasyonRoomId = operasyon?.id ?? '';
    const muayeneType = await prisma.appointmentType.findFirst({
      where: { clinicId: clinic.id, name: 'Muayene' },
    });
    const kontrolType = await prisma.appointmentType.findFirst({
      where: { clinicId: clinic.id, name: 'Kontrol' },
    });
    typeIdMuayene = muayeneType?.id ?? '';
    typeIdKontrol = kontrolType?.id ?? '';
    await prisma.$disconnect();

    adminToken = await login(app, 'admin@vetcore-demo.example');
    veterinerToken = await login(app, 'veteriner@vetcore-demo.example');
    resepsiyonToken = await login(app, 'resepsiyon@vetcore-demo.example');
    stokToken = await login(app, 'stok@vetcore-demo.example');
  });

  afterAll(async () => {
    // Temizlik: test verisi fiziksel silinir (yalnızca sentetik e2e kayıtları)
    if (dbReady) {
      const prisma = new (await import('@prisma/client')).PrismaClient();
      if (created.waitlistIds.length > 0) {
        await prisma.waitlistEntry.deleteMany({ where: { id: { in: created.waitlistIds } } });
      }
      if (created.appointmentIds.length > 0) {
        await prisma.appointment.deleteMany({ where: { id: { in: created.appointmentIds } } });
      }
      if (created.patientIds.length > 0) {
        await prisma.patient.deleteMany({ where: { id: { in: created.patientIds } } });
      }
      if (created.ownerIds.length > 0) {
        await prisma.owner.deleteMany({ where: { id: { in: created.ownerIds } } });
      }
      if (created.scheduleBlockIds.length > 0) {
        await prisma.scheduleBlock.deleteMany({ where: { id: { in: created.scheduleBlockIds } } });
      }
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  async function createTestOwnerPatient(token: string): Promise<{ ownerId: string; patientId: string }> {
    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/owners')
      .set(authHeader(token))
      .send({
        firstName: `Faz05Test${runId}`,
        lastName: 'RandevuSahibi',
        contacts: [{ kind: 'phone', value: '+90 555 000 11 22', label: 'Cep', isPrimary: true }],
        consents: { kvkk: true },
      });
    expect(ownerRes.status).toBe(201);
    const ownerId = (ownerRes.body as { id: string }).id;
    const patientRes = await request(app.getHttpServer())
      .post(`/api/v1/owners/${ownerId}/patients`)
      .set(authHeader(token))
      .send({ name: `RandevuTest-${runId}`, speciesId: await speciesId() });
    expect(patientRes.status).toBe(201);
    const patientId = (patientRes.body as { id: string }).id;
    created.ownerIds.push(ownerId);
    created.patientIds.push(patientId);
    return { ownerId, patientId };
  }

  let cachedSpeciesId: string | null = null;
  async function speciesId(): Promise<string> {
    if (cachedSpeciesId) return cachedSpeciesId;
    const res = await request(app.getHttpServer())
      .get('/api/v1/species')
      .set(authHeader(adminToken));
    const species = (res.body as { id: string; key: string }[]).find((s) => s.key === 'cat');
    cachedSpeciesId = species?.id ?? '';
    return cachedSpeciesId;
  }

  /** noUncheckedIndexedAccess uyumu: Kurulum testi başarısızsa sonraki testler net hata verir. */
  function pickPatient(index: number): string {
    const id = created.patientIds[index];
    if (!id) throw new Error('Test hastası yok — Kurulum testi başarısız olmuş');
    return id;
  }

  function createAppointmentBody(patientId: string, overrides: Record<string, unknown> = {}) {
    return {
      patientId,
      appointmentTypeId: typeIdMuayene,
      staffId: vetStaffId,
      roomId: muayeneRoomId,
      startAt: istanbulInstant('2026-11-16', 10, 0), // Pazartesi 10:00 yerel
      notes: `Faz 05 e2e ${runId}`,
      ...overrides,
    };
  }

  itDb('Kurulum: test sahibi + hastası oluşturulur', async () => {
    const { patientId } = await createTestOwnerPatient(adminToken);
    expect(patientId).toBeTruthy();
  });

  // ---- Kabul kriteri 1: çakışma kontrolü ----
  itDb(
    '1a. Aynı hekim için çakışan aktif randevu 409 APPOINTMENT_CONFLICT ile reddedilir',
    async () => {
      const patientId = pickPatient(0);
      const first = await request(app.getHttpServer())
        .post('/api/v1/appointments')
        .set(authHeader(adminToken))
        .send(createAppointmentBody(patientId));
      expect(first.status).toBe(201);
      created.appointmentIds.push((first.body as { id: string }).id);

      const ownerRes = await request(app.getHttpServer())
        .post('/api/v1/owners')
        .set(authHeader(adminToken))
        .send({
          firstName: `Faz05Ikinci${runId}`,
          lastName: 'RandevuSahibi',
          contacts: [{ kind: 'phone', value: '+90 555 000 33 44', label: 'Cep', isPrimary: true }],
        });
      const ownerId2 = (ownerRes.body as { id: string }).id;
      created.ownerIds.push(ownerId2);
      const patientRes = await request(app.getHttpServer())
        .post(`/api/v1/owners/${ownerId2}/patients`)
        .set(authHeader(adminToken))
        .send({ name: `RandevuTest2-${runId}`, speciesId: await speciesId() });
      const patientId2 = (patientRes.body as { id: string }).id;
      created.patientIds.push(patientId2);

      const conflict = await request(app.getHttpServer())
        .post('/api/v1/appointments')
        .set(authHeader(adminToken))
        .send(createAppointmentBody(patientId2)); // aynı hekim + oda + aralık
      expect(conflict.status).toBe(409);
      expect((conflict.body as { code: string }).code).toBe('APPOINTMENT_CONFLICT');
    },
  );

  itDb('1b. Farklı oda ama aynı hekim → yine çakışma; farklı saat → kabul', async () => {
    const patientId = pickPatient(1);
    const sameVetOtherRoom = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(adminToken))
      .send(
        createAppointmentBody(patientId, { roomId: operasyonRoomId }),
      );
    expect(sameVetOtherRoom.status).toBe(409);
    expect((sameVetOtherRoom.body as { code: string }).code).toBe('APPOINTMENT_CONFLICT');

    const otherTime = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(adminToken))
      .send(createAppointmentBody(patientId, { startAt: istanbulInstant('2026-11-16', 11, 0) }));
    expect(otherTime.status).toBe(201);
    created.appointmentIds.push((otherTime.body as { id: string }).id);
  });

  itDb('1c. Çakışan pasif (cancelled) randevu engel değildir', async () => {
    const patientId = pickPatient(0);
    const cancelledRes = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(adminToken))
      .send(createAppointmentBody(patientId, { startAt: istanbulInstant('2026-11-16', 12, 0) }));
    expect(cancelledRes.status).toBe(201);
    const cancelledId = (cancelledRes.body as { id: string }).id;
    created.appointmentIds.push(cancelledId);
    const cancel = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${cancelledId}/cancel`)
      .set(authHeader(adminToken))
      .send({ reason: 'Test iptali — hasta gelmedi' });
    expect(cancel.status).toBe(201);

    const retrySameSlot = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(adminToken))
      .send(createAppointmentBody(pickPatient(1), { startAt: istanbulInstant('2026-11-16', 12, 0) }));
    expect(retrySameSlot.status).toBe(201);
    created.appointmentIds.push((retrySameSlot.body as { id: string }).id);
  });

  // ---- Kabul kriteri 2: çalışma saati politikası + override ----
  itDb('2a. Çalışma saati dışı randevu 422 APPOINTMENT_OUTSIDE_WORKING_HOURS', async () => {
    // Pazartesi 07:30 yerel — hekim 09:00'da başlar
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(adminToken))
      .send(createAppointmentBody(pickPatient(0), { startAt: istanbulInstant('2026-11-16', 7, 30) }));
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe('APPOINTMENT_OUTSIDE_WORKING_HOURS');
  });

  itDb('2b. Pazar günü randevu (yerel hafta eşlemesi) reddedilir', async () => {
    // 2026-11-15 Pazar; hekim Pzt–Cmt çalışır
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(adminToken))
      .send(createAppointmentBody(pickPatient(0), { startAt: istanbulInstant('2026-11-15', 10, 0) }));
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe('APPOINTMENT_OUTSIDE_WORKING_HOURS');
  });

  itDb('2c. Yetkili override (admin: appointment.override) gerekçe ile kabul edilir', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(adminToken))
      .send(
        createAppointmentBody(pickPatient(0), {
          startAt: istanbulInstant('2026-11-16', 7, 30),
          allowOutsideHours: true,
          overrideReason: 'Sahip yurt dışı uçuşu öncesi acil kontrol — yönetici onayı',
        }),
      );
    expect(res.status).toBe(201);
    const body = res.body as { id: string; overrideReason: string | null };
    expect(body.overrideReason).toContain('yönetici onayı');
    created.appointmentIds.push(body.id);
  });

  itDb('2d. Override yetkisi olmayan personel (resepsiyon) 403 alır', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(resepsiyonToken))
      .send(
        createAppointmentBody(pickPatient(0), {
          startAt: istanbulInstant('2026-11-16', 7, 30),
          allowOutsideHours: true,
          overrideReason: 'Yetkisiz override denemesi',
        }),
      );
    expect(res.status).toBe(403);
  });

  itDb('2e. Override için gerekçe zorunludur', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(adminToken))
      .send(
        createAppointmentBody(pickPatient(0), {
          startAt: istanbulInstant('2026-11-16', 7, 30),
          allowOutsideHours: true,
        }),
      );
    expect(res.status).toBe(400);
  });

  itDb('2f. Plan engeli (blocked) override edilemez — 409 APPOINTMENT_BLOCKED', async () => {
    const blockRes = await request(app.getHttpServer())
      .post('/api/v1/schedule-blocks')
      .set(authHeader(adminToken))
      .send({
        staffId: vetStaffId,
        kind: 'blocked',
        weekday: 1,
        startMin: 14 * 60, // Pazartesi 14:00–15:00 eğitim engeli
        endMin: 15 * 60,
        note: 'Süreğli eğitim',
      });
    expect(blockRes.status).toBe(201);
    const blockId = (blockRes.body as { id: string }).id;
    created.scheduleBlockIds.push(blockId);

    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(adminToken))
      .send(
        createAppointmentBody(pickPatient(0), {
          startAt: istanbulInstant('2026-11-16', 14, 0),
          endAt: istanbulInstant('2026-11-16', 14, 20),
          allowOutsideHours: true,
          overrideReason: 'Engel yoksayılmasın — beklenti 409',
        }),
      );
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe('APPOINTMENT_BLOCKED');
  });

  // ---- Kabul kriteri 3: durum geçişleri ----
  itDb('3a. scheduled → in_consultation (check-in atlama) 409 INVALID_TRANSITION', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(adminToken))
      .send(createAppointmentBody(pickPatient(0), { startAt: istanbulInstant('2026-11-16', 15, 0) }));
    expect(createRes.status).toBe(201);
    const appointmentId = (createRes.body as { id: string }).id;
    created.appointmentIds.push(appointmentId);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/status`)
      .set(authHeader(adminToken))
      .send({ status: 'in_consultation' });
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe('APPOINTMENT_INVALID_TRANSITION');
  });

  itDb('3b. Geçerli zincir scheduled → arrived → waiting → in_consultation → completed', async () => {
    const appointmentId = created.appointmentIds[created.appointmentIds.length - 1];
    const arrived = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/status`)
      .set(authHeader(adminToken))
      .send({ status: 'arrived' });
    expect(arrived.status).toBe(201);
    expect((arrived.body as { status: string; checkedInAt: string | null }).checkedInAt).toBeTruthy();

    const waiting = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/status`)
      .set(authHeader(adminToken))
      .send({ status: 'waiting' });
    expect(waiting.status).toBe(201);

    const consult = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/status`)
      .set(authHeader(adminToken))
      .send({ status: 'in_consultation' });
    expect(consult.status).toBe(201);

    const completed = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/status`)
      .set(authHeader(adminToken))
      .send({ status: 'completed' });
    expect(completed.status).toBe(201);
    expect((completed.body as { completedAt: string | null }).completedAt).toBeTruthy();

    const terminal = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/status`)
      .set(authHeader(adminToken))
      .send({ status: 'no_show' });
    expect(terminal.status).toBe(409);
    expect((terminal.body as { code: string }).code).toBe('APPOINTMENT_INVALID_TRANSITION');
  });

  itDb('3c. Completed randevu iptal edilemez', async () => {
    const appointmentId = created.appointmentIds[created.appointmentIds.length - 1];
    const res = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/cancel`)
      .set(authHeader(adminToken))
      .send({ reason: 'Tamamlanan randevu iptali denemesi' });
    expect(res.status).toBe(409);
  });

  // ---- Kabul kriteri 4: check-in → flowboard ----
  itDb('4. Check-in edilen randevu flowboard arrived şeridinde görünür', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(adminToken))
      .send(createAppointmentBody(pickPatient(0), { startAt: istanbulInstant('2026-11-09', 17, 0) }));
    expect(createRes.status).toBe(201);
    const appointmentId = (createRes.body as { id: string }).id;
    created.appointmentIds.push(appointmentId);

    const before = await request(app.getHttpServer())
      .get('/api/v1/flowboard')
      .set(authHeader(adminToken))
      .query({ date: '2026-11-09' });
    expect(before.status).toBe(200);
    let lanes = (before.body as { lanes: { arrived: { appointmentId: string }[] } }).lanes;
    expect(lanes.arrived.find((e) => e.appointmentId === appointmentId)).toBeUndefined();

    const checkIn = await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/check-in`)
      .set(authHeader(adminToken));
    expect(checkIn.status).toBe(201);
    expect((checkIn.body as { status: string }).status).toBe('arrived');

    const after = await request(app.getHttpServer())
      .get('/api/v1/flowboard')
      .set(authHeader(adminToken))
      .query({ date: '2026-11-09' });
    lanes = (after.body as { lanes: { arrived: { appointmentId: string }[] } }).lanes;
    expect(lanes.arrived.find((e) => e.appointmentId === appointmentId)).toBeDefined();

    // waiting şeridine taşınınca arrived boşalır
    await request(app.getHttpServer())
      .post(`/api/v1/appointments/${appointmentId}/status`)
      .set(authHeader(adminToken))
      .send({ status: 'waiting' });
    const moved = await request(app.getHttpServer())
      .get('/api/v1/flowboard')
      .set(authHeader(adminToken))
      .query({ date: '2026-11-09' });
    const movedLanes = (
      moved.body as {
        lanes: { arrived: { appointmentId: string }[]; waiting: { appointmentId: string }[] };
      }
    ).lanes;
    expect(movedLanes.arrived.find((e) => e.appointmentId === appointmentId)).toBeUndefined();
    expect(movedLanes.waiting.find((e) => e.appointmentId === appointmentId)).toBeDefined();
  });

  // ---- Kabul kriteri 5: şube ve hekim filtreleri ----
  itDb('5a. staffId filtresi yalnız seçili hekimin randevularını döner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/appointments')
      .set(authHeader(adminToken))
      .query({
        from: istanbulInstant('2026-11-16', 0, 0),
        to: istanbulInstant('2026-11-17', 0, 0),
        staffId: vetStaffId,
        includeClosed: 'true',
      });
    expect(res.status).toBe(200);
    const items = res.body as { id: string; staff: { id: string } }[];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.staff.id).toBe(vetStaffId);
    }
  });

  itDb('5b. Şube kapsamı: SUB2 personeli MRKZ randevularını görmez', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/appointments')
      .set(authHeader(stokToken))
      .query({
        from: istanbulInstant('2026-11-16', 0, 0),
        to: istanbulInstant('2026-11-17', 0, 0),
        includeClosed: 'true',
      });
    expect(res.status).toBe(200);
    const items = res.body as { id: string; branch: { id: string } }[];
    for (const item of items) {
      expect(item.branch.id).toBe(sube2BranchId);
    }
  });

  itDb('5c. MRKZ yetkisi olmayan personel MRKZ şubesini açıkça sorgulayamaz (403)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/appointments')
      .set(authHeader(stokToken))
      .query({
        branchId: merkezBranchId,
        from: istanbulInstant('2026-11-16', 0, 0),
        to: istanbulInstant('2026-11-17', 0, 0),
      });
    expect(res.status).toBe(403);
  });

  itDb('5d. appointment.manage izni olmayan personel (stok) randevu oluşturamaz', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(stokToken))
      .send(createAppointmentBody(pickPatient(0)));
    expect(res.status).toBe(403);
  });

  itDb('5e. resepsiyon (appointment.manage) randevu oluşturabilir', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(resepsiyonToken))
      .send(
        createAppointmentBody(pickPatient(0), {
          startAt: istanbulInstant('2026-11-17', 10, 0), // Salı — çalışma saatleri içinde
        }),
      );
    expect(res.status).toBe(201);
    created.appointmentIds.push((res.body as { id: string }).id);
  });

  // ---- Kabul kriteri 6: Europe/Istanbul saat dilimi ----
  itDb('6a. UTC gece yarısı sınırı yerel güne göre çözülür (2026-11-08T21:00Z = Pzt 00:00)', async () => {
    // UTC Pazartesi 00:00 = İstanbul Pazar 21:00... tersi: Pazar 21:00Z = Pazartesi 00:00 yerel
    // → 2026-11-08T21:00Z yerel olarak Pazartesi 00:00'dır; 09:00 öncesi → outside (Pazar değil!)
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(adminToken))
      .send(
        createAppointmentBody(pickPatient(0), {
          startAt: '2026-11-08T21:00:00.000Z',
          endAt: '2026-11-08T21:20:00.000Z',
        }),
      );
    // Pazartesi 00:00 yerel → hekim saatleri 09:00'da başlar → outside
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe('APPOINTMENT_OUTSIDE_WORKING_HOURS');
  });

  itDb('6b. 2026-11-09T06:00Z (= yerel Pazartesi 09:00) çalışma saatlerinde kabul edilir', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(adminToken))
      .send(
        createAppointmentBody(pickPatient(0), {
          startAt: '2026-11-09T06:00:00.000Z',
          endAt: '2026-11-09T06:20:00.000Z',
        }),
      );
    expect(res.status).toBe(201);
    created.appointmentIds.push((res.body as { id: string }).id);
  });

  // ---- Bekleme listesi ----
  itDb('7a. Bekleme listesi kaydı oluşturulur ve listelenir', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/waitlist')
      .set(authHeader(adminToken))
      .send({
        patientId: pickPatient(1),
        appointmentTypeId: typeIdKontrol,
        preferredStaffId: vetStaffId,
        preferredDate: '2026-11-16',
        preferredStartMin: 9 * 60,
        preferredEndMin: 11 * 60,
        note: `Faz05 e2e bekleme ${runId}`,
      });
    expect(res.status).toBe(201);
    const entryId = (res.body as { id: string }).id;
    created.waitlistIds.push(entryId);

    const list = await request(app.getHttpServer())
      .get('/api/v1/waitlist')
      .set(authHeader(adminToken))
      .query({ status: 'waiting' });
    expect(list.status).toBe(200);
    const items = list.body as { id: string }[];
    expect(items.find((item) => item.id === entryId)).toBeDefined();
  });

  itDb('7b. Bekleme kaydı randevuya çevrilir (book) — çakışma kuralları yine uygulanır', async () => {
    const entryId = created.waitlistIds[0];
    const booked = await request(app.getHttpServer())
      .post(`/api/v1/waitlist/${entryId}/book`)
      .set(authHeader(adminToken))
      .send({
        startAt: istanbulInstant('2026-11-16', 9, 0),
        roomId: muayeneRoomId,
      });
    expect(booked.status).toBe(201);
    const body = booked.body as { status: string; bookedAppointment: { id: string } | null };
    expect(body.status).toBe('scheduled');
    expect(body.bookedAppointment?.id).toBeTruthy();
    if (body.bookedAppointment) created.appointmentIds.push(body.bookedAppointment.id);
  });

  itDb('7c. Bekleme kaydı iptal edilebilir; scheduled kayıt iptal edilemez', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/waitlist')
      .set(authHeader(adminToken))
      .send({ patientId: pickPatient(0) });
    expect(res.status).toBe(201);
    const entryId = (res.body as { id: string }).id;
    created.waitlistIds.push(entryId);

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/waitlist/${entryId}/cancel`)
      .set(authHeader(adminToken));
    expect(cancelled.status).toBe(201);
    expect((cancelled.body as { status: string }).status).toBe('cancelled');

    const reCancel = await request(app.getHttpServer())
      .post(`/api/v1/waitlist/${entryId}/cancel`)
      .set(authHeader(adminToken));
    expect(reCancel.status).toBe(409);
  });

  // ---- Randevu düzenleme (yeniden planlama) ----
  itDb('8. Randevu yeniden planlanır; yeni aralıkta çakışma tekrar kontrol edilir', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set(authHeader(adminToken))
      .send(createAppointmentBody(pickPatient(0), { startAt: istanbulInstant('2026-11-17', 11, 0) }));
    expect(createRes.status).toBe(201);
    const appointmentId = (createRes.body as { id: string }).id;
    created.appointmentIds.push(appointmentId);

    // Çakışan saate taşıma → 409
    const conflict = await request(app.getHttpServer())
      .patch(`/api/v1/appointments/${appointmentId}`)
      .set(authHeader(adminToken))
      .send({ startAt: istanbulInstant('2026-11-16', 10, 0) });
    expect(conflict.status).toBe(409);
    expect((conflict.body as { code: string }).code).toBe('APPOINTMENT_CONFLICT');

    // Boş saate taşıma → kabul
    const ok = await request(app.getHttpServer())
      .patch(`/api/v1/appointments/${appointmentId}`)
      .set(authHeader(adminToken))
      .send({ startAt: istanbulInstant('2026-11-17', 13, 0) });
    expect(ok.status).toBe(200);
    expect((ok.body as { scheduledStart: string }).scheduledStart).toBe(
      istanbulInstant('2026-11-17', 13, 0),
    );
  });

  itDb('9. Randevu türleri kataloğu listelenir; resepsiyon tür ekleyebilir', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/appointment-types')
      .set(authHeader(resepsiyonToken));
    expect(list.status).toBe(200);
    expect((list.body as { name: string }[]).some((t) => t.name === 'Muayene')).toBe(true);

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/appointment-types')
      .set(authHeader(resepsiyonToken))
      .send({ name: `E2E Tür ${runId}`, durationMin: 15, colorKey: 'amber' });
    expect(createRes.status).toBe(201);
    const typeId = (createRes.body as { id: string }).id;

    const stokCreate = await request(app.getHttpServer())
      .post('/api/v1/appointment-types')
      .set(authHeader(stokToken))
      .send({ name: 'Stok Türü', durationMin: 15 });
    expect(stokCreate.status).toBe(403);

    // Temizlik: e2e türü sil (active=false yerine tam silme — test verisi)
    const prisma = new (await import('@prisma/client')).PrismaClient();
    await prisma.appointmentType.delete({ where: { id: typeId } });
    await prisma.$disconnect();
  });

  itDb('10. Denetim kayıtları yazılır (appointment.create + appointment.checkin)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit-events')
      .set(authHeader(adminToken))
      .query({ take: 50 });
    expect(res.status).toBe(200);
    const items = res.body as { items: { action: string }[] };
    const actions = items.items.map((item) => item.action);
    expect(actions).toContain('appointment.create');
    expect(actions).toContain('appointment.checkin');
  });
});
