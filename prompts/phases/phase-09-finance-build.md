# Phase 09 — Kasa, tahsilat, cari hesap ve giderler / Geliştirme Promptu

You are continuing the VetCore project. Read `agents.md`, `README.md`, all relevant `docs/`, `design/` and `rules/` first. Inspect the current repository and implementation status before changing files.

## Goal
Kasa, tahsilat, cari hesap ve giderler

## Instructions
Charge/ChargeLine, Payment, PaymentAllocation, Refund, CashRegister, CashSession, CashMovement, Expense ve SupplierPayable modellerini geliştir. Nakit/kart/havale/diğer tahsilat, kısmi ödeme, birden fazla charge allocation, hasta sahibi cari ekstre, kasa açılış/kapanış, nakit giriş/çıkış, fark açıklaması, iade ve gider ekranları ekle. Ücretler hizmet finalizasyonundan bağlantılı gelsin. Resmi e-fatura/ e-arşiv iddiası oluşturma; yalnızca ileride provider adapter için arayüz hazırla.

## Acceptance criteria
- Kısmi ödeme ve allocation doğru bakiye üretmeli.
- Tahsilatın aynı idempotency key ile yinelenmesi engellenmeli.
- Refund orijinal payment'e bağlı olmalı ve audit üretmeli.
- Kasa kapanış farkı hesaplanmalı ve açıklama zorunlu olmalı.
- Cari ekstre charge/payment/refund ilişkisini göstermeli.
- Finance.refund yetkisi olmayan kullanıcı iade yapamamalı.
- Money işlemleri Decimal hassasiyetinde olmalı.

## Required output
- Implement the complete scope; do not just describe it.
- Add/update migrations, API contracts, UI and automated tests as applicable.
- Run formatter, lint, typecheck, unit/integration tests and relevant build commands.
- Update `docs/IMPLEMENTATION_STATUS.md`, `CHANGELOG.md`, README and decisions as needed.
- Report changed files, commands/results, known limitations and any manual validation needed.
- Do not start the next phase.
