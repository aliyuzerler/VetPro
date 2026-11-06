# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) yaklaşımı; sürümler SemVer uyumlu numaralandırılır.

## [0.1.0] — Faz 01: Monorepo ve altyapı

### Eklendi
- pnpm workspaces + Turborepo monorepo (`apps/web`, `apps/mobile`, `apps/api`, `apps/worker`, `packages/*`) — `docs/ARCHITECTURE.md` paket sınırlarıyla eşleşir.
- `apps/api`: NestJS 11 iskeleti; `/api/v1/health` (liveness) ve `/api/v1/health/readiness` (PostgreSQL kontrolü, bağımlılık yoksa 503), korelasyon kimliği middleware'i, ortak hata zarfı, Swagger (`/api/docs`), zod tabanlı env doğrulama.
- `apps/web`: Next.js 16 iskeleti; Faz 01 durum sayfası (yükleme/boş/hata/başarı durumları), `/api/v1/*` → API proxy (API_PROXY_TARGET), VetCore marka köprüsü (design/tokens.json).
- `apps/worker`: BullMQ iskeleti; REDIS_URL yoksa pasif modda açılır, liveness `/api/v1/health` yanıtı verir.
- `apps/mobile`: Expo React Native (SDK 54) personel uygulaması iskeleti.
- `packages/contracts`: health sözleşmesi + kuyruk adları (zod). `packages/domain`: 15 fazlık plan + APP_VERSION. `packages/ui-tokens`: tip güvenli token kopyası (design/tokens.json ile uyum testi). `packages/config`: paylaşılan tsconfig seti.
- `prisma/`: PostgreSQL şeması (Clinic, Branch), migration, sentetik seed; Docker'sız geliştirme için gömülü PostgreSQL scripti (`scripts/dev-postgres.mjs`).
- `infra/`: docker-compose (postgres/redis/minio + app profili, tüm servisler healthcheck'li), Dockerfile.api/web/worker, ters vekil nginx yapılandırması.
- CI: lint → typecheck → test → migration → seed → build + temel sır taraması.
- `.env.example` güncellendi; sırlar depoya eklenmedi.

### Kararlar
- ADR-010: pnpm 10 + Turborepo 2 (lockfile: pnpm-lock.yaml).
- ADR-011: Docker'sız geliştirme için gömülü PostgreSQL; prod/staging'te Docker Compose.

### Düzeltildi (Faz 01 QA doğrulaması — 2026-11-06)
- `scripts/dev-postgres.mjs`: TypeScript tip anotasyonları `.mjs` dosyasında geçersizdi; Node başlatma aşamada çöküyordu (anotasyonlar kaldırıldı).
- `scripts/dev-postgres.mjs`: `pg.initialise()` `await` edilmiyordu; initdb bitmeden sunucu başlatılmaya çalışılıyor, race condition ile "postgresql.conf not found" hatası alınıyordu.
- `scripts/dev-postgres.mjs`: embedded-postgres kütüphanesinin hardcode'luğu `en_US.UTF-8` locale'i tüm sistemlerde kurulu olmadığından initdb `code 1` ile çöküyordu; `initdbFlags: ['--lc-messages=C']` ile override edildi.
- Faz 01 test promptu çalıştırıldı: lint (0 hata), typecheck (11/11), test (14+ PASS), build (6/6), migration + seed (sentetik), health/readiness canlı 200, sır taraması temiz.

## Unreleased (paket blueprint'i)
- Initial VetCore product and engineering blueprint.
- Defined one-time customer installation, branch-aware architecture and staff mobile scope.
- Added 15 phase build/test prompt pairs.
