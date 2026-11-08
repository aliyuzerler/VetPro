#!/usr/bin/env node
/* Faz 15 tanılama — sahip arama yavaşlığını izole eder (per-istek süre + EXPLAIN). */
import { PrismaClient } from '@prisma/client';
import { exit } from 'node:process';

const BASE = 'http://localhost:4000';
const prisma = new PrismaClient();

async function main() {
  const loginRes = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@vetcore-demo.example', password: 'VetCore2026!' }),
  });
  const { accessToken } = await loginRes.json();
  const auth = { Authorization: `Bearer ${accessToken}` };

  console.log('== sahip arama per-istek süre ==');
  for (let i = 0; i < 15; i += 1) {
    const t0 = performance.now();
    const res = await fetch(`${BASE}/api/v1/owners?search=Bench&take=25`, { headers: auth });
    const t1 = performance.now();
    const ok = res.ok;
    console.log(`${String(i).padStart(2)}: ${(t1 - t0).toFixed(0)}ms ok=${ok}`);
    if (t1 - t0 > 2000) {
      const text = await res.text();
      console.log('   slow body size:', text.length);
    }
  }

  console.log('\n== EXPLAIN (ölçek tablosu) ==');
  const plan = await prisma.$queryRawUnsafe(
    `EXPLAIN ANALYZE SELECT o.id FROM owners o WHERE o.clinic_id = (SELECT id FROM clinics WHERE slug='vetcore-demo') AND o.archived_at IS NULL AND (o.first_name ILIKE '%bench%' OR o.last_name ILIKE '%bench%') ORDER BY o.last_name ASC, o.first_name ASC LIMIT 25`,
  );
  for (const row of plan) console.log(' ', row['QUERY PLAN']);
}

main()
  .catch((e) => {
    console.error('ERR', e.message);
    exit(1);
  })
  .finally(() => prisma.$disconnect());
