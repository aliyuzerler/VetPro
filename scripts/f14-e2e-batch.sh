#!/usr/bin/env bash
# Faz 14 — Playwright E2E grup koşumu (tek tool çağrısı < 10 dk).
# Kullanım: bash scripts/f14-e2e-batch.sh e2e/shell.spec.ts e2e/auth-settings.spec.ts
# Her grup: taze gömülü PG kümesi + migrate + seed + ÖNCEDEN DERLENMİŞ API (dist)
# + Playwright (web'i kendisi başlatır). Tam zincirle aynı determinizm: DB taze.
set -uo pipefail
cd /home/z/my-project
export DATABASE_URL="postgresql://vetcore:vetcore-dev@localhost:5433/vetcore?schema=public"

echo "=== 0. Temizlik ==="
pkill -f "dev-postgres.mjs" 2>/dev/null
pkill -f "embedded-postgres" 2>/dev/null
pkill -f "bin/postgres" 2>/dev/null
pkill -f "vetcore-api" 2>/dev/null
pkill -f "dist/src/main.js" 2>/dev/null
pkill -f "next dev" 2>/dev/null
sleep 2
for PORT in 5433 4000 3000; do
  for i in $(seq 1 8); do
    node -e "const net=require('net');const s=net.connect(${PORT},'127.0.0.1');s.on('connect',()=>process.exit(0));s.on('error',()=>process.exit(1))" 2>/dev/null || break
    sleep 1
  done
  if node -e "const net=require('net');const s=net.connect(${PORT},'127.0.0.1');s.on('connect',()=>process.exit(0));s.on('error',()=>process.exit(1))" 2>/dev/null; then
    echo "HATA: Port ${PORT} hâlâ kullanımda"; exit 1
  fi
done

echo "=== 1. PostgreSQL (gömülü, taze küme) ==="
rm -rf .tmp-pg
node scripts/dev-postgres.mjs up > /tmp/pg-batch.log 2>&1 &
PG_PID=$!
PG_UP=NO
for i in $(seq 1 90); do
  if node -e "const net=require('net');const s=net.connect(5433,'127.0.0.1');s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))" 2>/dev/null; then
    echo "PG hazır (${i}s)"; PG_UP=YES; break
  fi
  kill -0 $PG_PID 2>/dev/null || { echo "PG öldü"; tail -5 /tmp/pg-batch.log; exit 1; }
  sleep 1
done
[ "$PG_UP" = "YES" ] || { echo "PG ayağa kalkmadı"; exit 1; }

echo "=== 2. Migration + Seed ==="
if ! pnpm db:deploy > /tmp/migrate-batch.log 2>&1; then
  echo "MIGRATE HATASI:"; tail -8 /tmp/migrate-batch.log; exit 1
fi
if ! pnpm db:seed > /tmp/seed-batch.log 2>&1; then
  echo "SEED HATASI:"; tail -8 /tmp/seed-batch.log; exit 1
fi
echo "Migration + seed tamam"

echo "=== 3. API (önceden derlenmiş dist) ==="
node apps/api/dist/src/main.js > /tmp/api-batch.log 2>&1 &
API_PID=$!
API_UP=NO
for i in $(seq 1 60); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api/v1/health || true)
  if [ "$CODE" = "200" ]; then echo "API hazır (${i}s)"; API_UP=YES; break; fi
  kill -0 $API_PID 2>/dev/null || { echo "API öldü"; tail -15 /tmp/api-batch.log; exit 1; }
  sleep 1
done
[ "$API_UP" = "YES" ] || { echo "API ayağa kalkmadı"; exit 1; }

echo "=== 4. Playwright (grup) ==="
cd apps/web
pnpm exec playwright test "$@"
E2E_CODE=$?
echo "=== 5. Temizlik ==="
kill $API_PID 2>/dev/null || true
kill $PG_PID 2>/dev/null || true
pkill -f "dev-postgres.mjs" 2>/dev/null || true
pkill -f "bin/postgres" 2>/dev/null || true
exit $E2E_CODE
