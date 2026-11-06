# Phase 10 — Reçete, ilaç uygulaması, aşı ve takip / Geliştirme Promptu

You are continuing the VetCore project. Read `agents.md`, `README.md`, all relevant `docs/`, `design/` and `rules/` first. Inspect the current repository and implementation status before changing files.

## Goal
Reçete, ilaç uygulaması, aşı ve takip

## Instructions
Prescription/PrescriptionLine, DispenseEvent, AdministrationEvent, VaccineProtocol, VaccineEvent ve VaccineReminder modellerini geliştir. Reçete oluşturma/imzalama/yazdırma, ürün/form/doz/uygulama yolu/sıklık/süre talimatları, klinisyen onaylı aritmetik doz yardımcısı, uygulanan ilaç kaydı, aşı lot/expiry kaydı, protokol ayarı, yaklaşan/geciken aşı listesi ve takip tarihlerini ekle. Klinikçe düzenlenebilir form; resmi mevzuat alanlarını yapılandırılabilir tut. Hiçbir ilaç/doz önerisi otomatik üretilmesin.

## Acceptance criteria
- Reçete yalnızca yetkili veteriner tarafından imzalanmalı.
- Doz helper formül ve birimleri görünür kılmalı, açık veteriner onayı olmadan finalize etmemeli.
- Prescribed/dispensed/administered kayıtları ayrışmalı.
- Aşı kaydı lot ve son kullanma tarihini saklamalı.
- Aşı takvimi klinik protokolüyle yapılandırılmalı, sabit evrensel takvim olmamalı.
- Hatırlatma aynı event için duplicate gönderilmemeli.

## Required output
- Implement the complete scope; do not just describe it.
- Add/update migrations, API contracts, UI and automated tests as applicable.
- Run formatter, lint, typecheck, unit/integration tests and relevant build commands.
- Update `docs/IMPLEMENTATION_STATUS.md`, `CHANGELOG.md`, README and decisions as needed.
- Report changed files, commands/results, known limitations and any manual validation needed.
- Do not start the next phase.
