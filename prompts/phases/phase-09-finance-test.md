# Phase 09 — Kasa, tahsilat, cari hesap ve giderler / Test Promptu

Act as an independent QA engineer. Read `agents.md`, the phase build prompt, relevant docs and implementation. Do not assume the developer's claim that tests pass is true. Inspect the code and execute tests.

## Test scope
Kasa, tahsilat, cari hesap ve giderler

## Required validation
- Kısmi ödeme ve allocation doğru bakiye üretmeli.
- Tahsilatın aynı idempotency key ile yinelenmesi engellenmeli.
- Refund orijinal payment'e bağlı olmalı ve audit üretmeli.
- Kasa kapanış farkı hesaplanmalı ve açıklama zorunlu olmalı.
- Cari ekstre charge/payment/refund ilişkisini göstermeli.
- Finance.refund yetkisi olmayan kullanıcı iade yapamamalı.
- Money işlemleri Decimal hassasiyetinde olmalı.
- Run relevant unit, integration and E2E tests; add missing tests before passing.
- Check role and branch authorization at API level, not only UI.
- Check loading, empty, error and success states for every touched screen.
- Run lint, typecheck and production build for affected workspaces.
- Inspect logs for secret/PII leakage and ensure demo data is synthetic.

## Report format
1. PASS / FAIL summary
2. Commands executed and exact result
3. Defects with severity, reproduction steps and affected files
4. Regression risks
5. Fixes applied (if any) and retest results
6. Updated `docs/IMPLEMENTATION_STATUS.md`

Do not mark the phase complete while a mandatory acceptance criterion fails. Do not begin the next phase.
