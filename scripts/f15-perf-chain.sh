#!/usr/bin/env bash
# Faz 15 — performans ölçüm zinciri: gömülü PG + migrate + seed + API + bench.
set -uo pipefail
cd /home/z/my-project
export PATH="/home/z/.npm-global/bin:$PATH"
export DATABASE_URL="postgresql://vetcore:vetcore-dev@localhost:5433/vetcore?schema=public"

pkill -f "dev-postgres.mjs" 2>/dev/null
sleep 1
pkill -9 -f "embedded-postgres" 2>/dev/null
sleep 1
pkill -f "bin/postgres" 2>/dev/null
sleep 1

rm -rf .tmp-pg
node scripts/dev-postgres.mjs up > /tmp/pg-f15.log 2>&1 &
PG_PID=$!
PG_UP=NO
for i in $(seq 1 90); do
  if node -e "const net=require('net');const s=net.connect(5433,'127.0.0.1');s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))" 2>/dev/null; then
    echo "PG hazır (${i}s)"; PG_UP=YES; break
  fi
  kill -0 $PG_PID 2>/dev/null || break
  sleep 1
done
if [ "$PG_UP" != "YES" ]; then echo "PG ayağa kalkmadı:"; tail -5 /tmp/pg-f15.log; exit 1; fi

pnpm db:deploy > /tmp/f15-migrate.log 2>&1 || { echo "MIGRATE HATASI"; tail -10 /tmp/f15-migrate.log; kill $PG_PID; exit 1; }
pnpm db:seed > /tmp/f15-seed.log 2>&1 || { echo "SEED HATASI"; tail -10 /tmp/f15-seed.log; kill $PG_PID; exit 1; }
echo "migrate + seed tamam"

pnpm --filter @vetcore/api build > /tmp/f15-api-build.log 2>&1 || { echo "API BUILD HATASI"; tail -10 /tmp/f15-api-build.log; kill $PG_PID; exit 1; }
echo "API derlendi"

PORT=4000 node apps/api/dist/src/main.js > /tmp/f15-api.log 2>&1 &
API_PID=$!
API_UP=NO
for i in $(seq 1 45); do
  if curl -sf http://localhost:4000/api/v1/health > /dev/null 2>&1; then
    echo "API hazır (${i}s)"; API_UP=YES; break
  fi
  sleep 1
done
if [ "$API_UP" != "YES" ]; then echo "API ayağa kalkmadı:"; tail -15 /tmp/f15-api.log; kill $PG_PID $API_PID; exit 1; fi

node scripts/f15-perf-bench.mjs
RC=$?

kill $API_PID 2>/dev/null
kill $PG_PID 2>/dev/null
pkill -f "bin/postgres" 2>/dev/null
exit $RC
