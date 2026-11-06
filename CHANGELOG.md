# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) yaklaşımı; sürümler SemVer uyumlu numaralandırılır.

## [0.1.0] — Faz 02: Tasarım sistemi ve uygulama kabukları (2026-11-07)

### Eklendi
- **Web uygulama kabuğu**: sabit 248 px kenar çubuğu (13 bölüm, açılır gruplar, faz rozetli
  devre dışı yapraklar — sahte iş akışı yok), 72 px üst çubuk (şube seçici, global arama alanı,
  bildirimler, yardım, profil), en fazla 1600 px içerik ve 28 px sayfa dolgusu; tablet/mobilde
  Sheet çekmecesi (`src/components/layout/*`).
- **Tasarım sistemi bileşenleri**: `StatusChip` (renk + ikon + metin — durum asla yalnızca renkle
  iletilmez), `KpiCard` (tabular numerals, trend bağlamı), `EmptyState` / `ErrorState` (yeniden
  deneme yolu) / `UnauthorizedState` (`src/components/design-system/*`).
- `/` Genel Bakış kontrol paneli önizlemesi: sentetik KPI kartları, bugünün programı tablosu
  (klinik terminolojisi), canlı platform bileşen durumu (zod sözleşme doğrulamalı), durum
  hikâyeleri, 15 fazlık plan.
- `/stil-rehberi` hikâye galerisi: renk tokenları, tipografi + Türkçe glif paneli, butonlar,
  form düzeni (etiket üstte/ipucu altta/hata alanda), durum rozetleri, yoğun tablo, modal/çekmece/
  toast örnekleri, yükleme/boş/hata/yetkisiz hikâyeleri, erişilebilirlik notları.
- **Mobil kabuk** (`apps/mobile`): token tabanlı tema (`src/theme/tokens.ts`), alt navigasyon
  (Bugün/Hastalar/Randevular/Görevler/Daha Fazla — bağımlılık eklenmeden saf View ikonları),
  `useSafeAreaInsets` güvenli alan dolgusu, ≥44 pt dokunma hedefleri, durum rozeti ve boş durum
  bileşenleri.
- **Playwright standart faz sonu doğrulaması** (ADR-013): `prompts/skills/phase-workflow.md`,
  `docs/TEST_STRATEGY.md` ve README güncellendi; her faz artık test promptuyla birlikte yeşil
  Playwright koşusu + repoya commitlenen ekran görüntüleriyle kapanır.
- E2E yeniden yazıldı (`e2e/shell.spec.ts`): kabuk, KPI/tablo/durum hikâyeleri, canlı bileşenler,
  stil rehberi + modal etkileşimi, 1280/768/390 genişlik taşma kontrolleri, çekmece menü; masaüstü
  ve mobil proje ayrımı. 10 güncel ekran görüntüsü `e2e/screenshots/` altında.
- README "Ekran Görüntüleri" bölümü: 6 küratörlü görüntü `docs/screenshots/` altında Türkçe
  açıklamalarla; `devIndicators: false` ile dev düğmesi görüntülerden çıkarıldı, çekmece
  ekran görüntüleri için animasyon oturma beklemeleri eklendi.

### Değişti
- `globals.css` tam token entegrasyonu: design/tokens.json kaynaklı marka/nötr/durum paleti,
  yarıçap ölçeği (6/10/14/18), gölge tokenları, VetCore koyu tema, yerleşim değişkenleri
  (`--vc-sidebar-width` vb.), görünür odak halkası ve `prefers-reduced-motion` desteği.
- `packages/domain` `CURRENT_PHASE_ID` 1 → 2; faz planı rozetleri buna göre.

### Düzeltildi (Faz 02 QA — 2026-11-07)
- Stil rehberi demo modalında `Vazgeç` düğmesi pencereyi kapatmıyordu; `DialogClose` ile sarıldı
  (E2E testi yakaladı).
- Grid/flex öğeleri varsayılan `min-width:auto` nedeniyle mobilde (390 px) tablo min-content
  genişliği kadar **128 px yatay taşma** üretiyordu; tablo/KPI/durum kartlarına `min-w-0`,
  dar üst çubukta yardım düğmesi gizlendi (E2E taşma testi yakaladı).
- E2E strict-mode: tabloda iki `Beklemede` satırı lokatörü çökertiyordu; `.first()` ile
  ayrımcılık ve masaüstü/mobil proje ayrımı (`test.skip`) eklendi.
- ESLint, Playwright `playwright-report/` ve `test-results/` artefaktlarını tarayıp derlenen trace
  JS'lerinde sahte hata üretiyordu; ignore listesine eklendi.

### Sonuç
- Faz 02 test promptu: lint 0 hata, typecheck 11/11, unit test 24 PASS (API 8, Web 3, paketler),
  build 6/6, Playwright E2E 8/8 PASS (8 proje-ayrımlı skip), 10 ekran görüntüsü yenilendi.

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

### Eklendi (Playwright E2E — 2026-11-06)
- `apps/web`: Playwright E2E altyapısı (`playwright.config.ts`, `e2e/home.spec.ts`); chromium desktop (1440×900) ve mobil (iPhone 14, chromium motoru) projeleri; 12 senaryo (11 PASS + 1 bilinçli skip).
- Ana sayfa E2E kapsamı: başlık/rozet, durum kartları (Web/API/PostgreSQL canlı doğrulama), 15 fazlık plan listesi, yenile butonu, footer sentetik veri + sürüm bilgisi, mobil yatay taşma kontrolü.
- Ekran görüntüleri proje önekiyle `apps/web/e2e/screenshots/` altına yazılır ve repoya commit edilir; `test-results/` ve `playwright-report/` gitignore'a eklendi.

### Düzeltildi (Playwright E2E QA — 2026-11-06)
- `apps/web/src/app/page.tsx`: `statusBadge` emerald (başarılı) dalı sabit "Çalışıyor" yazıyor, `label` parametresini yok sayıyordu; PostgreSQL kartı "Bağlı" yerine "Çalışıyor" gösteriyordu. `{label}` olarak düzeltildi (E2E testi yakaladı).
- `scripts/dev-postgres.mjs`: idempotent `up` — mevcut küme varsa initdb atlanır, yalnızca sunucu başlatılır (`PG_VERSION` kontrolü); şifre log'da maskelenir.
- `apps/web`: E2E determinizmi için `dev:clean` script'i ve webServer'da taze derleme; mobil proje WebKit yerine chromium motoru ile koşar (sandbox'ta yalnızca chromium binary'leri mevcut).
- `.env` git takibinden çıkarıldı (`git rm --cached`); `.gitignore` kuralı zaten mevcuttu.

## Unreleased (paket blueprint'i)
- Initial VetCore product and engineering blueprint.
- Defined one-time customer installation, branch-aware architecture and staff mobile scope.
- Added 15 phase build/test prompt pairs.
