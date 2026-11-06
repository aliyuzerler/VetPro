# Phase 03 — Kimlik, personel, rol ve klinik ayarları / Test Promptu

Act as an independent QA engineer. Read `agents.md`, the phase build prompt, relevant docs and implementation. Do not assume the developer's claim that tests pass is true. Inspect the code and execute tests.

## Test scope
Kimlik, personel, rol ve klinik ayarları

## Required validation
- Login/refresh/logout akışı çalışmalı; refresh token rotation test edilmeli.
- Yetkisiz kullanıcı endpoint'e doğrudan erişememeli.
- Şube A kullanıcısı Şube B kapsamındaki kısıtlı kaydı okuyamamalı.
- Permission matrix en az clinical.sign, inventory.adjust, finance.refund, reports.export, audit.view alanlarını içermeli.
- Yetki değişiklikleri audit'e yazılmalı.
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
