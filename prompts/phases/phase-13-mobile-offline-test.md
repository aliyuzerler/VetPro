# Phase 13 — React Native klinik personel uygulaması ve offline senkronizasyon / Test Promptu

Act as an independent QA engineer. Read `agents.md`, the phase build prompt, relevant docs and implementation. Do not assume the developer's claim that tests pass is true. Inspect the code and execute tests.

## Test scope
React Native klinik personel uygulaması ve offline senkronizasyon

## Required validation
- Mobil login/refresh ve session revoke çalışmalı.
- Offline iken encounter draft ve fotoğraf metadata'sı kaybolmamalı.
- Uygulama kapanıp açılınca queued draft kalmalı.
- Reconnect sonrası accepted operation server ID/version ile sync edilmeli.
- Aynı outbox item yeniden gönderilince duplicate service/payment/stock oluşmamalı.
- Conflict ekranı iki versiyonu korumalı; sessiz overwrite olmamalı.
- Financial/stock finalize server onayı olmadan posted görünmemeli.
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
