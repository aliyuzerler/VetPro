# Phase 13 — React Native klinik personel uygulaması ve offline senkronizasyon / Geliştirme Promptu

You are continuing the VetCore project. Read `agents.md`, `README.md`, all relevant `docs/`, `design/` and `rules/` first. Inspect the current repository and implementation status before changing files.

## Goal
React Native klinik personel uygulaması ve offline senkronizasyon

## Instructions
Mobile app'i gerçek API'ye bağla. Login, branch select, Today agenda, patient search/summary, appointment actions, encounter draft, SOAP/vitals, camera/media attachments, vaccine reminders, tasks, stock quick lookup, push notifications ve sync center ekranlarını tamamla. Expo SQLite cache/outbox, client_operation_id, delta pull cursor, conflict/rejected state, retry/backoff, upload queue ve app restart recovery geliştir. Klinik/finance/stock finalization server-confirmed olmalı; offline state bunu finalized gibi göstermemeli.

## Acceptance criteria
- Mobil login/refresh ve session revoke çalışmalı.
- Offline iken encounter draft ve fotoğraf metadata'sı kaybolmamalı.
- Uygulama kapanıp açılınca queued draft kalmalı.
- Reconnect sonrası accepted operation server ID/version ile sync edilmeli.
- Aynı outbox item yeniden gönderilince duplicate service/payment/stock oluşmamalı.
- Conflict ekranı iki versiyonu korumalı; sessiz overwrite olmamalı.
- Financial/stock finalize server onayı olmadan posted görünmemeli.

## Required output
- Implement the complete scope; do not just describe it.
- Add/update migrations, API contracts, UI and automated tests as applicable.
- Run formatter, lint, typecheck, unit/integration tests and relevant build commands.
- Update `docs/IMPLEMENTATION_STATUS.md`, `CHANGELOG.md`, README and decisions as needed.
- Report changed files, commands/results, known limitations and any manual validation needed.
- Do not start the next phase.
