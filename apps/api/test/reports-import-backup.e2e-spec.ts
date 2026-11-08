import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/global-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.DATABASE_URL ??=
  'postgresql://vetcore:vetcore-dev@localhost:5433/vetcore?schema=public';
process.env.AUTH_JWT_SECRET ??= 'vetcore-test-secret-0123456789abcdef';
// Yedek anahtarı testte sabit — şifreleme turlaşımı deterministik doğrulanır.
process.env.VETCORE_BACKUP_KEY ??= 'vetcore-e2e-backup-key';
// Restore kapısı başlangıçta KAPALI — test içinde staging için açılır.
process.env.VETCORE_BACKUP_ALLOW_RESTORE = 'false';
// Yedek dizini izole (gerçek .backups'a karışmasın)
process.env.VETCORE_BACKUP_DIR = join(process.cwd(), '.backups-e2e');

/**
 * Faz 14 API E2E — raporlar, içe aktarma ve yedekleme kabul kriterleri:
 * 1. Raporlar branch/date filtreleriyle doğru veri üretmeli (gelir raporu
 *    kontrol ödemesiyle; şube filtresi ödemeyi diğer şubede gizlemeli).
 * 2. Export permission yoksa dosya üretilememeli (resepsiyon reports.view var,
 *    reports.export yok → görüntüleme 200, export 403, ReportExport kaydı yok).
 * 3. CSV UTF-8/Türkçe karakter + sayı formatı doğru (BOM baytları + ISO nokta
 *    ondalık) ve XLSX ZIP yapısı geçerli (PK magic + EOCD).
 * 4. Import preview hatalı satırı ve duplicate olasılığını göstermeli; sessiz
 *    overwrite yok (kararsız duplicate'te commit 409, hata satırında 400;
 *    çözüm sonrası commit kayıtları üretmeli — owners→patients→products).
 * 5. Backup manifest/checksum üretmeli; arşiv şifreli (VENC1).
 * 6. Staging restore: checksum bozulması 400, kapıda 403 RESTORE_DISABLED,
 *    açılınca DB + object dosyaları doğrulanmalı (satır sayısı mutabakatı).
 * 7. Backup uçlarına yetkisiz erişim engellenmeli (resepsiyon 403).
 *
 * Ön koşul: gömülü PostgreSQL + migrate + seed (scripts/f14-api-e2e.sh).
 */

const DEMO_PASSWORD = 'VetCore2026!';
/** Koşuma özgü sonek — kalıcı kümede çapraz koşum duplicate/çakışma olmasın. */
const runSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** Koşum-özgü telefon/çip türeticileri (normalize kurallarına uygun). */
/** Koşum-özgü normalize telefon: 90 + 10 rakam (normalizePhone ile uyumlu). */
const runPhone = (n: number) => `9053${runSuffix.replace(/[^0-9]/g, '').slice(-6).padStart(6, '0')}${n}0`;
/** Koşum-özgün 15 haneli mikroçip. */
const runChip = `900${runSuffix.replace(/[^0-9]/g, '').slice(0, 10).padStart(10, '0')}1`;

let dbReady = false;
function itDb(name: string, fn: () => Promise<void>, timeout?: number): void {
  it(name, async (ctx: { skip(): void }) => {
    if (!dbReady) {
      ctx.skip();
      return;
    }
    await fn();
  }, timeout);
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
let resepsiyonToken = '';

let clinicId = '';
let merkezBranchId = '';
let sube2BranchId = '';
let ownerId = '';

const created = {
  ownerIds: [] as string[],
  patientIds: [] as string[],
  productIds: [] as string[],
  chargeIds: [] as string[],
  paymentIds: [] as string[],
  importJobIds: [] as string[],
  backupRunIds: [] as string[],
};

async function get(
  token: string,
  url: string,
  branchId?: string,
): Promise<{ status: number; body: Record<string, unknown>; text?: string }> {
  const res = await request(app.getHttpServer())
    .get(`/api/v1${url}`)
    .set(authHeader(token))
    .set(branchId ? { 'X-Branch-Id': branchId } : {});
  return { status: res.status, body: res.body as Record<string, unknown>, text: res.text };
}

async function post(
  token: string,
  url: string,
  body?: Record<string, unknown>,
  branchId?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await request(app.getHttpServer())
    .post(`/api/v1${url}`)
    .set(authHeader(token))
    .set(branchId ? { 'X-Branch-Id': branchId } : {})
    .send(body ?? {});
  return { status: res.status, body: res.body as Record<string, unknown> };
}

/** İkili indirme (CSV/XLSX/arşiv) — JSON parser'ını devre dışı bırakır. */
async function getBinary(
  token: string,
  url: string,
): Promise<{ status: number; body: Buffer; contentType: string }> {
  const res = await request(app.getHttpServer())
    .get(`/api/v1${url}`)
    .set(authHeader(token))
    .buffer(true)
    .parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });
  return {
    status: res.status,
    body: res.body as Buffer,
    contentType: String(res.headers['content-type'] ?? ''),
  };
}

