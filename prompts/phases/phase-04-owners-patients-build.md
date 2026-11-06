# Phase 04 — Hasta sahibi ve hayvan hasta yönetimi / Geliştirme Promptu

You are continuing the VetCore project. Read `agents.md`, `README.md`, all relevant `docs/`, `design/` and `rules/` first. Inspect the current repository and implementation status before changing files.

## Goal
Hasta sahibi ve hayvan hasta yönetimi

## Instructions
Owner, OwnerContact, OwnerConsent, Patient, Species, Breed, PatientAlert, WeightObservation ve FileAsset temel tablolarını/migrationlarını kur. Sahip CRUD, çoklu hasta ilişkilendirme, hasta CRUD, arama (telefon/ad/çip no/hasta kodu), mükerrer kayıt uyarısı, sahip detay ve hasta detay ekranları, hasta zaman çizelgesi iskeleti geliştir. Klinik verilerini branch/clinic scoping ile koru. Dosya upload private storage adapter kullanmalı. Silme yerine arşivleme/merge akışını tasarla.

## Acceptance criteria
- Bir sahip altında birden fazla hasta oluşturulmalı.
- Telefon normalize araması ve mikroçip araması çalışmalı.
- Mükerrer olabilecek kayıtta kullanıcıya uyarı gösterilmeli; otomatik merge yapılmamalı.
- Hasta alerji/kronik hastalık uyarıları listede ve detayda görünmeli.
- Yetkisiz branch kullanıcıları kayıtları okuyamamalı.
- Dosya URL'si yetkisiz kullanıcıya erişim vermemeli.

## Required output
- Implement the complete scope; do not just describe it.
- Add/update migrations, API contracts, UI and automated tests as applicable.
- Run formatter, lint, typecheck, unit/integration tests and relevant build commands.
- Update `docs/IMPLEMENTATION_STATUS.md`, `CHANGELOG.md`, README and decisions as needed.
- Report changed files, commands/results, known limitations and any manual validation needed.
- Do not start the next phase.
