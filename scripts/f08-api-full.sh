#!/usr/bin/env bash
# Faz 08 API regresyon — tüm API e2e süiti (gömülü PostgreSQL, tek çağrı).
# Eski fazların finalize/tüketim davranışı Faz 08 ile bozulmadığını doğular.
set -uo pipefail
cd /home/z/my-project
export DATABASE_URL="postgresql://vetcore:vetcore-dev@localhost:5433/vetcore?schema=public"

pkill -f "dev-postgres.mjs" 2>/dev/null
sleep 1
pkill -9 -f "embedded-postgres" 2>/dev/null
sleep 1
if node -e "const net=require('net');const s=net.connect(5433,'127.0.0.1');s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))" 2>/dev/null; then
  echo "Port 5433 hâlâ kullanımda — manuel temizlik gerekli"; exit 1
fi

node scripts/dev-postgres.mjs up > /tmp/pg-f08full.log 2>&1 &
PG_PID=$!
PG_UP=NO
for i in $(seq 1 90); do
  if node -e "const net=require('net');const s=net.connect(5433,'127.0.0.1');s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))" 2>/dev/null; then
    echo "PG hazır (${i}s)"; PG_UP=YES; break
  fi
  kill -0 $PG_PID 2>/dev/null || break
  sleep 1
done
if [ "$PG_UP" != "YES" ]; then echo "PG ayağa kalkmadı:"; tail -5 /tmp/pg-f08full.log; exit 1; fi

pnpm db:deploy > /tmp/f08full-migrate.log 2>&1 || { echo "MIGRATE HATASI"; tail -10 /tmp/f08full-migrate.log; kill $PG_PID; exit 1; }
pnpm db:seed > /tmp/f08full-seed.log 2>&1 || { echo "SEED HATASI"; tail -10 /tmp/f08full-seed.log; kill $PG_PID; exit 1; }
echo "Migrate + seed tamam"

pnpm --filter @vetcore/domain build > /tmp/f08full-pkg.log 2>&1 || { echo "DOMAIN BUILD HATASI"; tail -10 /tmp/f08full-pkg.log; kill $PG_PID; exit 1; }
pnpm --filter @vetcore/contracts build >> /tmp/f08full-pkg.log 2>&1 || { echo "CONTRACTS BUILD HATASI"; tail -10 /tmp/f08full-pkg.log; kill $PG_PID; exit 1; }
echo "Paket derlemeleri tamam"

pnpm --filter @vetcore/api exec vitest run
RC=$?

kill $PG_PID 2>/dev/null
pkill -f "dev-postgres.mjs" 2>/dev/null
exit $RC
