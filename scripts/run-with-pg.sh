#!/usr/bin/env bash
# Faz 13 — sandbox'ta arka plan süreçleri tool çağrıları arasında ölündüğü için
# PostgreSQL'i tek komutluk ömre başlatır: `run-with-pg.sh <komut...>`
# Stale postmaster.pid temizliği + hazır oluncaya kadar bekleme içerir.
set -u
cd "$(dirname "$0")/.."

# Sandbox tuzağı: shell ortamında exportlu "DATABASE_URL=file:...db" (SQLite
# şablonu) varsayılanı ezer; bu betik her koşulda PostgreSQL URL'ini dayatır.
export DATABASE_URL="postgresql://vetcore:vetcore-dev@localhost:5433/vetcore?schema=public"
PGCTL=node_modules/@embedded-postgres/linux-x64/native/bin/pg_ctl
DATA=.tmp-pg/data

# 1) Bayat pid dosyası: süreç gerçekten yoksa temizle
if [ -f "$DATA/postmaster.pid" ]; then
  PID=$(head -1 "$DATA/postmaster.pid" 2>/dev/null || true)
  if ! kill -0 "$PID" 2>/dev/null; then
    rm -f "$DATA/postmaster.pid"
  fi
fi

# 2) Sunucu çalışmıyorsa başlat (setsid: komut bitse de yaşamaya devam etsin)
STARTED=0
if ! "$PGCTL" -D "$DATA" status > /dev/null 2>&1; then
  setsid nohup node scripts/dev-postgres.mjs up > /tmp/pg.log 2>&1 < /dev/null &
  STARTED=1
fi

# 3) Gerçek SQL probe'u ile hazır oluncaya kadar bekle (en çok 60 sn).
#    Socket dinlemesi WAL recovery bitmeden açılır; net.connect yeterli değildir.
SQL_PROBE=1
for _ in $(seq 1 60); do
  if node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.\$queryRaw\`SELECT 1\`.then(()=>process.exit(0)).catch(()=>process.exit(1));
setTimeout(()=>process.exit(1),2000);" 2>/dev/null; then
    SQL_PROBE=0
    break
  fi
  sleep 1
done

if [ "$SQL_PROBE" = "1" ]; then
  echo "[with-pg] DB hazır olmadı"; tail -20 /tmp/pg.log; exit 1
fi
echo "[with-pg] DB hazır"

# 4) İş yükünü çalıştır
"$@"
CODE=$?

# 5) Kendi başlattıysak düzgün indir (sonraki çağrıda stale pid kalmasın)
if [ "$STARTED" = "1" ]; then
  "$PGCTL" -D "$DATA" -m fast stop > /dev/null 2>&1 || true
fi
exit $CODE
