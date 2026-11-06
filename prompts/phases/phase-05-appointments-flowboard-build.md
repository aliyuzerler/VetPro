# Phase 05 — Randevu takvimi ve klinik akış panosu / Geliştirme Promptu

You are continuing the VetCore project. Read `agents.md`, `README.md`, all relevant `docs/`, `design/` and `rules/` first. Inspect the current repository and implementation status before changing files.

## Goal
Randevu takvimi ve klinik akış panosu

## Instructions
Appointment, AppointmentType, ScheduleBlock ve WaitlistEntry modellerini oluştur. Gün/hafta/ay takvimi, hekim/oda/şube filtreleri, çalışma saatleri, çakışma kontrolü, randevu oluştur/düzenle/iptal, waitlist, check-in, arrived/waiting/in_consultation/completed/no_show/cancelled durum geçişlerini geliştir. Flowboard hasta kuyruğunu gerçek veriden göstermeli. Web tam takvim; mobil bugünün ajandası ve randevu detayı sunmalı.

## Acceptance criteria
- Aynı hekim/oda için çakışan aktif randevu engellenmeli.
- Çalışma saati dışı randevu policy'ye göre reddedilmeli veya yetkili override istemeli.
- Durum geçişleri geçersiz sırada yapılamamalı.
- Check-in flowboard'a yansımalı.
- Branch ve staff filtreleri API'de uygulanmalı.
- Saat dilimi Europe/Istanbul testi geçmeli.

## Required output
- Implement the complete scope; do not just describe it.
- Add/update migrations, API contracts, UI and automated tests as applicable.
- Run formatter, lint, typecheck, unit/integration tests and relevant build commands.
- Update `docs/IMPLEMENTATION_STATUS.md`, `CHANGELOG.md`, README and decisions as needed.
- Report changed files, commands/results, known limitations and any manual validation needed.
- Do not start the next phase.
