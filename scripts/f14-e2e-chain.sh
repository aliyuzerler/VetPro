#!/usr/bin/env bash
# Faz 11 — Playwright E2E zinciri (tüm spec dosyaları; tek çağrıda).
# 0) eski süreç temizliği  1) gömülü PostgreSQL  2) migrate+seed  3) API  4) health bekle  5) Playwright
set -uo pipefail
cd /home/z/my-project

export DATABASE_URL="postgresql://vetcore:vetcore-dev@localhost:5433/vetcore?schema=public"

echo "=== 0. Eski süreç temizliği ==="
pkill -f "dev-postgres.mjs" 2>/dev/null
pkill -f "embedded-postgres" 2>/dev/null
pkill -f "bin/postgres" 2>/dev/null
pkill -f "vetcore-api" 2>/dev/null
pkill -f "nest start" 2>/dev/null
pkill -f "apps/api" 2>/dev/null
sleep 3
for PORT in 5433 4000; do
  for i in $(seq 1 10); do
    node -e "const net=require('net');const s=net.connect(${PORT},'127.0.0.1');s.on('connect',()=>process.exit(0));s.on('error',()=>process.exit(1))" 2>/dev/null || { echo "Port ${PORT} boş"; break; }
    sleep 1
  done
  # Port hâlâ dinlemedeyse bayat veritabanı/uygulamayla koşmak determinizmi bozar — sert çık.
  if node -e "const net=require('net');const s=net.connect(${PORT},'127.0.0.1');s.on('connect',()=>process.exit(0));s.on('error',()=>process.exit(1))" 2>/dev/null; then
    echo "HATA: Port ${PORT} hâlâ kullanımda — bayat süreç kapatılamadı"; exit 1
  fi
done

echo "=== 1. PostgreSQL (gömülü, taze küme) ==="
rm -rf .tmp-pg
node scripts/dev-postgres.mjs up > /tmp/pg-e2e.log 2>&1 &
PG_PID=$!
PG_UP=NO
for i in $(seq 1 150); do
  if node -e "const net=require('net');const s=net.connect(5433,'127.0.0.1');s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))" 2>/dev/null; then
    echo "PostgreSQL portu hazır (${i}s)"; PG_UP=YES; break
  fi
  # Süreç erken öldüyse beklemeden çık
  kill -0 $PG_PID 2>/dev/null || { echo "PG süreci öldü"; break; }
  sleep 1
done
if [ "$PG_UP" != "YES" ]; then echo "PG ayağa kalkmadı:"; tail -5 /tmp/pg-e2e.log; exit 1; fi

echo "=== 2. Migration + Seed (gerçek sorgu doğrulaması) ==="
if ! pnpm db:deploy > /tmp/migrate.log 2>&1; then
  echo "MIGRATE HATASI:"; tail -10 /tmp/migrate.log; exit 1
fi
tail -2 /tmp/migrate.log
if ! pnpm db:seed > /tmp/seed.log 2>&1; then
  echo "SEED HATASI:"; tail -10 /tmp/seed.log; exit 1
fi
tail -5 /tmp/seed.log

echo "=== 2b. Paylaşılan paketler (dist) ==="
pnpm --filter @vetcore/domain build > /tmp/pkg-build.log 2>&1 || { echo "DOMAIN BUILD HATASI"; tail -10 /tmp/pkg-build.log; exit 1; }
pnpm --filter @vetcore/contracts build >> /tmp/pkg-build.log 2>&1 || { echo "CONTRACTS BUILD HATASI"; tail -10 /tmp/pkg-build.log; exit 1; }
pnpm --filter @vetcore/ui-tokens build >> /tmp/pkg-build.log 2>&1 || { echo "UI-TOKENS BUILD HATASI"; tail -10 /tmp/pkg-build.log; exit 1; }
echo "Paket derlemeleri tamam"

echo "=== 3. API (port 4000) ==="
nohup pnpm --filter @vetcore/api dev > /tmp/api-e2e.log 2>&1 &
API_PID=$!
API_UP=NO
for i in $(seq 1 120); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api/v1/health || true)
  if [ "$CODE" = "200" ]; then echo "API hazır (${i}s): HTTP $CODE"; API_UP=YES; break; fi
  kill -0 $API_PID 2>/dev/null || { echo "API süreci öldü"; tail -15 /tmp/api-e2e.log; break; }
  sleep 1
done
if [ "$API_UP" != "YES" ]; then echo "API ayağa kalkmadı"; exit 1; fi
echo "Readiness:"; curl -s http://localhost:4000/api/v1/health/readiness | head -c 200; echo

echo "=== 4. Playwright E2E ==="
set -e
# E2E_FILTER verilirse yalnız o testler koşar (hata ayıklama için)
if [ -n "${E2E_FILTER:-}" ]; then
  pnpm --filter @vetcore/web exec playwright test ${E2E_FILTER}
else
  pnpm --filter @vetcore/web e2e
fi
E2E_CODE=$?
set +e

echo "=== 5. Temizlik ==="
kill $API_PID 2>/dev/null || true
kill $PG_PID 2>/dev/null || true
pkill -f "dev-postgres.mjs" 2>/dev/null || true
pkill -f "bin/postgres" 2>/dev/null || true
exit $E2E_CODE
