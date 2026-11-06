# Phase 12 — Bildirim, PDF belgeler ve entegrasyon adaptörleri / Test Promptu

Act as an independent QA engineer. Read `agents.md`, the phase build prompt, relevant docs and implementation. Do not assume the developer's claim that tests pass is true. Inspect the code and execute tests.

## Test scope
Bildirim, PDF belgeler ve entegrasyon adaptörleri

## Required validation
- Notification job retry duplicate message üretmemeli.
- İletişim tercihi/izin kuralı kontrol edilmeli.
- PDF Türkçe karakter ve clinic branding testini geçmeli.
- Prescription PDF imza/authorized status bilgisini doğru göstermeli.
- Provider secret web/mobile bundle'a girmemeli.
- Provider başarısızlığı klinik ana işlemini bozmayıp retryable status üretmeli.
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
