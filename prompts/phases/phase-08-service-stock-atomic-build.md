# Phase 08 — Hizmet → stok → ücret atomik iş akışı / Geliştirme Promptu

You are continuing the VetCore project. Read `agents.md`, `README.md`, all relevant `docs/`, `design/` and `rules/` first. Inspect the current repository and implementation status before changing files.

## Goal
Hizmet → stok → ücret atomik iş akışı

## Instructions
ServiceConsumptionRule üzerinden hizmetin varsayılan malzeme tüketimlerini getir. Kullanıcı gerçek miktarı, depo ve lotu onaylayıp düzenleyebilsin. ServiceRecord preview/finalize orchestration geliştir. Finalize tek DB transaction içinde finalized service + stock ledger movement + charge/charge line + audit + balance projection oluşturmalı. Insufficient stock, lot invalid, expired/quarantine, concurrency, idempotency, permission ve rollback kurallarını uygula. İptal/reversal ayrı hareket/charge düzeltmesi oluştursun. Mobil retry aynı idempotency key ile duplicate yaratmasın.

## Acceptance criteria
- Başarılı hizmet finalizasyonu klinik kaydı, stok düşümü ve ücret satırını birlikte oluşturmalı.
- Stok hareketi yazma hatası tüm transaction'ı rollback etmeli.
- Aynı idempotency key ile tekrar çağrı duplicate yaratmamalı.
- Son ürünü iki eşzamanlı istekten en fazla biri tüketebilmeli.
- Lot no, expiry ve kaynak service record hareket üzerinde izlenebilmeli.
- Reversal orijinal hareketi silmeden ters hareket oluşturmalı.
- Yetkisiz kullanıcı finalization/reversal yapamamalı.

## Required output
- Implement the complete scope; do not just describe it.
- Add/update migrations, API contracts, UI and automated tests as applicable.
- Run formatter, lint, typecheck, unit/integration tests and relevant build commands.
- Update `docs/IMPLEMENTATION_STATUS.md`, `CHANGELOG.md`, README and decisions as needed.
- Report changed files, commands/results, known limitations and any manual validation needed.
- Do not start the next phase.
