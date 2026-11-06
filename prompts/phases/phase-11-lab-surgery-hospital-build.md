# Phase 11 — Laboratuvar, cerrahi ve yatış modülleri / Geliştirme Promptu

You are continuing the VetCore project. Read `agents.md`, `README.md`, all relevant `docs/`, `design/` and `rules/` first. Inspect the current repository and implementation status before changing files.

## Goal
Laboratuvar, cerrahi ve yatış modülleri

## Instructions
LabCatalog, LabOrder, LabResult, Sample, SurgeryCase, AnesthesiaRecord, SurgeryChecklist, HospitalStay, Kennel, HospitalObservation ve MedicationAdministration modellerini oluştur. Laboratuvar istek/sonuç/referans aralığı/kritik sonuç işaretleme, cerrahi planlama ve anestezi çizelgesi, yatış kabul/oda/kennel, günlük vital takip, tedavi ve taburculuk akışlarını geliştir. Hastane yatışı günlük hizmet/ürün sarfı üretmek için phase-08 transaction servisini kullanmalı; modüller kendi stok mantığını yazmamalı.

## Acceptance criteria
- Lab order status lifecycle doğru olmalı.
- Kritik laboratuvar sonucu yetkili klinisyen ekranında uyarı üretmeli.
- Cerrahi kaydı encounter/patient/vet ile bağlı olmalı.
- Yatış kabul/transfer/taburculuk tarihleri ve kennel çakışması kontrol edilmeli.
- Yatış tedavi sarfı ortak service-stock transaction servisini kullanmalı.
- Yetki ve branch scope tüm modüllerde uygulanmalı.

## Required output
- Implement the complete scope; do not just describe it.
- Add/update migrations, API contracts, UI and automated tests as applicable.
- Run formatter, lint, typecheck, unit/integration tests and relevant build commands.
- Update `docs/IMPLEMENTATION_STATUS.md`, `CHANGELOG.md`, README and decisions as needed.
- Report changed files, commands/results, known limitations and any manual validation needed.
- Do not start the next phase.
