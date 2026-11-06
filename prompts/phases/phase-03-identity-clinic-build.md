# Phase 03 — Kimlik, personel, rol ve klinik ayarları / Geliştirme Promptu

You are continuing the VetCore project. Read `agents.md`, `README.md`, all relevant `docs/`, `design/` and `rules/` first. Inspect the current repository and implementation status before changing files.

## Goal
Kimlik, personel, rol ve klinik ayarları

## Instructions
Clinic, Branch, Room, Warehouse placeholder master, Staff, Role, Permission, StaffBranch, Session ve AuditEvent temelini kur. Login/logout/refresh, session rotation, password hash, kullanıcı yönetimi, rol/izin matrisi, aktif şube seçimi, şube kapsamlı API guard ve clinic profile/settings ekranlarını geliştir. Varsayılan rol şablonları ekle ama roller düzenlenebilir olsun. Demo seed yalnızca sentetik veriler içersin. Her endpointte backend authorization zorunlu olsun.

## Acceptance criteria
- Login/refresh/logout akışı çalışmalı; refresh token rotation test edilmeli.
- Yetkisiz kullanıcı endpoint'e doğrudan erişememeli.
- Şube A kullanıcısı Şube B kapsamındaki kısıtlı kaydı okuyamamalı.
- Permission matrix en az clinical.sign, inventory.adjust, finance.refund, reports.export, audit.view alanlarını içermeli.
- Yetki değişiklikleri audit'e yazılmalı.

## Required output
- Implement the complete scope; do not just describe it.
- Add/update migrations, API contracts, UI and automated tests as applicable.
- Run formatter, lint, typecheck, unit/integration tests and relevant build commands.
- Update `docs/IMPLEMENTATION_STATUS.md`, `CHANGELOG.md`, README and decisions as needed.
- Report changed files, commands/results, known limitations and any manual validation needed.
- Do not start the next phase.
