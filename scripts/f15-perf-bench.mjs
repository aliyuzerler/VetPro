#!/usr/bin/env node
/**
 * Faz 15 — API performans ölçümü (test ortamı, gömülü PostgreSQL).
 *
 * Yöntem:
 *  1. Ölçek verisi: generate_series ile sentetik 12.000 sahip + 10.000 hasta +
 *     200 ürün + 60.000 stok defteri satırı (deterministik, tek SQL — hızlı).
 *  2. Derlenmiş API (dist/main.js) localhost:4000'de açılır (bu betikten önce).
 *  3. Ortak okuma/arama uçları N kez koşulur; p50/p95/max raporlanır.
 *
 * Hedefler (docs/PERFORMANCE.md): ortak okuma p95 < 400 ms, arama p95 < 500 ms.
 * NOT: sandbox donanımı müşteri donanımı değildir; mutlak değerler yönlendirme
 * içindir — doğrulama kurulum donanımında INSTALL.md akışıyla yeniden yapılır.
 */
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { exit } from 'node:process';

const BASE = process.env.PERF_BASE_URL ?? 'http://localhost:4000';
const N_REQ = Number(process.env.PERF_N ?? 40);
const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ??
        'postgresql://vetcore:vetcore-dev@localhost:5433/vetcore?schema=public',
    },
  },
});

async function scaleSeed(clinicId, branchId) {
  const existing = await prisma.patient.count({
    where: { clinicId, name: { startsWith: 'Bench' } },
  });
  if (existing >= 10_000) {
    console.log(`[scale] ölçek verisi zaten mevcut (${existing} hasta) — atlanır`);
    return;
  }
  console.log('[scale] ölçek verisi üretiliyor: 12k sahip, 10k hasta, 200 ürün, 60k hareket...');

  // Sahipler (12k) — Owner tablosunda telefon/e-posta kolonları yoktur
  // (iletişim OwnerContacts ilişkisidir); benzersiz ad kombinasyonu yeterlidir.
  await prisma.$executeRaw`
    INSERT INTO owners (id, clinic_id, first_name, last_name, created_at, updated_at)
    SELECT gen_random_uuid(), ${clinicId}::uuid,
           'Bench' || (ARRAY['Zeynep','Ahmet','Elif','Mehmet','Ayşe','Mustafa','Fatma','Emre','Deniz','Selin'])[1 + (i % 10)],
           (ARRAY['Yılmaz','Demir','Kaya','Şahin','Çelik','Aydın','Arslan','Doğan'])[1 + (i % 8)] || ' ' || lpad(i::text, 5, '0'),
           now(), now()
    FROM generate_series(0, 11999) AS i`;

  // Hastalar (10k) — species klinik-scope'suz genel katalogtur.
  await prisma.$executeRaw`
    INSERT INTO patients (id, clinic_id, branch_id, owner_id, species_id, name, code, gender, created_at, updated_at)
    SELECT gen_random_uuid(), ${clinicId}::uuid, ${branchId}::uuid, o.id, s.id,
           'Bench' || (ARRAY['Pamuk','Karabaş','Duman','Minnoş','Tekir','Boncuk','Paşa','Limon'])[1 + (i % 8)] || i,
           'BCH-' || lpad(i::text, 6, '0'), 'unknown', now(), now()
    FROM generate_series(0, 9999) AS i
    JOIN owners o ON o.last_name LIKE '% ' || lpad(i::text, 5, '0')
    CROSS JOIN (SELECT id FROM species ORDER BY created_at LIMIT 1) s`;

  // Ürünler (200)
  await prisma.$executeRaw`
    INSERT INTO products (id, clinic_id, code, name, tracking_type, base_unit_id, min_stock, active, created_at, updated_at)
    SELECT gen_random_uuid(), ${clinicId}::uuid,
           'BPRD-' || lpad(i::text, 4, '0'), 'BenchÜrün-' || i, 'none', u.id, 0, true, now(), now()
    FROM generate_series(0, 199) AS i
    CROSS JOIN (SELECT id FROM units WHERE clinic_id = ${clinicId}::uuid ORDER BY key LIMIT 1) u`;

  // Stok hareketleri (60k) — depo: şubenin ilk deposu (warehouses.branch_id).
  await prisma.$executeRaw`
    INSERT INTO stock_movements (id, clinic_id, branch_id, warehouse_id, kind, status, ref_type, posted_at, created_at)
    SELECT gen_random_uuid(), ${clinicId}::uuid, ${branchId}::uuid, w.id, 'in', 'posted', 'Benchmark', now(), now()
    FROM generate_series(0, 59999) AS i
    CROSS JOIN (SELECT id FROM warehouses WHERE branch_id = ${branchId}::uuid ORDER BY created_at LIMIT 1) w`;

  // Bulk yükleme sonrası planner istatistiği: ANALYZE olmadan _count alt sorgusu
  // patolojik plan seçebilir (Faz 15 slow-query review bulgusu — ölçümün kendisi
  // değil, üretimde restore/import sonrası da geçerli; bkz. docs/PERFORMANCE.md).
  await prisma.$executeRawUnsafe(`ANALYZE owners`);
  await prisma.$executeRawUnsafe(`ANALYZE patients`);
  await prisma.$executeRawUnsafe(`ANALYZE stock_movements`);
  await prisma.$executeRawUnsafe(`ANALYZE products`);

  console.log('[scale] tamam');
}

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100));
  return sorted[idx];
}

