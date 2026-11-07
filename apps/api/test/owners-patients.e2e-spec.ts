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
 * Faz 04 API E2E — kabul kriterleri gerçek veritabanı ve guard zinciriyle doğulanır.
 * Ön koşul: gömülü PostgreSQL + migrate + seed (scripts/with-pg.sh sarmalayıcısı).
 * Test kendi verisini oluşturur ve sonda temizler (Playwright E2E seed verisine dokunmaz).
 */

const DEMO_PASSWORD = 'VetCore2026!';
const runId = `f04e2e-${Date.now().toString(36)}`;

/** DB yoksa testler tek tek atlanır (CI'da DATABASE_URL sağlanmalıdır). */
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

/** Supertest için ikili (binary) indirme ayrıştırıcısı — akış içeriğini Buffer döndürür. */
function binaryParser(
  res: { on: (event: string, cb: (chunk: Buffer) => void) => void },
  callback: (err: Error | null, body?: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Faz 04 — sahip ve hasta yönetimi (API kabul kriterleri)', () => {
  let app: INestApplication;
  let adminToken: string;
  let stokToken: string;
  let merkezBranchId: string;
  let sube2BranchId: string;
  let catSpeciesId: string;
  let breedId: string;

  // Temizlik listesi (test sonunda fiziksel silme — yalnızca test verisi).
  const created = {
    ownerIds: [] as string[],
    patientIds: [] as string[],
    fileAssetIds: [] as string[],
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

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    adminToken = await login(app, 'admin@vetcore-demo.example');
    stokToken = await login(app, 'stok@vetcore-demo.example');

    const branches = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set(authHeader(adminToken));
    expect(branches.status).toBe(200);
    merkezBranchId = branches.body.find((b: { code: string }) => b.code === 'MRKZ').id;
    sube2BranchId = branches.body.find((b: { code: string }) => b.code === 'SUB2').id;

    const species = await request(app.getHttpServer())
      .get('/api/v1/species')
      .set(authHeader(adminToken));
    expect(species.status).toBe(200);
    const cat = species.body.find((s: { key: string }) => s.key === 'cat');
    catSpeciesId = cat.id;
    breedId = cat.breeds[0].id;
  }, 60_000);

  afterAll(async () => {
    if (!dbReady) return;
    // Test verisini fiziksel temizle (iş akışı silmez; test izlerini bırakmaz).
    const { PrismaClient } = await import('@prisma/client');
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL yok');
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      await prisma.fileAsset.deleteMany({ where: { id: { in: created.fileAssetIds } } });
      await prisma.fileAsset.deleteMany({ where: { patientId: { in: created.patientIds } } });
      await prisma.weightObservation.deleteMany({
        where: { patientId: { in: created.patientIds } },
      });
      await prisma.patientAlert.deleteMany({ where: { patientId: { in: created.patientIds } } });
      await prisma.patient.deleteMany({ where: { id: { in: created.patientIds } } });
      await prisma.ownerContact.deleteMany({ where: { ownerId: { in: created.ownerIds } } });
      await prisma.ownerConsent.deleteMany({ where: { ownerId: { in: created.ownerIds } } });
      await prisma.owner.deleteMany({ where: { id: { in: created.ownerIds } } });
    } finally {
      await prisma.$disconnect();
    }
    await app.close();
  }, 60_000);

  itDb('kimlik doğrulaması olmadan sahip/hasta uçları 401 döner', async () => {
    const res1 = await request(app.getHttpServer()).get('/api/v1/owners');
    expect(res1.status).toBe(401);
    const res2 = await request(app.getHttpServer()).get('/api/v1/patients');
    expect(res2.status).toBe(401);
    const res3 = await request(app.getHttpServer()).get(
      '/api/v1/file-assets/00000000-0000-4000-8000-000000000000/download',
    );
    expect(res3.status).toBe(401);
  });

  itDb('sahip oluşturur (owner.manage izni) ve aynı telefondan mükerrer uyarı verir', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/owners')
      .set(authHeader(adminToken))
      .send({
        firstName: 'Test',
        lastName: `Sahibi ${runId}`,
        contacts: [{ kind: 'phone', value: '+90 530 111 22 33', label: 'Cep', isPrimary: true }],
        consents: { kvkk: true, sms: true },
      });
    expect(createRes.status).toBe(201);
    created.ownerIds.push(createRes.body.id);
    expect(createRes.body.contacts).toHaveLength(1);
    expect(createRes.body.contacts[0].normalized).toBe('905301112233');

    // Mükerrer kontrolü: aynı telefon tekrar sorulduğunda aday listelenir (uyarı).
    const dupRes = await request(app.getHttpServer())
      .get('/api/v1/owners/duplicates')
      .query({ phone: '0530 111 22 33' })
      .set(authHeader(adminToken));
    expect(dupRes.status).toBe(200);
    expect(dupRes.body.length).toBeGreaterThanOrEqual(1);
    const match = dupRes.body.find((m: { id: string }) => m.id === createRes.body.id);
    expect(match).toBeDefined();
    expect(match.reasons).toContain('phone');
    expect(match.primaryContact.value).toBe('+90 530 111 22 33');
  });

  itDb('bir sahip altında birden fazla hasta oluşturulur (kabul kriteri)', async () => {
    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/owners')
      .set(authHeader(adminToken))
      .send({
        firstName: 'Çoklu',
        lastName: `Hastalı ${runId}`,
        contacts: [{ kind: 'phone', value: '+90 531 222 33 44', isPrimary: true }],
      });
    expect(ownerRes.status).toBe(201);
    const ownerId = ownerRes.body.id;
    created.ownerIds.push(ownerId);

    const p1 = await request(app.getHttpServer())
      .post(`/api/v1/owners/${ownerId}/patients`)
      .set(authHeader(adminToken))
      .set('X-Branch-Id', merkezBranchId)
      .send({
        name: 'Badem',
        speciesId: catSpeciesId,
        breedId,
        gender: 'female',
        microchip: '985199900000001',
        initialWeightKg: 3.4,
        alerts: [{ kind: 'allergy', label: 'Tavuk protein alerjisi', severity: 'high' }],
      });
    expect(p1.status).toBe(201);
    created.patientIds.push(p1.body.id);
    expect(p1.body.code).toMatch(/^HP-\d{4}$/);
    expect(p1.body.alerts).toHaveLength(1);
    expect(p1.body.alerts[0].kind).toBe('allergy');

    const p2 = await request(app.getHttpServer())
      .post(`/api/v1/owners/${ownerId}/patients`)
      .set(authHeader(adminToken))
      .set('X-Branch-Id', merkezBranchId)
      .send({
        name: 'Fındık',
        speciesId: catSpeciesId,
        gender: 'male',
        microchip: '985199900000002',
      });
    expect(p2.status).toBe(201);
    created.patientIds.push(p2.body.id);
    expect(p2.body.code).not.toBe(p1.body.code);

    // Sahip detayında iki hasta görünür.
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/owners/${ownerId}`)
      .set(authHeader(adminToken));
    expect(detail.status).toBe(200);
    expect(detail.body.patients).toHaveLength(2);
  });

  itDb('telefon normalize araması ve mikroçip araması çalışır (kabul kriteri)', async () => {
    // Telefon: seed sahibi Zeynep Aksoy — farklı biçimle sorgula.
    const byPhone = await request(app.getHttpServer())
      .get('/api/v1/owners')
      .query({ search: '0532 111 22 33' })
      .set(authHeader(adminToken));
    expect(byPhone.status).toBe(200);
    expect(byPhone.body.length).toBeGreaterThanOrEqual(1);
    expect(byPhone.body[0].lastName).toBe('Aksoy');

    // Tam ad araması: ad + soyad kelimeleri sıra bağımsız eşleşir.
    const byName = await request(app.getHttpServer())
      .get('/api/v1/owners')
      .query({ search: 'aksoy zeynep' })
      .set(authHeader(adminToken));
    expect(byName.status).toBe(200);
    expect(byName.body.length).toBeGreaterThanOrEqual(1);
    expect(byName.body[0].lastName).toBe('Aksoy');

    // Hasta araması: sahip adıyla.
    const byOwnerName = await request(app.getHttpServer())
      .get('/api/v1/patients')
      .query({ search: 'mehmet yılmaz' })
      .set(authHeader(adminToken))
      .set('X-Branch-Id', merkezBranchId);
    expect(byOwnerName.status).toBe(200);
    expect(byOwnerName.body.length).toBe(1);
    expect(byOwnerName.body[0].name).toBe('Duman');

    // Hasta araması: mikroçip (normalize — boşluklu biçimle sorgula).
    const byMicrochip = await request(app.getHttpServer())
      .get('/api/v1/patients')
      .query({ search: '985 101 000 000 003' })
      .set(authHeader(adminToken))
      .set('X-Branch-Id', merkezBranchId);
    expect(byMicrochip.status).toBe(200);
    expect(byMicrochip.body.length).toBe(1);
    expect(byMicrochip.body[0].name).toBe('Duman');

    // Hasta araması: hasta kodu.
    const byCode = await request(app.getHttpServer())
      .get('/api/v1/patients')
      .query({ search: 'hp-0001' })
      .set(authHeader(adminToken))
      .set('X-Branch-Id', merkezBranchId);
    expect(byCode.status).toBe(200);
    expect(byCode.body.length).toBe(1);
    expect(byCode.body[0].name).toBe('Pamuk');
  });

  itDb('hasta uyarıları listede ve detayda görünür (kabul kriteri)', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/patients')
      .query({ search: 'Duman' })
      .set(authHeader(adminToken))
      .set('X-Branch-Id', merkezBranchId);
    expect(list.status).toBe(200);
    expect(list.body[0].alerts.length).toBeGreaterThanOrEqual(1);
    expect(list.body[0].alerts[0].kind).toBe('allergy');
    expect(list.body[0].alerts[0].severity).toBe('high');

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/patients/${list.body[0].id}`)
      .set(authHeader(adminToken));
    expect(detail.status).toBe(200);
    const kuduz = (detail.body.alerts as { label: string }[]).find((alert) =>
      alert.label.includes('Kuduz'),
    );
    expect(kuduz).toBeDefined();

    // Uyarı ekle/çöz akışı
    const patientId = list.body[0].id;
    const alertRes = await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientId}/alerts`)
      .set(authHeader(adminToken))
      .send({ kind: 'warning', label: 'Isırma riski', severity: 'medium' });
    expect(alertRes.status).toBe(201);

    const resolveRes = await request(app.getHttpServer())
      .patch(`/api/v1/patients/${patientId}/alerts/${alertRes.body.id}`)
      .set(authHeader(adminToken))
      .send({ active: false });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.active).toBe(false);

    // Kilolu gözlem ekle
    const weightRes = await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientId}/weights`)
      .set(authHeader(adminToken))
      .send({ weightKg: 5.25, note: 'Kontrol' });
    expect(weightRes.status).toBe(201);
    // Test sonrası temizlik: doğrudan silinecek (patientId seed hastası — kayıtları sil).
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } });
    await prisma.patientAlert.delete({ where: { id: alertRes.body.id } });
    await prisma.weightObservation.delete({ where: { id: weightRes.body.id } });
    await prisma.$disconnect();
  });

  itDb('yetkisiz şube kullanıcısı kayıtları okuyamaz (kabul kriteri)', async () => {
    // stok@ yalnız SUB2 şubesine erişir; Merkez'deki Pamuk (HP-0001) görünmez.
    const list = await request(app.getHttpServer())
      .get('/api/v1/patients')
      .set(authHeader(stokToken));
    expect(list.status).toBe(200);
    const names = list.body.map((p: { name: string }) => p.name);
    expect(names).toContain('Boncuk'); // SUB2 hastası
    expect(names).not.toContain('Pamuk'); // MRKZ hastası
    expect(names).not.toContain('Duman');

    // Doğrudan erişim 403.
    const merkezPatients = await request(app.getHttpServer())
      .get('/api/v1/patients')
      .set(authHeader(adminToken))
      .set('X-Branch-Id', merkezBranchId);
    const pamuk = merkezPatients.body.find((p: { code: string }) => p.code === 'HP-0001');
    const direct = await request(app.getHttpServer())
      .get(`/api/v1/patients/${pamuk.id}`)
      .set(authHeader(stokToken));
    expect(direct.status).toBe(403);

    // Merkez şubesi kapsamında istek de 403 (BranchScopeGuard).
    const scoped = await request(app.getHttpServer())
      .get('/api/v1/patients')
      .query({ branchId: merkezBranchId })
      .set(authHeader(stokToken));
    expect(scoped.status).toBe(403);
  });

  itDb('dosya yükleme + yetkili indirme; yetkisiz erişim engellenir (kabul kriteri)', async () => {
    // Yükleme: Merkez'deki Pamuk'a (admin).
    const merkezPatients = await request(app.getHttpServer())
      .get('/api/v1/patients')
      .set(authHeader(adminToken))
      .set('X-Branch-Id', merkezBranchId);
    const pamuk = merkezPatients.body.find((p: { code: string }) => p.code === 'HP-0001');

    const upload = await request(app.getHttpServer())
      .post('/api/v1/file-assets/upload')
      .set(authHeader(adminToken))
      .field('patientId', pamuk.id)
      .attach('file', Buffer.from('demo lab sonucu icerigi'), {
        filename: 'sonuc.txt',
        contentType: 'text/plain',
      });
    expect(upload.status).toBe(201);
    expect(upload.body.fileName).toBe('sonuc.txt');
    expect(upload.body.kind).toBe('other');
    const assetId = upload.body.id;
    created.fileAssetIds.push(assetId);

    // Metadata listesi storage key içermez.
    const meta = await request(app.getHttpServer())
      .get('/api/v1/file-assets')
      .query({ patientId: pamuk.id })
      .set(authHeader(adminToken));
    expect(meta.status).toBe(200);
    expect(meta.body.some((f: { id: string }) => f.id === assetId)).toBe(true);
    expect(JSON.stringify(meta.body)).not.toContain('storageKey');

    // Yetkili indirme (admin): içerik akar.
    const download = await request(app.getHttpServer())
      .get(`/api/v1/file-assets/${assetId}/download`)
      .set(authHeader(adminToken))
      .buffer(true)
      .parse(binaryParser);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('sonuc.txt');
    expect(Buffer.from(download.body as Buffer).toString('utf8')).toContain('demo lab sonucu');

    // Yetkisiz şube (stok@ — SUB2): 403 (kabul kriteri: URL yetkisiz erişim vermez).
    const denied = await request(app.getHttpServer())
      .get(`/api/v1/file-assets/${assetId}/download`)
      .set(authHeader(stokToken));
    expect(denied.status).toBe(403);

    // Kimliksiz istek: 401.
    const anon = await request(app.getHttpServer()).get(`/api/v1/file-assets/${assetId}/download`);
    expect(anon.status).toBe(401);

    // Desteklenmeyen MIME reddedilir.
    const badMime = await request(app.getHttpServer())
      .post('/api/v1/file-assets/upload')
      .set(authHeader(adminToken))
      .field('patientId', pamuk.id)
      .attach('file', Buffer.from('<?php echo 1;'), {
        filename: 'shell.php',
        contentType: 'application/x-php',
      });
    expect(badMime.status).toBe(415);
  });

  itDb('arşiv + merge akışı: otomatik merge yok, sebep zorunlu', async () => {
    // İki sahip oluştur; birinin altına hasta aç.
    const [srcRes, dstRes] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/owners')
        .set(authHeader(adminToken))
        .send({
          firstName: 'Kaynak',
          lastName: `Merge ${runId}`,
          contacts: [{ kind: 'phone', value: '+90 534 555 66 77', isPrimary: true }],
        }),
      request(app.getHttpServer())
        .post('/api/v1/owners')
        .set(authHeader(adminToken))
        .send({
          firstName: 'Hedef',
          lastName: `Merge ${runId}`,
          contacts: [{ kind: 'phone', value: '+90 534 555 66 78', isPrimary: true }],
        }),
    ]);
    expect(srcRes.status).toBe(201);
    expect(dstRes.status).toBe(201);
    created.ownerIds.push(srcRes.body.id, dstRes.body.id);

    const patient = await request(app.getHttpServer())
      .post(`/api/v1/owners/${srcRes.body.id}/patients`)
      .set(authHeader(adminToken))
      .set('X-Branch-Id', merkezBranchId)
      .send({ name: 'Gezgin', speciesId: catSpeciesId });
    expect(patient.status).toBe(201);
    created.patientIds.push(patient.body.id);

    // Merge: hastalar hedefe taşınır, kaynak arşivlenir.
    const merge = await request(app.getHttpServer())
      .post(`/api/v1/owners/${srcRes.body.id}/merge`)
      .set(authHeader(adminToken))
      .send({ intoOwnerId: dstRes.body.id, reason: 'Çift kayıt — telefon doğrulandı' });
    expect(merge.status).toBe(201);
    expect(merge.body.archivedAt).not.toBeNull();
    expect(merge.body.mergedIntoOwnerId).toBe(dstRes.body.id);

    // Hasta artık hedef sahibin altında.
    const dstDetail = await request(app.getHttpServer())
      .get(`/api/v1/owners/${dstRes.body.id}`)
      .set(authHeader(adminToken));
    expect(dstDetail.body.patients.some((p: { name: string }) => p.name === 'Gezgin')).toBe(true);

    // Arşivli sahip varsayılan listede görünmez.
    const listAfter = await request(app.getHttpServer())
      .get('/api/v1/owners')
      .query({ search: `Merge ${runId}` })
      .set(authHeader(adminToken));
    expect(listAfter.body.every((o: { id: string }) => o.id !== srcRes.body.id)).toBe(true);

    // Aktif hastası olan sahip arşivlenemez.
    const blocked = await request(app.getHttpServer())
      .patch(`/api/v1/owners/${dstRes.body.id}/archive`)
      .set(authHeader(adminToken))
      .send({ reason: 'deneme' });
    expect(blocked.status).toBe(409);

    // Sebep zorunlu (DTO validation).
    const noReason = await request(app.getHttpServer())
      .patch(`/api/v1/owners/${dstRes.body.id}/archive`)
      .set(authHeader(adminToken))
      .send({});
    expect(noReason.status).toBe(400);

    // Yetkisiz kullanıcı (stok@ — owner.manage yok) yazamaz.
    const forbidden = await request(app.getHttpServer())
      .post('/api/v1/owners')
      .set(authHeader(stokToken))
      .send({
        firstName: 'Yetkisiz',
        lastName: 'Deneme',
        contacts: [{ kind: 'phone', value: '+90 535 999 88 77', isPrimary: true }],
      });
    expect(forbidden.status).toBe(403);
  });

  itDb('hasta zaman çizelgesi iskeleti olayları tarih sırasıyla döndürür', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/patients')
      .query({ search: 'Pamuk' })
      .set(authHeader(adminToken))
      .set('X-Branch-Id', merkezBranchId);
    const pamukId = list.body[0].id;

    const timeline = await request(app.getHttpServer())
      .get(`/api/v1/patients/${pamukId}/timeline`)
      .set(authHeader(adminToken));
    expect(timeline.status).toBe(200);
    const events = timeline.body as { at: string; type: string }[];
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.some((e) => e.type === 'weight')).toBe(true);
    for (let i = 1; i < events.length; i += 1) {
      expect(events[i - 1]!.at >= events[i]!.at).toBe(true);
    }
  });

  itDb('mükerrer mikroçip çakışması 409 döner (otomatik merge yok)', async () => {
    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/owners')
      .set(authHeader(adminToken))
      .send({
        firstName: 'Çip',
        lastName: `Deneme ${runId}`,
        contacts: [{ kind: 'phone', value: '+90 536 123 45 67', isPrimary: true }],
      });
    expect(ownerRes.status).toBe(201);
    created.ownerIds.push(ownerRes.body.id);

    const dup = await request(app.getHttpServer())
      .post(`/api/v1/owners/${ownerRes.body.id}/patients`)
      .set(authHeader(adminToken))
      .set('X-Branch-Id', merkezBranchId)
      .send({ name: 'Kopya', speciesId: catSpeciesId, microchip: '985101000000001' });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toContain('mikroçip');

    // Mükerrer uyarı ucu aynı mikroçipi aday gösterir.
    const warn = await request(app.getHttpServer())
      .get('/api/v1/patients/duplicates')
      .query({ microchip: '985101000000001' })
      .set(authHeader(adminToken))
      .set('X-Branch-Id', merkezBranchId);
    expect(warn.status).toBe(200);
    expect(warn.body.some((p: { name: string }) => p.name === 'Pamuk')).toBe(true);
  });
});
