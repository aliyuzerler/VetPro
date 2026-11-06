# Phase 14 — Raporlar, veri aktarımı ve yedekleme / Geliştirme Promptu

You are continuing the VetCore project. Read `agents.md`, `README.md`, all relevant `docs/`, `design/` and `rules/` first. Inspect the current repository and implementation status before changing files.

## Goal
Raporlar, veri aktarımı ve yedekleme

## Instructions
Raporlama servislerini ve web ekranlarını geliştir: günlük/aylık gelir, borç yaşlandırma, hizmet dağılımı, hekim iş yükü, aşı takip, stok değer/expiry, ürün tüketim, tedarik satın alma, lab turnaround ve yatış doluluk. CSV/XLSX/PDF dışa aktarma izin ve audit ile çalışmalı. Owner/patient/product başlangıç import şablonları ve doğrulama/önizleme/duplicate resolution akışı ekle. Backup job: PostgreSQL + object storage + config metadata; encryption, retention, checksum ve restore runbook; owner-only UI.

## Acceptance criteria
- Raporlar branch/date filters ile doğru veri üretmeli.
- Export permission yoksa dosya üretilememeli.
- CSV/XLSX UTF-8/Türkçe karakter ve sayı formatı doğru olmalı.
- Import preview hatalı satırları ve duplicate olasılığını göstermeli; sessiz overwrite olmamalı.
- Backup manifest/checksum oluşturmalı.
- Staging ortamında restore database ve object files doğrulanmalı.
- Backup dosyalarına yetkisiz erişim engellenmeli.

## Required output
- Implement the complete scope; do not just describe it.
- Add/update migrations, API contracts, UI and automated tests as applicable.
- Run formatter, lint, typecheck, unit/integration tests and relevant build commands.
- Update `docs/IMPLEMENTATION_STATUS.md`, `CHANGELOG.md`, README and decisions as needed.
- Report changed files, commands/results, known limitations and any manual validation needed.
- Do not start the next phase.
