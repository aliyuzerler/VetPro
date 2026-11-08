#!/usr/bin/env bash
# Faz 15 — gizli bilgi (secret) taraması.
# Takip edilen dosyalarda bilinen anahtar/bilet desenlerini arar.
# Çıkış kodu 0 = temiz, 1 = bulgu var (CI kapısı olarak kullanılır).
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

# Yanlış pozitif filtresi: belgelenmiş sentetik demo değerleri ve şablonlar.
ALLOWED_PATTERNS=(
  'VetCore2026!'        # seed/demo şifresi — belgelenmiş sentetik değer
  'change-me'           # şablon yer tutucu
  'dev-only'            # geliştirme varsayılanı (üretimde parseEnv reddeder)
  'vetcore-dev'         # yerel gömülü PostgreSQL geliştirme parolası
  'vetcore-test-secret' # test sabiti
  'f15-license-signing-key' # test sabiti
)

PATTERNS=(
  'ghp_[A-Za-z0-9]{20,}'        # GitHub PAT
  'github_pat_[A-Za-z0-9_]{20,}' # fine-grained PAT
  'sk_live_[A-Za-z0-9]{10,}'    # canlı ödeme anahtarı
  'AKIA[0-9A-Z]{16}'            # AWS access key
  'AIza[0-9A-Za-z_-]{30,}'      # Google API key
  'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY'
  'xox[bpars]-[A-Za-z0-9-]{10,}' # Slack token
  'eyJhbGciOi[A-Za-z0-9_-]{30,}' # JWT gövdesi (depoya gömülü olmamalı)
)

echo "== Secret taraması (git HEAD ağacı) =="
FINDINGS=0
for pattern in "${PATTERNS[@]}"; do
  matches=$(git grep -E -n "$pattern" HEAD -- . 2>/dev/null || true)
  if [ -n "$matches" ]; then
    echo "!! BULGU: $pattern"
    echo "$matches" | head -5
    FINDINGS=$((FINDINGS + 1))
  fi
done

echo "== Yanlış pozitif denetimi =="
for allowed in "${ALLOWED_PATTERNS[@]}"; do
  count=$(git grep -F -c "$allowed" HEAD -- . 2>/dev/null | wc -l)
  if [ "$count" -gt 0 ]; then
    echo "   belgelenmiş/sentetik: '$allowed' (${count} dosya) — kabul"
  fi
done

if [ "$FINDINGS" -gt 0 ]; then
  echo "SONUÇ: ${FINDINGS} desen bulgusu — temizlenmeden yayınlanamaz"
  exit 1
fi
echo "SONUÇ: temiz"
exit 0
