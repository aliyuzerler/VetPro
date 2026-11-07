# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) yaklaşımı; sürümler SemVer uyumlu numaralandırılır.

## [0.3.0] — Faz 04: Hasta sahibi ve hayvan hasta yönetimi (2026-11-07)

### Eklendi
- **Veri modeli (migration `faz04_owners_patients`)**: `Species` (global katalog, seed:
  6 tür / 26 ırk), `Breed`, `Owner`, `OwnerContact` (normalize telefon `90…` / e-posta),
  `OwnerConsent` (KVKK, SMS, e-posta, WhatsApp, pazarlama), `Patient` (şube kapsamlı,
  klinik içinde tekil `HP-000N` kodu ve mikroçip), `PatientAlert` (alerji/kronik/uyarı,
  önem dereceli), `WeightObservation`, `FileAsset` (private storage meta verisi).
- **API — sahipler** (`/owners`): CRUD, serbest arama (ad-soyad **kelime bazlı** —
  sıra bağımsız; telefon **normalize** — biçimden bağımsız; e-posta), mükerrer kontrol
  uç noktası (`GET /owners/duplicates` — telefon/e-posta güçlü, ad-soyad zayıf sinyal;
  otomatik merge YOK), arşivleme/arşivden çıkarma (sebep zorunlu, aktif hastası olan
  sahip arşivlenemez), açık merge (`POST /owners/:id/merge` — hastalar hedefe taşınır,
  kaynak arşivlenir ve `mergedIntoOwnerId` işaretlenir).
