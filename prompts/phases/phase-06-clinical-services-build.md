# Phase 06 — Muayene, SOAP, vital bulgular ve hizmet kataloğu / Geliştirme Promptu

You are continuing the VetCore project. Read `agents.md`, `README.md`, all relevant `docs/`, `design/` and `rules/` first. Inspect the current repository and implementation status before changing files.

## Goal
Muayene, SOAP, vital bulgular ve hizmet kataloğu

## Instructions
Encounter, SoapNote, VitalObservation, Diagnosis, ClinicalAttachment, ClinicalAddendum, Service, ServicePrice, ServiceConsumptionRule ve ServiceRecord draft modellerini geliştir. Muayene workbench'te hasta uyarıları, anamnez, SOAP, vital bulgu kayıtları, tanı, plan, not, ek dosya ve hizmet seçimi yer alsın. Hizmet kategori/fiyat/süre tanımları ve varsayılan tüketim kuralı oluşturulabilsin. Draft/signed lifecycle kur; imzalı kayıt değiştirilemesin, addendum ile düzeltilebilsin. Bu fazda gerçek stok post işlemini henüz bağlama.

## Acceptance criteria
- SOAP alanları kaydedilip yeniden açılmalı.
- Aynı vital bulgunun geçmiş ölçümleri korunmalı.
- Yetkisiz kişi encounter imzalayamamalı.
- Signed encounter doğrudan update/delete edilememeli.
- Addendum orijinal kaydı referanslamalı ve audit üretmeli.
- Hizmet fiyat geçerlilik tarihleri ve branch override doğru çözülmeli.

## Required output
- Implement the complete scope; do not just describe it.
- Add/update migrations, API contracts, UI and automated tests as applicable.
- Run formatter, lint, typecheck, unit/integration tests and relevant build commands.
- Update `docs/IMPLEMENTATION_STATUS.md`, `CHANGELOG.md`, README and decisions as needed.
- Report changed files, commands/results, known limitations and any manual validation needed.
- Do not start the next phase.
