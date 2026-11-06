# Phase 08 — Hizmet → stok → ücret atomik iş akışı / Test Promptu

Act as an independent QA engineer. Read `agents.md`, the phase build prompt, relevant docs and implementation. Do not assume the developer's claim that tests pass is true. Inspect the code and execute tests.

## Test scope
Hizmet → stok → ücret atomik iş akışı

## Required validation
- Başarılı hizmet finalizasyonu klinik kaydı, stok düşümü ve ücret satırını birlikte oluşturmalı.
- Stok hareketi yazma hatası tüm transaction'ı rollback etmeli.
- Aynı idempotency key ile tekrar çağrı duplicate yaratmamalı.
- Son ürünü iki eşzamanlı istekten en fazla biri tüketebilmeli.
- Lot no, expiry ve kaynak service record hareket üzerinde izlenebilmeli.
- Reversal orijinal hareketi silmeden ters hareket oluşturmalı.
- Yetkisiz kullanıcı finalization/reversal yapamamalı.
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
