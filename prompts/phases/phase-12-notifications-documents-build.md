# Phase 12 — Bildirim, PDF belgeler ve entegrasyon adaptörleri / Geliştirme Promptu

You are continuing the VetCore project. Read `agents.md`, `README.md`, all relevant `docs/`, `design/` and `rules/` first. Inspect the current repository and implementation status before changing files.

## Goal
Bildirim, PDF belgeler ve entegrasyon adaptörleri

## Instructions
Notification, NotificationAttempt, IntegrationConnection, template ve print document modellerini geliştir. İç bildirim merkezi, push adapter, SMS/email/WhatsApp provider interface, randevu/aşı/hatırlatma şablonları, kuyruk, retry/dead-letter ve teslim raporu oluştur. Klinik logosu ve Türkçe karakter destekli PDF çıktıları: muayene özeti, aşı kartı, reçete, onam, lab raporu, taburculuk. Provider secret sadece server-side tutulmalı. E-fatura/lab integration için mock değil adapter contract ve sandbox stub oluştur; canlı yetkili entegrasyon yoksa bunu UI'da açıkça belirt.

## Acceptance criteria
- Notification job retry duplicate message üretmemeli.
- İletişim tercihi/izin kuralı kontrol edilmeli.
- PDF Türkçe karakter ve clinic branding testini geçmeli.
- Prescription PDF imza/authorized status bilgisini doğru göstermeli.
- Provider secret web/mobile bundle'a girmemeli.
- Provider başarısızlığı klinik ana işlemini bozmayıp retryable status üretmeli.

## Required output
- Implement the complete scope; do not just describe it.
- Add/update migrations, API contracts, UI and automated tests as applicable.
- Run formatter, lint, typecheck, unit/integration tests and relevant build commands.
- Update `docs/IMPLEMENTATION_STATUS.md`, `CHANGELOG.md`, README and decisions as needed.
- Report changed files, commands/results, known limitations and any manual validation needed.
- Do not start the next phase.
