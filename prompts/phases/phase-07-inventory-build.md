# Phase 07 — Ürün, depo, lot, tedarikçi ve stok defteri / Geliştirme Promptu

You are continuing the VetCore project. Read `agents.md`, `README.md`, all relevant `docs/`, `design/` and `rules/` first. Inspect the current repository and implementation status before changing files.

## Goal
Ürün, depo, lot, tedarikçi ve stok defteri

## Instructions
Product, ProductCategory, Unit, ProductUnitConversion, Supplier, StockLocation, InventoryLot, StockMovement, StockMovementLine, StockBalance projection, StockCount, StockTransfer ve TemperatureLog modellerini oluştur. Ürün kartı, barkod/SKU, lot/son kullanma tarihi, tedarikçi, mal kabul, tedarikçi iade, depolar arası transfer, stok sayımı, ayarlama, hareket defteri, minimum stok ve son kullanma uyarıları geliştir. Ledger append-only olsun. FEFO önerisi ver; expired/quarantine lotları varsayılan blokla. Çok şubeli transfer iki aşamalı olsun.

## Acceptance criteria
- Mal kabul lot/expiry/cost ile stok artırmalı.
- Lot bazlı stok bakiye hesapları ledger ile eşleşmeli.
- Expired/quarantined lot tüketim için seçilememeli.
- Transfer dispatch sonrası in-transit, receive sonrası hedef stok artışı göstermeli.
- Stock count adjustment reason ve audit gerektirmeli.
- Aynı lot eş zamanlı iki tüketimde negatif stok oluşmamalı.
- Ledger kaydı update/delete edilememeli.

## Required output
- Implement the complete scope; do not just describe it.
- Add/update migrations, API contracts, UI and automated tests as applicable.
- Run formatter, lint, typecheck, unit/integration tests and relevant build commands.
- Update `docs/IMPLEMENTATION_STATUS.md`, `CHANGELOG.md`, README and decisions as needed.
- Report changed files, commands/results, known limitations and any manual validation needed.
- Do not start the next phase.
