#!/usr/bin/env bash
# Faz 04 — Storybook doğrulama zinciri (tek çağrıda; süreçler tool çağrıları arasında ölür).
# 1) storybook:build  2) statik sunucu (6006)  3) test-runner (render + play + axe)
# 4) ekran görüntüleri (docs/screenshots/storybook)  5) temizlik
set -uo pipefail
cd /home/z/my-project

echo "=== 1. Storybook statik derleme ==="
if ! pnpm --filter @vetcore/web storybook:build > /tmp/sb-build.log 2>&1; then
  echo "BUILD HATASI:"; tail -25 /tmp/sb-build.log; exit 1
fi
tail -3 /tmp/sb-build.log

echo "=== 2. Statik sunucu (127.0.0.1:6006) ==="
pkill -f "http.server 6006" 2>/dev/null
sleep 1
python3 -m http.server 6006 --directory apps/web/storybook-static --bind 127.0.0.1 > /tmp/sb-serve.log 2>&1 &
SERVER_PID=$!
SB_UP=NO
for i in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:6006/index.json || true)
  if [ "$CODE" = "200" ]; then echo "Sunucu hazır (${i}s)"; SB_UP=YES; break; fi
  sleep 1
done
if [ "$SB_UP" != "YES" ]; then echo "Sunucu ayağa kalkmadı"; kill $SERVER_PID 2>/dev/null; exit 1; fi

echo "=== 3. test-runner (render smoke + play + axe) ==="
cd apps/web
set +e
pnpm exec test-storybook --index-json > /tmp/sb-test.log 2>&1
TEST_CODE=$?
set -e
cd ../..
tail -12 /tmp/sb-test.log

echo "=== 4. Ekran görüntüleri ==="
node scripts/storybook-screenshots.mjs > /tmp/sb-shots.log 2>&1
tail -4 /tmp/sb-shots.log

echo "=== 5. Temizlik ==="
kill $SERVER_PID 2>/dev/null
pkill -f "http.server 6006" 2>/dev/null
exit $TEST_CODE
