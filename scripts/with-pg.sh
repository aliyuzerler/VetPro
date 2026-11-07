#!/usr/bin/env bash
# Tek çağrıda: gömülü PostgreSQL başlat → komutu çalıştır → kapat.
# Süreçler tool çağrıları arasında öldürüldüğü için DB gerektiren her komut
# bu sarmalayıcıyla çalışır (e2e-chain.sh ile aynı desen).
# Kullanım: bash scripts/with-pg.sh <command...>
# RESET=1 ile taze küme (rm -rf .tmp-pg) ile başlar.
set -uo pipefail
cd /home/z/my-project
export DATABASE_URL="postgresql://vetcore:vetcore-dev@localhost:5433/vetcore?schema=public"

# Önceki kalıntıları temizle
pkill -f "dev-postgres.mjs" 2>/dev/null
pkill -f "bin/postgres" 2>/dev/null
sleep 1
if [ "${RESET:-0}" = "1" ]; then
  rm -rf .tmp-pg
fi

node scripts/dev-postgres.mjs up > /tmp/pg-with.log 2>&1 &
PG_PID=$!
PG_UP=NO
for i in $(seq 1 90); do
  if node -e "const net=require('net');const s=net.connect(5433,'127.0.0.1');s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))" 2>/dev/null; then
    PG_UP=YES
    break
  fi
  kill -0 $PG_PID 2>/dev/null || break
  sleep 1
done
if [ "$PG_UP" != "YES" ]; then
  echo "PG ayağa kalkmadı:"
  tail -5 /tmp/pg-with.log
  exit 1
fi

"$@"
RC=$?

kill $PG_PID 2>/dev/null
pkill -f "dev-postgres.mjs" 2>/dev/null
pkill -f "bin/postgres" 2>/dev/null
exit $RC