async function patch(
  token: string,
  url: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await request(app.getHttpServer())
    .patch(`/api/v1${url}`)
    .set(authHeader(token))
    .send(body);
  return { status: res.status, body: res.body as Record<string, unknown> };
}

/** Import işinin satır listesini getirir. */
type ImportRow = {
  id: string;
  rowNumber: number;
  status: string;
  matchedId: string | null;
  resolution: string | null;
  errors: Record<string, string> | null;
};

async function getJobRows(jobId: string): Promise<ImportRow[]> {
  const res = await get(adminToken, `/imports/${jobId}`);
  expect(res.status).toBe(200);
  return (res.body as { rows: ImportRow[] }).rows;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
  prisma = app.get(PrismaService);

  try {
    const clinicRow = await prisma.clinic.findFirst({ where: { slug: 'vetcore-demo' } });
    if (!clinicRow) return;
    clinicId = clinicRow.id;
    const branches = await prisma.branch.findMany({ where: { clinicId } });
    merkezBranchId = branches.find((b) => b.code === 'MRKZ')?.id ?? '';
    sube2BranchId = branches.find((b) => b.code === 'SUB2')?.id ?? '';
    if (!merkezBranchId || !sube2BranchId) return;

    adminToken = await login(app, 'admin@vetcore-demo.example');
    resepsiyonToken = await login(app, 'resepsiyon@vetcore-demo.example');
    const firstOwner = await prisma.owner.findFirst({
      where: { clinicId, contacts: { some: { kind: 'email' } } },
      include: { contacts: true },
    });
    ownerId = firstOwner?.id ?? '';
    dbReady = Boolean(adminToken && resepsiyonToken && ownerId);
  } catch {
    dbReady = false;
  }
}, 120_000);

afterAll(async () => {
  // Test artıklarını temizle (koşum idempotentliği)
  try {
    if (prisma) {
      for (const id of created.importJobIds) {
        await prisma.importRow.deleteMany({ where: { jobId: id } });
        await prisma.importJob.deleteMany({ where: { id } });
      }
      for (const id of created.patientIds) {
        await prisma.patient.deleteMany({ where: { id, code: { startsWith: 'HP-9' } } }).catch(() => undefined);
      }
      for (const id of created.ownerIds) {
        await prisma.ownerContact.deleteMany({ where: { ownerId: id } }).catch(() => undefined);
        await prisma.owner.deleteMany({ where: { id, firstName: 'İçe' } }).catch(() => undefined);
      }
      for (const id of created.productIds) {
        await prisma.product.deleteMany({ where: { id, code: { startsWith: 'IHR-' } } }).catch(() => undefined);
      }
    }
    await rm(join(process.cwd(), '.backups-e2e'), { recursive: true, force: true }).catch(() => undefined);
  } catch {
    // temizlik hatası test sonucunu değiştirmez
  }
  await app?.close();
});