- **API — hastalar** (`/patients`, `/owners/:id/patients`): CRUD, arama (ad, kod,
  mikroçip, sahip adı/telefonu), **şube kapsamı** (yetkisiz şube listelerde görmez,
  doğrudan erişimde 403), mükerrer mikroçip 409 + `GET /patients/duplicates` uyarısı,
  uyarı ekle/çöz/yeniden aç, kilo gözlemleri, hasta başına zaman çizelgesi iskeleti
  (kilo + uyarı + dosya + denetim olayları; SOAP olayları Faz 06'da bağlanacak).
- **API — tür/ırk kataloğu** (`/species`): aktif katalog + ırklar (okuma tüm personel),
  ırk ekleme `master.manage` izniyle.
- **API — dosyalar** (`/file-assets`): multipart yükleme (MIME beyaz listesi, 10 MB
  sınır), metadata listesi (storage key dönmaz), **yetkili indirme** (Bearer + şube
  kapsamı; kimliksiz 401, yetkisiz şube 403). `LocalPrivateStorageAdapter`: UUID dosya
  adları, `PRIVATE_STORAGE_DIR` (HTTP servis edilmez, gitignore), path traversal
  koruması (ADR-018).
- **İzinler**: `owner.manage`, `patient.manage`, `master.manage` (katalog
  `prisma/permissions.ts` tek kaynağa taşındı); veteriner ve resepsiyon şablonlarına
  sahip/hasta yönetimi eklendi.
- **Web — `/sahipler`**: arama + liste, yeni sahip formu (iletişim + rızalar) ve
  **mükerrer uyarı akışı** (adaylar + eşleşme nedenleri → "Yine de kaydet" açık onayı).
- **Web — `/sahipler/[id]`**: iletişim/rıza kartları, hasta tablosu (çoklu hasta),
  yeni hasta formu (tür→ırk kademeli seçim, mikroçip, ilk kilo, başlangıç uyarısı),
  arşivleme + merge diyalogları.
- **Web — `/hastalar`**: arama (ad/kod/çip/sahip) + tür filtresi; alerji/kronik uyarı
  rozetleri listede görünür (kabul kriteri).
- **Web — `/hastalar/[id]`**: uyarı kartı (ekle/çöz/yeniden aç), kilo geçmişi,
  dosyalar (yükleme + yetkili indirme), zaman çizelgesi iskeleti.
- **Storybook (ADR-017)**: 5 yeni story dosyası — Sahip Listesi, Mükerrer Kayıt
  Uyarısı, Hasta Listesi, Hasta Uyarıları, Zaman Çizelgesi/Kilo/Dosyalar, Sahip Hasta
  Tablosu + Hasta Formu (toplam 22 yeni story; test-runner **40/40 PASS**, play
  etkileşim testleri + axe kapısı dahil; 43 görüntü `docs/screenshots/storybook/`).
- **Playwright E2E (ADR-013)**: `owners-patients.spec.ts` — 11 senaryo × 2 proje =
  22 yeni test (liste/arama, mükerrer uyarı akışı, çoklu hasta, uyarı rozetleri,
  mikroçip araması, uyarı ekle/çöz, kilo, dosya yükleme/indirme, arşiv akışı, yetkisiz
  şube görünümü, mobil düzen). Tam zincir **46/46 PASS**; ekran görüntüleri
  `apps/web/e2e/screenshots/` + README bölümü.
- **API testleri**: 27 yeni unit test (telefon/e-posta/mikroçip normalizasyonu, mükerrer
  eşleştirme kuralları, private storage sözleşmesi) + 10 senaryoluk API e2e kabul
  kriteri doğrulaması (gerçek DB + guard zinciri; 401/403/409/415 durumları dahil).

### Düzeltildi (Faz 04 QA doğrulaması — 2026-11-07)
- **Kritik — vitest/esbuild `emitDecoratorMetadata` eksikliği**: API e2e testlerinde
  `design:paramtypes` üretilmediği için ValidationPipe DTO metatipini göremiyor ve
  doğrulamayı **sessizce atlıyordu** (boş gövde 400 yerine işleyiciye düşüyordu).
  `unplugin-swc` eklentisiyle test ortamı üretim (`nest build`/tsc) paritesine
  getirildi; eksik doğrulama testleri artık gerçekten 400 döndürüyor.
- **Faz 03 `auth-flow` test fikstürü**: sabit 11 izinlik liste, paralel dosya koşumunda
  admin izinlerini eski kümeye geri alıyordu (Faz 04 testlerini kırıyordu). Fikstür
  artık katalogdaki tüm izinleri dinamik eşitliyor (fazdan bağımsız).
- **Hasta detayı yalnız aktif uyarıları döndürüyordu**: çözülen uyarılar kayboluyor,
  "Yeniden aç" akışı çalışmıyordu → detay sorgusu tüm uyarıları döndürür.
- **Ad-soyad araması tam isimle eşleşmiyordu** ("E2E Test Sahibi" → ad VE soyad ayrı
  alanlarda olduğundan sonuç boştu) → kelime bazlı AND/OR eşleşme (sıra bağımsız).
- **Erişilebilirlik (axe)**: mükerrer uyarı kutusunda muted metin uyarı zemini üstünde
  4.49:1 (tam ön plan rengine çekildi), uyarı kartında saydamlıklı alt metin kontrast
  ihlali veriyordu (opaklık kaldırıldı).
- `files.controller` yükleme işleyicisinde `@Body()` dekoratörü eksikti (multipart alanı
  işleyiciye ulaşmıyor, 500 dönüyordu).

## [0.2.1] — Storybook bileşen atölyesi ve a11y token düzeltmesi (2026-11-07)

### Eklendi
- **Storybook 10** (`@storybook/nextjs`, ADR-017): VetCore tasarım sistemi atölyesi —
  StatusChip, StateViews, KpiCard, Button, Badge story'leri (autodocs). Canlı geliştirme:
  `pnpm --filter @vetcore/web storybook`; statik doğrulama: `storybook:build` +
  `storybook:test`. `globals.css` (Tailwind 4 token'ları) story'lere birebir yüklenir.
- **Bileşen testleri**: test-runner ile **18/18 PASS** — her story render smoke,
  2 `play` etkileşim testi (buton tıklaması `onClick` mock'u, hata görünümünde
  "Tekrar dene" aksiyonu) ve axe erişilebilirlik denetimi (herhangi bir ihlal koşuyu
  düşürür). Test-runner Playwright tabanlıdır; ADR-013 zincirinin 4. adımı oldu.
- **Ekran görüntüleri**: `scripts/storybook-screenshots.mjs` — 21 PNG üretir
  (18 story + 2 mobil + yönetim arayüzü) → `docs/screenshots/storybook/`;
  README "Storybook" bölümüne gömüldü.
- Faz sonu standardı güncellendi: `docs/TEST_STRATEGY.md`,
  `prompts/END_OF_PHASE_REVIEW.md`, `prompts/skills/phase-workflow.md`.

### Düzeltildi
- **Erişilebilirlik — axe color-contrast (15 ihlal → 0)**: Storybook a11y kapısı ilk
  koşuda WCAG AA altı kontrastları yakaladı; token'lar koyulaştırıldı — brand.600
  `#28847C → #267F77` (beyaz üstünde 4.49 → 4.81:1), neutral.600/muted-foreground
  `#6E7C80 → #647175` (4.32 → 5.05:1), status.success `#21845A → #1F7C55` (4.11),
  status.warning `#C78A2C → #926520` (2.64 → 4.55:1), status.danger `#C44E4E → #B24747`
  (3.90), status.info `#3979B8 → #346FA9` (3.96). Etkilenen dosyalar: `globals.css`,
  `design/tokens.json`, `packages/ui-tokens`, mobil tema tokenları; `--destructive`,
  `--ring`, `--chart-*` ve `--sidebar-primary` türevleri hizalandı (hesaplayıcı:
  `scripts/compute-contrast.py`).
- StateViews hata story'sinde CSF3 varsayılan render meta bileşenini çiziyordu
  (buton DOM'a gelmiyordu); açık `render` eklendi.

## [0.2.0] — Faz 03: Kimlik, personel, rol ve klinik ayarları (2026-11-07)

### Eklendi
- **Veri modeli (migration `phase03_identity_rbac`)**: `Staff`, `Role`, `Permission`,
  `RolePermission`, `StaffRole`, `StaffBranch`, `Session`, `AuditEvent` + şube kapsamlı
  `Room` ve `Warehouse` placeholder master kayıtları.
- **Kimlik akışı**: `POST /auth/login` (scrypt N=16384 doğrulama, zamanlama dengeleyici
  probe), `POST /auth/refresh` (opak 48 bayt token; DB'de yalnızca SHA-256 hash; her
  çağrıda rotasyon; tekrar-kullanım algısı → tüm oturumlar kapanır), `POST /auth/logout`,
  `GET /auth/me`, `PATCH /auth/active-branch` (oturuma yazılır, denetlenir).
- **Access token**: HS256 JWT — bağımlılıksız `node:crypto` HMAC uygulaması (jose yalnızca
  ESM dağıtır; API CommonJS derlenir — ADR-014). 15 dk ömür; payload izin/şube taşımaz,
  guard her istekte veritabanından taze yükler (yetki değişikliği anında etkin).
- **Guard zinciri**: global `JwtAuthGuard` + `PermissionsGuard` (@RequirePermissions);
  şube kapsamlı uçlarda `BranchScopeGuard` (query.branchId → X-Branch-Id → body.branchId;
  allBranches rolü haricinde StaffBranch listesi belirleyicidir). Health uçları @Public.
- **Faz 03 API modülleri**: auth, clinic (profil/settings.manage), branches (branch.manage),
  rooms (room.manage, şube kapsamlı), warehouses (warehouse.manage, şube kapsamlı),
  staff (staff.manage; rol/şube replace-list atamaları), roles (roles.manage; izin matrisi
  PUT), audit (audit.view; sayfalama + eylem filtresi).
- **Denetim defteri**: giriş/başarısız giriş/çıkış, şube değişimi, klinik/şube/oda/depo
  güncellemeleri, personel ve rol/izin değişiklikleri (önce/sonra metadata) — audit_events
  tablosuna yazılır; `AuditService` tüm modüllerin bağımlılığı (global).
- **Web**: `/giris` sayfası (hata zarfı, demo hesap ipuçları), `AuthProvider` + kimlikli
  API istemcisi (401'de tek seferlik sessiz refresh), üst çubukta gerçek şube seçici +
  profil menüsü + çıkış, kenar çubuğu kullanıcı bloğu, `/ayarlar` sekmeleri (klinik
  profili, şubeler, personel, rol × izin matrisi, denetim kaydı) ve izin bazlı
  yetkisiz görünümleri.
- **Seed**: 11 izinlik katalog, 5 sistem rol şablonu, 4 sentetik personel (scrypt hash),
  oda/depo kayıtları — tamamı idempotent upsert.
- **E2E (ADR-013 standart koşu)**: `e2e/auth-settings.spec.ts` — 13 senaryo (giriş/hata/çıkış,
  şube değişimi + kalıcılık, ayar sekmeleri, izin matrisi toggle + denetim, yetkisiz
  görünümler, mobil giriş); `e2e/shell.spec.ts` kimlikli akışa uyarlandı. 25/25 PASS,
  22 ekran görüntüsü repoya commitlendi.

### Düzeltildi
- `ListAuditQueryDto` skip/take: query param string'leri için `@Type(() => Number)`
  eksikti → `take must be an integer number` 400 hatası.
- `SetRolePermissionsDto` / `SetStaffRolesDto` / `SetStaffBranchesDto` / `CreateStaffDto`:
  doğrulama dekoratörü olmayan dizi alanları ValidationPipe `whitelist:true` tarafından
  sessizce strip ediliyordu → izin matrisi yazımı boş listeye sıfırlanıyordu. `@IsArray`
  + `@IsString({ each: true })` eklendi; test uygulamasına da main.ts ile aynı
  ValidationPipe verildi (üretim paritesi).
- Dashboard "Platform bileşenleri" E2E iddiası strict mode ihlaline yol açıyordu
  ('Çalışıyor' etiketi iki satırda) — `.first()` ile düzeltildi.

### Bilinen sınırlar
- Web tokenları localStorage'dadır (XSS yüzeyi) — Faz 15'te httpOnly cookie + CSRF
  stratejisine taşınacak (ADR-015).
- Sandbox'ta arka plan süreçleri oturumlar arası ölür; QA zinciri tek komutta
  (PG → API → Playwright) koşturulur.

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