async function main() {
  const clinic = await prisma.clinic.findFirst({ where: { slug: 'vetcore-demo' } });
  if (!clinic) throw new Error('seed klinik yok — önce pnpm db:seed');
  const branch = await prisma.branch.findFirst({ where: { clinicId: clinic.id, code: 'MRKZ' } });
  if (!branch) throw new Error('seed şube yok');
  await scaleSeed(clinic.id, branch.id);

  const loginRes = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@vetcore-demo.example', password: 'VetCore2026!' }),
  });
  if (!loginRes.ok) throw new Error(`login başarısız: ${loginRes.status}`);
  const { accessToken } = await loginRes.json();
  const auth = { Authorization: `Bearer ${accessToken}` };

  const samplePatient = await prisma.patient.findFirst({
    where: { clinicId: clinic.id, name: { startsWith: 'Bench' } },
    select: { id: true },
  });
  if (!samplePatient) throw new Error('ölçek hastası yok');

  const scenarios = [
    { name: 'hasta listesi (take=25)', path: '/patients?take=25' },
    { name: 'hasta arama (search=Bench)', path: '/patients?search=Bench&take=25' },
    { name: 'hasta detay (id)', path: `/patients/${samplePatient.id}` },
    { name: 'sahip arama (search=Bench)', path: '/owners?search=Bench&take=25' },
    { name: 'ürün arama (search=Bench)', path: '/products?search=Bench&take=25' },
    { name: 'stok hareket listesi (take=25)', path: '/stock/movements?take=25' },
  ];

  const report = [];
  console.log(`\n== Performans ölçümü (N=${N_REQ} istek/senaryo, test ortamı) ==`);
  for (const scenario of scenarios) {
    // ısınma (ilk derleme/bağlantı etkisi hariç tutulur)
    const warm = await fetch(`${BASE}/api/v1${scenario.path}`, { headers: auth });
    if (!warm.ok) throw new Error(`${scenario.path} ısınma → ${warm.status}`);
    const durations = [];
    for (let i = 0; i < N_REQ; i += 1) {
      const t0 = performance.now();
      const res = await fetch(`${BASE}/api/v1${scenario.path}`, { headers: auth });
      const t1 = performance.now();
      if (!res.ok) throw new Error(`${scenario.path} → ${res.status}`);
      durations.push(t1 - t0);
      if (t1 - t0 > 1000) {
        console.log(
          `   [yavaş] ${scenario.name} #${i}: ${(t1 - t0).toFixed(0)}ms @ ${new Date().toISOString()}`,
        );
      }
    }
    durations.sort((a, b) => a - b);
    const row = {
      scenario: scenario.name,
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      max: durations[durations.length - 1],
      avg: durations.reduce((s, d) => s + d, 0) / durations.length,
    };
    report.push(row);
    console.log(
      `${scenario.name.padEnd(36)} p50=${row.p50.toFixed(0).padStart(5)}ms  p95=${row.p95.toFixed(0).padStart(5)}ms  avg=${row.avg.toFixed(0).padStart(5)}ms  max=${row.max.toFixed(0).padStart(6)}ms`,
    );
  }

  mkdirSync('/tmp/f15', { recursive: true });
  writeFileSync('/tmp/f15/perf-report.json', JSON.stringify(report, null, 2));
  console.log('\nRapor: /tmp/f15/perf-report.json');
}

main()
  .catch((err) => {
    console.error('PERF HATASI:', err.message);
    exit(1);
  })
  .finally(() => prisma.$disconnect());
