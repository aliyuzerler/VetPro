# Phase 01 — Monorepo ve altyapı / Geliştirme Promptu

You are continuing the VetCore project. Read `agents.md`, `README.md`, all relevant `docs/`, `design/` and `rules/` first. Inspect the current repository and implementation status before changing files.

## Goal
Monorepo ve altyapı

## Instructions
pnpm workspaces/Turborepo monorepo oluştur. Next.js web, Expo React Native mobile, NestJS API, worker workspace'lerini ayağa kaldır. TypeScript strict, ESLint, Prettier, path aliases, env validation, Docker Compose ile PostgreSQL/Redis/MinIO, health endpoint, CI pipeline ve temel test altyapısı kur. Prisma başlangıç şeması ve migration/seed komutlarını ekle. README ve .env.example hazırla. İş mantığı modüllerini bu fazda geliştirme. Monorepo paket sınırlarını docs/ARCHITECTURE.md ile eşleştir.

## Acceptance criteria
- Web, mobile ve API ayrı ayrı development modunda açılmalı.
- API health/readiness endpoint cevap vermeli.
- PostgreSQL migration ve seed çalışmalı.
- Docker servisleri healthcheck ile hazır olmalı.
- CI lint/typecheck/test/build aşamalarını içermeli.
- Secrets .env.example dışında kaynakta bulunmamalı.

## Required output
- Implement the complete scope; do not just describe it.
- Add/update migrations, API contracts, UI and automated tests as applicable.
- Run formatter, lint, typecheck, unit/integration tests and relevant build commands.
- Update `docs/IMPLEMENTATION_STATUS.md`, `CHANGELOG.md`, README and decisions as needed.
- Report changed files, commands/results, known limitations and any manual validation needed.
- Do not start the next phase.
