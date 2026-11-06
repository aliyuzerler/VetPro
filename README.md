# VetCore — Veteriner Klinik Yönetim Platformu

> Çalışma adı: **VetCore**. Marka, alan adı ve ticari marka uygunluğu ayrıca kontrol edilmelidir.

VetCore; veteriner kliniklerinin hasta ve hasta sahibi kayıtlarını, randevularını, muayene ve tedavi süreçlerini, aşı ve reçete kayıtlarını, depo/stok hareketlerini, satın alma işlemlerini, kasa/cari hesaplarını, personel ve operasyonlarını tek sistemde birleştiren **Web + React Native** çözümüdür.

## Ticari model ve ürün sınırları

- İlk sürüm **tek seferlik/perpetual lisans** ile müşteriye özel kurulum olarak tasarlanır. Ürün içinde abonelik, deneme süresi, otomatik tahsilat veya abonelik kilidi bulunmaz.
- Her klinik müşterisi için ayrı kurulum ve veritabanı varsayılandır. Tek kurulum içinde aynı müşterinin birden fazla şubesi desteklenir.
- İleride SaaS/abonelik modeline geçişi kolaylaştırmak için kayıtlar `clinic_id` ve `branch_id` kapsamı taşır; ancak ilk sürümde merkezi çok kiracılı SaaS zorunluluğu yoktur.
- Mobil uygulama ilk sürümde **klinik personelinin** kullanımı içindir. Hayvan sahibi uygulaması ayrı bir ürün/opsiyonel faz olarak değerlendirilir.

## Faz 01 — kurulan monorepo

```
vetcore/
  apps/
    web/                  # Next.js 16 klinik yönetim arayüzü (port 3000)
    mobile/               # Expo React Native personel uygulaması
    api/                  # NestJS modüler monolit REST API (port 4000)
    worker/               # BullMQ arka plan işleri (port 4100, Redis opsiyonel)
  packages/
    contracts/            # zod API sözleşmeleri (web/mobil/API ortak)
    domain/               # paylaşılan saf alan tipleri ve faz planı
    ui-tokens/            # tasarım tokenları (kaynak: design/tokens.json)
    config/               # tsconfig/eslint/paylaşılan yapılandırma
  prisma/                 # PostgreSQL şeması, migration ve seed
  infra/                  # docker-compose, Dockerfile'lar, nginx, backup
  docs/                   # gereksinim, mimari, veri modeli, güvenlik vb.
  design/                 # tasarım sistemi, ekran haritası, tokenlar
  rules/                  # kodlama, güvenlik, performans, UI/UX kuralları
  prompts/                # 15 faz için geliştirme ve test promptları
  scripts/                # geliştirme yardımcıları (gömülü PostgreSQL vb.)
```

## Hızlı başlangıç

Gereksinimler: Node.js 22+, pnpm 10 (corepack ile: `corepack enable`), Docker (altyapı servisleri için).

```bash
# 1) Bağımlılıklar
pnpm install

# 2) Altyapı servisleri (PostgreSQL + Redis + MinIO, healthcheck'li)
pnpm infra:up
# Docker yoksa: pnpm dev:postgres   # gömülü PostgreSQL (yalnızca yerel geliştirme)

# 3) Ortam dosyası
cp .env.example .env   # değerleri ortamınıza göre düzenleyin

# 4) Prisma migration + sentetik seed
pnpm db:migrate
pnpm db:seed

# 5) Uygulamalar (ayrı terminallerde)
pnpm dev:web        # http://localhost:3000
pnpm dev:api        # http://localhost:4000/api/v1/health
pnpm dev:worker     # http://localhost:4100/api/v1/health
pnpm dev:mobile     # Expo DevTools (QR ile cihaz/emülatör)
```

## Yararlı komutlar

| Komut | Açıklama |
|---|---|
| `pnpm build` | Tüm workspace'leri derle (Turborepo) |
| `pnpm lint` | ESLint (monorepo genelinde) |
| `pnpm typecheck` | TypeScript katı tip kontrolü |
| `pnpm test` | Birim + e2e testleri (Vitest) |
| `pnpm db:migrate` / `db:deploy` | Geliştirme migration / üretim migration |
| `pnpm db:seed` | Sentetik demo verisi |
| `pnpm dev:postgres up\|down` | Docker'sız gömülü PostgreSQL |
| `pnpm infra:up` / `infra:down` | Docker Compose altyapısı |

## API uçları (Faz 01)

- `GET /api/v1/health` — liveness (süreç durumu)
- `GET /api/v1/health/readiness` — bağımlılık durumu (PostgreSQL SELECT 1); bağımlılık yoksa **HTTP 503**
- `GET /api/docs` — Swagger/OpenAPI

## Uygulama kabuğu (Faz 02)

- `/` — Genel Bakış kontrol paneli önizlemesi: sentetik KPI kartları, bugünün programı,
  canlı platform bileşen durumu, yükleme/boş/hata/yetkisiz durum hikâyeleri ve faz planı.
- `/stil-rehberi` — Tasarım sistemi hikâye galerisi: renk tokenları, tipografi + Türkçe glifler,
  butonlar, form düzeni, durum rozetleri, yoğun tablo, modal/çekmece/toast ve durum hikâyeleri.
- Web kabuğu: sabit 248 px kenar çubuğu (13 bölüm, açılır gruplar), 72 px üst çubuk (şube seçici,
  arama, bildirimler, profil), en fazla 1600 px içerik; tablet/mobilde Sheet çekmecesi.
- Mobil kabuk (`apps/mobile`): token tabanlı tema, alt navigasyon (Bugün/Hastalar/Randevular/
  Görevler/Daha Fazla), güvenli alan dolgusu ve ≥44 pt dokunma hedefleri.

## Kalite kapıları

- TypeScript `strict`; ESLint + Prettier; CI: lint → typecheck → test → migration → seed → build.
- Her faz `prompts/phases/phase-XX-*-test.md` promptu geçmeden tamamlanmış sayılmaz.
- **Her faz sonunda standart Playwright E2E koşusu ve güncel ekran görüntüleri zorunludur**
  (bkz. `docs/TEST_STRATEGY.md` — Standart faz sonu doğrulaması).
- Durum takibi: `docs/IMPLEMENTATION_STATUS.md` ve `CHANGELOG.md`.

## ZCode ile çalışma

1. Projeyi ZCode'da aç; önce `agents.md` ve `docs/` klasörünü okut.
2. `prompts/phases/phase-01-foundation-build.md` ile başla.
3. Geliştirme tamamlanınca aynı fazın `-test.md` dosyasını ayrı çalıştır.
4. Test promptu geçmeden sonraki faza başlama.
5. Her faz sonunda `docs/DECISIONS.md`, `docs/IMPLEMENTATION_STATUS.md` ve `CHANGELOG.md` güncellensin.

## Başlamadan önce

- Klinik iş akışını en az bir veteriner hekim ve bir klinik yöneticisiyle doğrula.
- Resmi reçete, veteriner tıbbi ürün, kayıt ve faturalama yükümlülükleri için güncel mevzuatı uzmanla doğrula. Bu paket hukuki uygunluk belgesi değildir.
- Canlı verilerle geliştirme/test yapma; sentetik demo verisi kullan.
