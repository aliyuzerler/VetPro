# Phase 05 — Randevu takvimi ve klinik akış panosu / Test Promptu

Act as an independent QA engineer. Read `agents.md`, the phase build prompt, relevant docs and implementation. Do not assume the developer's claim that tests pass is true. Inspect the code and execute tests.

## Test scope
Randevu takvimi ve klinik akış panosu

## Required validation
- Aynı hekim/oda için çakışan aktif randevu engellenmeli.
- Çalışma saati dışı randevu policy'ye göre reddedilmeli veya yetkili override istemeli.
- Durum geçişleri geçersiz sırada yapılamamalı.
- Check-in flowboard'a yansımalı.
- Branch ve staff filtreleri API'de uygulanmalı.
- Saat dilimi Europe/Istanbul testi geçmeli.
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