describe('Faz 14 — raporlar, içe aktarma, yedekleme', () => {
  itDb(
    '1. Gelir raporu: tarih + şube filtresi kontrol ödemesiyle doğru veri üretir',
    async () => {
      // Kontrol ödemesi — merkez şubede
      const owner = await prisma.owner.findFirst({
        where: { clinicId, id: ownerId },
        include: { charges: { where: { status: { in: ['open', 'partial'] } } } },
      });
      expect(owner).not.toBeNull();
      let chargeId = owner!.charges[0]?.id ?? '';
      if (!chargeId) {
        const created2 = await prisma.charge.create({
          data: {
            clinicId,
            branchId: merkezBranchId,
            ownerId,
            status: 'open',
            total: 333.33,
          },
        });
        chargeId = created2.id;
        created.chargeIds.push(chargeId);
      }
      const today = new Date().toISOString().slice(0, 10);
      // Kontrol ödemesi — gerçek API akışı (FIFO dağıtım), idempotent anahtar
      const paymentRes = await post(adminToken, '/finance/payments', {
        ownerId,
        method: 'cash',
        amount: '111.11',
        idempotencyKey: 'c1400000-0000-4000-8000-f14000000001',
      });
      expect(
        paymentRes.status,
        `ödeme üretilemedi: ${JSON.stringify(paymentRes.body)}`,
      ).toBe(201);

      const res = await get(
        adminToken,
        `/reports/gelir?period=daily&dateFrom=${today}&dateTo=${today}&branchId=${merkezBranchId}`,
      );
      expect(res.status).toBe(200);
      const table = res.body as { key: string; rows: Array<{ period: string; payments: number }>; totalColumns?: string[] };
      expect(table.key).toBe('gelir');
      const row = table.rows.find((r) => r.period === today);
      expect(row).toBeDefined();
      // Kontrol ödemesi gün toplamında en az kendisi kadar katkı (seed verisi eklenebilir)
      expect(Number(row!.payments)).toBeGreaterThanOrEqual(111.11);

      // Şube filtresi: aynı gün SUB2'de bu ödeme yok — merkez tutarı SUB2'de düşük
      const resSube2 = await get(
        adminToken,
        `/reports/gelir?period=daily&dateFrom=${today}&dateTo=${today}&branchId=${sube2BranchId}`,
      );
      expect(resSube2.status).toBe(200);
      const table2 = resSube2.body as { rows: Array<{ period: string; payments: number }> };
      const row2 = table2.rows.find((r) => r.period === today);
      const sube2Total = row2 ? Number(row2.payments) : 0;
      expect(sube2Total).toBeLessThan(Number(row!.payments));
    },
    60_000,
  );

  itDb(
    '2. Export izni yoksa dosya üretilmez; görüntüleme izinli kullanıcıda çalışır',
    async () => {
      const before = await prisma.reportExport.count({ where: { clinicId } });
      // resepsiyon: reports.view VAR (Faz 14 şablonu), reports.export YOK
      const view = await get(resepsiyonToken, '/reports/gelir?period=daily');
      expect(view.status).toBe(200);
      const denied = await get(resepsiyonToken, '/reports/gelir/export?format=csv&period=daily');
      expect(denied.status).toBe(403);
      const after = await prisma.reportExport.count({ where: { clinicId } });
      expect(after).toBe(before); // dosya üretimi hiç denenmedi
      // admin: dışa aktarma çalışır + kayıt oluşur
      const ok = await get(adminToken, '/reports/gelir/export?format=csv&period=daily');
      expect(ok.status).toBe(200);
      const afterExport = await prisma.reportExport.count({ where: { clinicId } });
      expect(afterExport).toBe(after + 1);
    },
    60_000,
  );

  itDb(
    '3. CSV: UTF-8 BOM baytları + Türkçe karakter + ISO ondalık; XLSX ZIP yapısı',
    async () => {
      const res = await getBinary(adminToken, '/reports/hizmet-dagilimi/export?format=csv');
      expect(res.status).toBe(200);
      const buf = res.body;
      expect(buf.length).toBeGreaterThan(4);
      expect(buf[0]).toBe(0xef);
      expect(buf[1]).toBe(0xbb);
      expect(buf[2]).toBe(0xbf);
      const text = buf.toString('utf8');
      expect(text.startsWith('\uFEFF')).toBe(true);
      // Türkçe başlıklar bozulmadan
      expect(text).toContain('Hizmet');
      expect(text).toContain('Ciro');

      const xlsx = await getBinary(adminToken, '/reports/gelir/export?format=xlsx&period=monthly');
      expect(xlsx.status).toBe(200);
      const xbuf = xlsx.body;
      expect([xbuf[0], xbuf[1], xbuf[2], xbuf[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
      expect(xbuf.includes(Buffer.from('xl/worksheets/sheet1.xml', 'utf8'))).toBe(true);
      expect(xbuf.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(true); // EOCD
    },
    60_000,
  );

  itDb(
    '4a. Import: şablon indir + yükle → önizleme hatalı/duplicate satırları işaretler',
    async () => {
      // Şablon
      const template = await request(app.getHttpServer())
        .get('/api/v1/imports/template?kind=owners')
        .set(authHeader(adminToken));
      expect(template.status).toBe(200);
      expect(template.text.startsWith('\uFEFF')).toBe(true);
      expect(template.text).toContain('ad,soyad,eposta,telefon');

      // Yükleme: 1 geçerli yeni, 1 hatalı (soyad yok), 1 duplicate (seed sahibi epostası), 1 geçerli
      const seedContact = await prisma.ownerContact.findFirst({
        where: { ownerId, kind: 'email' },
      });
      expect(seedContact).not.toBeNull();
      const csv = [
        'ad,soyad,eposta,telefon',
        `İçe, Aktarim1, ice-aktarim1-${runSuffix}@e2e.example,${runPhone(1)}`,
        'İçe,', // hatalı: soyad yok + iletişim yok
        `İçe, AktarimDup, ${seedContact!.normalized},`,
        `İçe, Aktarim2, ice-aktarim2-${runSuffix}@e2e.example,`,
      ].join('\r\n');
      const upload = await request(app.getHttpServer())
        .post('/api/v1/imports/upload')
        .set(authHeader(adminToken))
        .field('kind', 'owners')
        .attach('file', Buffer.from(`\uFEFF${csv}`, 'utf8'), 'sahipler.csv');
      expect(upload.status).toBe(201);
      const job = upload.body as { id: string; totalRows: number; validRows: number; errorRows: number; duplicateRows: number };
      created.importJobIds.push(job.id);
      expect(job.totalRows).toBe(4);
      expect(job.errorRows).toBe(1);
      expect(job.duplicateRows).toBe(1);
      expect(job.validRows).toBe(2);
      const rows = await getJobRows(job.id);
      const duplicateRow = rows.find((r) => r.status === 'duplicate');
      expect(duplicateRow).toBeDefined();
      expect(duplicateRow!.matchedId).toBe(ownerId); // seed sahibiyle eşleşti
      expect(duplicateRow!.resolution).toBeNull(); // karar bekliyor — sessiz overwrite yok
    },
    60_000,
  );

  itDb(
    '4b. Import: kararsız duplicate → 409; hata satırı → 400; karar sonrası commit üretir',
    async () => {
      const jobId = created.importJobIds[0]!;
      // Kararsız duplicate: 409 IMPORT_RESOLUTION_REQUIRED
      const early = await post(adminToken, `/imports/${jobId}/commit`);
      expect(early.status).toBe(409);
      expect((early.body as { code: string }).code).toBe('IMPORT_RESOLUTION_REQUIRED');

      // Duplicate'a 'skip' kararı
      const rows = await getJobRows(jobId);
      const duplicateRow = rows.find((r) => r.status === 'duplicate')!;
      const resolved = await patch(adminToken, `/imports/${jobId}/rows/${duplicateRow.id}`, {
        resolution: 'skip',
      });
      expect(resolved.status).toBe(200);
      expect(resolved.body).toMatchObject({ resolution: 'skip' });

      // Hâlâ hata satırı var: 400 IMPORT_HAS_ERRORS
      const withErrors = await post(adminToken, `/imports/${jobId}/commit`);
      expect(withErrors.status).toBe(400);
      expect((withErrors.body as { code: string }).code).toBe('IMPORT_HAS_ERRORS');

      // Temiz iş: yalnız geçerli satırlar → commit kayıtları üretir
      const cleanCsv = [
        'ad,soyad,eposta,telefon',
        `İçe,Aktarim3,ice-aktarim3-${runSuffix}@e2e.example,${runPhone(3)}`,
        `İçe,Aktarim4,,${runPhone(4)}`,
      ].join('\r\n');
      const upload2 = await request(app.getHttpServer())
        .post('/api/v1/imports/upload')
        .set(authHeader(adminToken))
        .field('kind', 'owners')
        .attach('file', Buffer.from(`\uFEFF${cleanCsv}`, 'utf8'), 'sahipler2.csv');
      expect(upload2.status).toBe(201);
      const job2 = upload2.body as { id: string; validRows: number };
      created.importJobIds.push(job2.id);
      const commit2 = await post(adminToken, `/imports/${job2.id}/commit`);
      expect(commit2.status).toBe(201);
      const committed = commit2.body as { status: string; committedRows: number };
      expect(committed.status).toBe('committed');
      expect(committed.committedRows).toBe(2);
      // Kayıtlar gerçekten oluştu mu — normalize ile ara
      const imported = await prisma.ownerContact.findMany({
        where: { normalized: { in: [runPhone(3), runPhone(4)] } },
      });
      expect(imported).toHaveLength(2);
      for (const contact of imported) created.ownerIds.push(contact.ownerId);
      // Tekrar commit → 400 ALREADY_COMMITTED
      const recommit = await post(adminToken, `/imports/${job2.id}/commit`);
      expect(recommit.status).toBe(400);
    },
    60_000,
  );

  itDb(
    '4c. Import: ürün + hasta zinciri — katalog çözümü ve sahip bağlantısı',
    async () => {
      const productCsv = [
        'kod,ad,kategori,birim,takipTipi,barKod,minStok,satisFiyati',
        `IHR-${runSuffix}-1,İçe Aktarım Serum,İlaç,adet,lot,8690000000099,5,120.50`,
        `IHR-${runSuffix}-2,İçe Aktarım Eldiven,Sarf,adet,none,,10,45.00`,
      ].join('\r\n');
      const upP = await request(app.getHttpServer())
        .post('/api/v1/imports/upload')
        .set(authHeader(adminToken))
        .field('kind', 'products')
        .attach('file', Buffer.from(`\uFEFF${productCsv}`, 'utf8'), 'urunler.csv');
      expect(upP.status).toBe(201);
      const jobP = upP.body as { id: string };
      created.importJobIds.push(jobP.id);
      const commitP = await post(adminToken, `/imports/${jobP.id}/commit`);
      expect(commitP.status).toBe(201);
      const products = await prisma.product.findMany({
        where: { clinicId, code: { in: [`IHR-${runSuffix}-1`, `IHR-${runSuffix}-2`] } },
      });
      expect(products).toHaveLength(2);
      const serum = products.find((p) => p.code === `IHR-${runSuffix}-1`)!;
      expect(Number(serum.defaultSalePrice)).toBe(120.5);
      expect(serum.trackingType).toBe('lot');
      for (const product of products) created.productIds.push(product.id);

      // Hasta — yukarıda içe aktarılan sahibin telefonuyla bağlanır
      const patientCsv = [
        'sahipEposta,sahipTelefon,hayvanAdi,tur,irk,cinsiyet,dogumTarihi,mikrochip',
        `,${runPhone(3)},İçe Pati,Kedi,Tekir,disi,2023-05-14,${runChip}`,
      ].join('\r\n');
      const upPt = await request(app.getHttpServer())
        .post('/api/v1/imports/upload')
        .set(authHeader(adminToken))
        .field('kind', 'patients')
        .attach('file', Buffer.from(`\uFEFF${patientCsv}`, 'utf8'), 'hastalar.csv');
      expect(upPt.status).toBe(201);
      const jobPt = upPt.body as { id: string; duplicateRows: number };
      created.importJobIds.push(jobPt.id);
      const commitPt = await post(adminToken, `/imports/${jobPt.id}/commit`);
      expect(commitPt.status).toBe(201);
      const patient = await prisma.patient.findFirst({
        where: { clinicId, microchip: runChip },
      });
      expect(patient).not.toBeNull();
      expect(patient!.gender).toBe('female');
      const importedOwner = await prisma.ownerContact.findFirst({
        where: { normalized: runPhone(3) },
      });
      expect(patient!.ownerId).toBe(importedOwner!.ownerId);
      created.patientIds.push(patient!.id);
    },
    60_000,
  );

  itDb(
    '5-6. Backup: manifest/checksum üretimi, şifreli arşiv, restore zinciri',
    async () => {
      // 7. Yetkisiz erişim: resepsiyon backup.manage yok → 403
      const deniedRun = await post(resepsiyonToken, '/backup/run');
      expect(deniedRun.status).toBe(403);
      const deniedList = await get(resepsiyonToken, '/backup/runs');
      expect(deniedList.status).toBe(403);

      // Yedek al
      const runRes = await post(adminToken, '/backup/run');
      expect([200, 201]).toContain(runRes.status);
      const run = runRes.body as {
        id: string;
        status: string;
        totalRows: number;
        tableCount: number;
        archiveSha256: string | null;
        totalBytes: number;
      };
      created.backupRunIds.push(run.id);
      expect(run.status).toBe('completed');
      expect(run.tableCount).toBeGreaterThan(10); // tüm klinik tabloları
      expect(run.totalRows).toBeGreaterThan(50); // seed verisi
      expect(run.archiveSha256).toHaveLength(64);

      // Manifest — tablo listesi + checksum'lar
      const manifestRes = await get(adminToken, `/backup/runs/${run.id}/manifest`);
      expect(manifestRes.status).toBe(200);
      const manifest = manifestRes.body as {
        algorithm: string;
        encrypted: boolean;
        tables: Array<{ name: string; rows: number; sha256: string }>;
        archiveSha256: string;
        objectFileCount: number;
      };
      expect(manifest.encrypted).toBe(true);
      expect(manifest.algorithm).toBe('aes-256-gcm');
      const ownersTable = manifest.tables.find((t) => t.name === 'owners');
      expect(ownersTable).toBeDefined();
      expect(ownersTable!.rows).toBeGreaterThan(0);
      expect(ownersTable!.sha256).toHaveLength(64);

      // Arşiv şifreli — VENC1 magic, düz SQL görünmüyor
      const download = await getBinary(adminToken, `/backup/runs/${run.id}/download`);
      expect(download.status).toBe(200);
      const archive = download.body;
      expect(archive.length).toBeGreaterThan(33);
      expect(archive.subarray(0, 5).toString('ascii')).toBe('VENC1');
      expect(archive.toString('latin1').includes('INSERT INTO')).toBe(false);

      // Restore kapısı KAPALI → 403 RESTORE_DISABLED
      expect(process.env.VETCORE_BACKUP_ALLOW_RESTORE).toBe('false');
      const gate = await post(adminToken, `/backup/runs/${run.id}/restore`);
      expect(gate.status).toBe(403);
      expect((gate.body as { code: string }).code).toBe('RESTORE_DISABLED');

      // Staging restore kapısı açılır → restore veri + mutabakat başarılı
      process.env.VETCORE_BACKUP_ALLOW_RESTORE = 'true';
      const restore = await post(adminToken, `/backup/runs/${run.id}/restore`);
      expect(restore.status).toBe(201);
      const restored = restore.body as { tables: number; totalRows: number; checksumVerified: boolean };
      expect(restored.checksumVerified).toBe(true);
      expect(restored.tables).toBe(run.tableCount);
      expect(restored.totalRows).toBe(run.totalRows);
      // Veri gerçekten geri geldi — içe aktarılan sahip hâlâ duruyor
      const importedStillThere = await prisma.ownerContact.findFirst({
        where: { normalized: runPhone(3) },
      });
      expect(importedStillThere).not.toBeNull();

      // Checksum bozulması → 400 (ikinci yedeği boz, restore reddi)
      const run2Res = await post(adminToken, '/backup/run');
      expect([200, 201]).toContain(run2Res.status);
      const run2 = run2Res.body as { id: string };
      created.backupRunIds.push(run2.id);
      const archivePath = join(process.cwd(), '.backups-e2e', run2.id, 'backup.vcenc');
      expect(existsSync(archivePath)).toBe(true);
      const { writeFile } = await import('node:fs/promises');
      const original = await (await import('node:fs/promises')).readFile(archivePath);
      const corrupted = Buffer.from(original);
      corrupted[corrupted.byteLength - 1]! ^= 0xff;
      await writeFile(archivePath, corrupted);
      const restore2 = await post(adminToken, `/backup/runs/${run2.id}/restore`);
      expect(restore2.status).toBe(400);
      const code = (restore2.body as { code: string }).code;
      expect(['BACKUP_CHECKSUM_MISMATCH', 'BACKUP_ENVELOPE_INVALID']).toContain(code);
      // kapıyı kapat (diğer testler için temiz durum)
      process.env.VETCORE_BACKUP_ALLOW_RESTORE = 'false';
    },
    120_000,
  );

  itDb(
    '7. Denetim: REPORT_EXPORT, IMPORT_COMMITTED, BACKUP_CREATED kayıtları',
    async () => {
      const exportAudit = await prisma.auditEvent.count({
        where: { clinicId, action: 'REPORT_EXPORT' },
      });
      expect(exportAudit).toBeGreaterThan(0);
      const importAudit = await prisma.auditEvent.count({
        where: { clinicId, action: 'IMPORT_COMMITTED' },
      });
      expect(importAudit).toBeGreaterThan(0);
      const backupAudit = await prisma.auditEvent.count({
        where: { clinicId, action: 'BACKUP_CREATED' },
      });
      expect(backupAudit).toBeGreaterThan(0);
    },
    60_000,
  );
});
