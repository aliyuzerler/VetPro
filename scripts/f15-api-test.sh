#!/usr/bin/env bash
# Faz 15 — API tam süit (gömülü PG üzerinde, tek çağrıda: vitest DB-bağımlı testler dâhil).
set -uo pipefail
cd /home/z/my-project
export PATH="/home/z/.npm-global/bin:$PATH"
export DATABASE_URL="postgresql://vetcore:vetcore-dev@localhost:5433/vetcore?schema=public"

echo "=== 0. Temizlik ==="
pkill -f "dev-postgres.mjs" 2>/dev/null
pkill -9 -f "embedded-postgres" 2>/dev/null
pkill -f "bin/postgres" 2>/dev/null
sleep 2
rm -rf .tmp-pg

echo "=== 1. PostgreSQL ==="
node scripts/dev-postgres.mjs up > /tmp/pg-f15test.log 2>&1 &
PG_PID=$!
PG_UP=NO
for i in $(seq 1 90); do
  if node -e "const net=require('net');const s=net.connect(5433,'127.0.0.1');s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))" 2>/dev/null; then
    echo "PG hazır (${i}s)"; PG_UP=YES; break
  fi
  kill -0 $PG_PID 2>/dev/null || { echo "PG öldü"; tail -5 /tmp/pg-f15test.log; exit 1; }
  sleep 1
done
[ "$PG_UP" = "YES" ] || { echo "PG ayağa kalkmadı"; exit 1; }

echo "=== 2. Migration + Seed ==="
pnpm db:deploy > /tmp/f15-migrate.log 2>&1 || { echo "MIGRATE HATASI"; tail -8 /tmp/f15-migrate.log; exit 1; }
pnpm db:seed > /tmp/f15-seed.log 2>&1 || { echo "SEED HATASI"; tail -8 /tmp/f15-seed.log; exit 1; }
echo "Migration + seed tamam"

echo "=== 3. API tam süit (vitest) ==="
pnpm --filter @vetcore/api test
RC=$?

echo "=== 4. Temizlik ==="
kill $PG_PID 2>/dev/null || true
pkill -f "dev-postgres.mjs" 2>/dev/null || true
pkill -f "bin/postgres" 2>/dev/null || true
exit $RC
