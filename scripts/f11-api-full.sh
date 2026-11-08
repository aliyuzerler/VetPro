#!/usr/bin/env bash
# Faz 11 — tam API test süiti (gömülü PostgreSQL üzerinde tüm vitest dosyaları).
set -uo pipefail
cd /home/z/my-project
export DATABASE_URL="postgresql://vetcore:vetcore-dev@localhost:5433/vetcore?schema=public"

pkill -f "dev-postgres.mjs" 2>/dev/null
sleep 1
pkill -9 -f "embedded-postgres" 2>/dev/null
sleep 1
pkill -f "bin/postgres" 2>/dev/null
sleep 1
if node -e "const net=require('net');const s=net.connect(5433,'127.0.0.1');s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))" 2>/dev/null; then
  echo "Port 5433 hâlâ kullanımda"; exit 1
fi

node scripts/dev-postgres.mjs up > /tmp/pg-f11full.log 2>&1 &
PG_PID=$!
for i in $(seq 1 90); do
  if node -e "const net=require('net');const s=net.connect(5433,'127.0.0.1');s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))" 2>/dev/null; then
    echo "PG hazır (${i}s)"; break
  fi
  kill -0 $PG_PID 2>/dev/null || { echo "PG öldü"; tail -5 /tmp/pg-f11full.log; exit 1; }
  sleep 1
done

pnpm db:deploy > /tmp/f11full-migrate.log 2>&1 || { echo "MIGRATE HATASI"; tail -10 /tmp/f11full-migrate.log; kill $PG_PID; exit 1; }
pnpm db:seed > /tmp/f11full-seed.log 2>&1 || { echo "SEED HATASI"; tail -10 /tmp/f11full-seed.log; kill $PG_PID; exit 1; }

pnpm --filter @vetcore/api exec vitest run
RC=$?

kill $PG_PID 2>/dev/null
pkill -f "dev-postgres.mjs" 2>/dev/null
pkill -f "bin/postgres" 2>/dev/null
exit $RC
