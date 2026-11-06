# Phase 15 — Güvenlik, performans ve müşteri teslimi / Geliştirme Promptu

You are continuing the VetCore project. Read `agents.md`, `README.md`, all relevant `docs/`, `design/` and `rules/` first. Inspect the current repository and implementation status before changing files.

## Goal
Güvenlik, performans ve müşteri teslimi

## Instructions
Uçtan uca threat model, security hardening, dependency scan, secret scan, SAST, IDOR/privilege/branch isolation testleri, API rate limits, secure headers, audit integrity, observability, slow query review, performance test, mobile sync reliability, DB migration/rollback, Docker production config, TLS reverse proxy, backup restore drill, installation wizard/docs, customer handover and support docs tamamla. Açık kritik/yüksek bulgu bırakma; kalan riskleri raporla. Perpetual license activation/clinic identity configuration gerekiyorsa basit, şeffaf ve aboneliksiz tasarla; uzaktan kill switch veya gizli telemetri ekleme.

## Acceptance criteria
- Critical/high security test bulgusu kalmamalı.
- API common reads/search performance hedefleri test ortamında raporlanmalı.
- E2E happy path: owner→patient→appointment→encounter→service→lot stock→charge→payment→PDF geçmeli.
- Backup restore drill başarılı olmalı.
- Docker compose production setup secrets/ports güvenli olmalı.
- Install/update/rollback/handover dokümanları tamamlanmalı.
- Abonelik ekranı, billing job veya subscription gate olmamalı.
- Kalan risk, donanım varsayımı ve manuel mevzuat doğrulama listesi teslim edilmeli.

## Required output
- Implement the complete scope; do not just describe it.
- Add/update migrations, API contracts, UI and automated tests as applicable.
- Run formatter, lint, typecheck, unit/integration tests and relevant build commands.
- Update `docs/IMPLEMENTATION_STATUS.md`, `CHANGELOG.md`, README and decisions as needed.
- Report changed files, commands/results, known limitations and any manual validation needed.
- Do not start the next phase.
