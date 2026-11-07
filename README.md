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
| `pnpm --filter @vetcore/web storybook` | Bileşen atölyesi (canlı, port 6006) |
| `pnpm --filter @vetcore/web storybook:build` + `storybook:test` | Statik build + bileşen testleri (smoke, etkileşim, a11y) |

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

## Kimlik, personel ve klinik ayarları (Faz 03)

- `/giris` — personel girişi: scrypt (N=16384) parola doğrulaması, HS256 access token
  (15 dk) + opak refresh token (30 gün, yalnızca SHA-256 hash saklanır) ile oturum açılışı;
  sentetik demo hesap ipuçları sayfada görünür.
- **Oturum yönetimi:** `POST /auth/login`, `POST /auth/refresh` (rotasyon + tekrar-kullanım
  algısı — çalıntı refresh kullanılırsa personelin tüm oturumları kapanır), `POST /auth/logout`,
  `GET /auth/me`, `PATCH /auth/active-branch`.
- **Guard zinciri (her uçta):** JwtAuthGuard (global) → PermissionsGuard (@RequirePermissions)
  → şube kapsamlı uçlarda BranchScopeGuard (X-Branch-Id / branchId; Şube A kullanıcısı
  Şube B kaydına erişemez).
- `/ayarlar` — klinik profili (settings.manage), şubeler (branch.manage), personel ve
  rol/şube atamaları (staff.manage), rol × izin matrisi (roles.manage — değişiklikler
  denetime önce/sonra yazılır), denetim kaydı görüntüleyici (audit.view).
- **İzin kataloğu:** clinical.sign, inventory.adjust, finance.refund, reports.export,
  audit.view, settings.manage, branch.manage, staff.manage, roles.manage, room.manage,
  warehouse.manage; sistem rol şablonları (Klinik Yöneticisi, Veteriner Hekim, Resepsiyon,
  Stok Yöneticisi, Finans) düzenlenebilir.

## Hasta sahipleri ve hastalar (Faz 04)

- `/sahipler` — sahip arama (ad-soyad kelime bazlı, telefon biçimden bağımsız normalize)
  ve listesi; yeni sahip formu gönderiminde **mükerrer kayıt uyarısı** (aynı telefon/
  e-posta güçlü, aynı ad-soyad zayıf sinyal) — otomatik birleştirme yapılmaz, kullanıcı
  "Yine de kaydet" ile açık karar verir.
- `/sahipler/[id]` — iletişim kanalları ve KVKK/iletişim rızaları; **bir sahip altında
  çoklu hasta** tablosu; yeni hasta formu (tür → ırk kademeli seçim, mikroçip, ilk kilo,
  başlangıç uyarısı); arşivleme (sebep zorunlu) ve **açık merge** (hastalar hedef
  sahibe taşınır, kaynak arşivlenir). Silme yoktur (ADR-018).
- `/hastalar` — hasta arama (ad, `HP-000N` kodu, mikroçip, sahip adı/telefonu) + tür
  filtresi; **alerji ve kronik hastalık uyarıları listede rozet olarak görünür**.
  Yalnız erişim yetkisi olan şubelerin kayıtları listelenir.
- `/hastalar/[id]` — uyarı yönetimi (ekle/çöz/yeniden aç), kilo geçmişi (doz hesabı
  için tüm ölçümler), **private storage dosyaları** (yükleme + yetkili indirme — dış
  URL sızmaz) ve **zaman çizelgesi iskeleti** (kilo/uyarı/dosya/denetim olayları;
  muayene akışı Faz 06'da bağlanacak).
- **Şube kapsamı (API düzeyinde):** hasta kayıtları kayıt şubesine bağlıdır; başka
  şubenin personeli listelerde görmez ve doğrudan erişimde 403 alır. Dosya indirme
  aynı kapsamla korunur (kimliksiz istek 401).
- **Yeni izinler:** `owner.manage`, `patient.manage`, `master.manage` (veteriner ve
  resepsiyon şablonlarında sahip/hasta yönetimi).

## Randevu takvimi ve akış panosu (Faz 05)

- `/takvim` — **gün/hafta/ay** görünümü, hekim ve oda filtreleri, önceki/sonraki/bugün
  gezinme; randevu satırında duruma göre Check-in / Beklemeye Al / Muayeneye Al /
  Tamamla / Gelmedi / İptal eylemleri. Randevu formu (hasta araması, tür → varsayılan
  süre, hekim, oda, tarih + saat + süre, not) hem oluşturma hem düzenleme için tek
  diyaloktur; takvim hücresinden detay açılır.
- **Çakışma kontrolü (API, Serializable transaction):** aynı hekim VEYA aynı oda için
  çakışan aktif randevu 409 `APPOINTMENT_CONFLICT` ile engellenir; iptal/gelmedi
  kayıtları engel değildir.
- **Çalışma saati politikası:** personelin `working` blokları (yoksa şube varsayılanı)
  esas alınır; dışı 422 `APPOINTMENT_OUTSIDE_WORKING_HOURS` döner. `appointment.override`
  iznindeki personel zorunlu gerekçe ile istisna açabilir (denetim kaydı `appointment.override`).
  `blocked` engelleri override edilmez (409 `APPOINTMENT_BLOCKED`).
- **Durum makinesi (ileri yönlü):** scheduled → arrived → waiting → in_consultation →
  completed; aktif aşamalardan cancelled/no_show çıkışı mümkün. Geçersiz sıralar
  409 `APPOINTMENT_INVALID_TRANSITION` ile reddedilir.
- `/akis-panosu` — hasta kuyruğu gerçek randevu satırlarından türetilir (Geldi /
  Beklemede / Muayenede şeritleri), 15 saniyede bir yenilenir; bekleme dakikaları,
  uyarı rozetleri ve kart içi eylemler.
- `/bekleme-listesi` — bekleyen kuyruk (tercih günü/saati/hekimi), randevuya çevirme
  (tüm randevu kuralları aynen uygulanır) ve iptal; randevuya çevrilen kayıtlar
  rozetle listelenir.
- **Saat dilimi:** aralıklar UTC instants olarak saklanır; gün/hafta sınırları ve
  çalışma saatleri klinik saat diliminde (Europe/Istanbul, sabit UTC+03) hesaplanır —
  birim testlerle doğrulanır.
- **Yeni izinler:** `appointment.manage` (veteriner + resepsiyon şablonlarında),
  `appointment.override` (veteriner + admin).

## Muayene, SOAP ve hizmet kataloğu (Faz 06)

- `/muayene` — hasta arama (ad, kod, mikroçip, sahip adı/telefonu), muayene listesi
  ve yeni muayene (taslak) diyaloğu; **muayene workbench'i** tek ekranda: hasta
  uyarı şeridi, SOAP editörü (S/O/A/P + başvuru şikâyeti + notlar), vital bulgu
  paneli (katalog: vücut sıcaklığı, ağırlık, kalp atışı, solunum, kapiler dolum,
  tansiyon, kan şekeri, ağrı skoru), tanı paneli (birincil/ikincil/diferansiyel),
  hizmet kaydı paneli ve addendum paneli.
- **İmza kilidi (API + UI birlikte):** `İmzala` düğmesi yalnız `clinical.sign` iznine
  görünür; imzalanan kayıt doğrudan update/delete edilemez (409 `ENCOUNTER_SIGNED`),
  tüm yazma alanları kilitlenir. Düzeltmeler addendum ile yapılır ve her addendum
  denetim defterine `ADDENDUM_CREATED` olarak yazılır (orijinal kayıt referanslı).
- **Vital geçmişi korunur:** aynı bulgunun her ölçümü ayrı satırdır; panel hem bu
  muayenenin ölçümlerini hem hastanın tür filtreli tüm geçmişini gösterir
  (üzerine yazma yok).
- `/hizmetler` — hizmet kataloğu: kod (klinikte tekil), ad, kategori, süre; şube
  override'lı **fiyat geçmişi** (geçerlilik aralıkları + "Süresi doldu" rozeti) ve
  varsayılan **tüketim kuralları** (Faz 08'de stok hareketine dönüşür). Yazma
  `service.manage` izni ister; izin yoksa salt-okunur.
- **Fiyat çözümleme:** geçerlilik penceresi → şube override (şube fiyatı genel
  fiyatı geçersiz kılar) → en yeni `validFrom`. Fiyatı olmayan hizmet muayeneye
  eklenemez (`SERVICE_PRICE_MISSING`); hizmet kaydı satırlarına fiyat çözümleme
  anında dondurulur.
- **Hizmet kesinleştirme:** Faz 06'da yalnız kayıt durumu kesinleşir; gerçek stok
  çıkışı ve ücretlendirme Faz 08 atomik işlemiyle bağlanır (arayüzde açıkça belirtilir).
- **Yeni izinler:** `encounter.manage` (muayene yazma), `service.manage` (katalog
  yazma); imza + addendum `clinical.sign`.

## Ürün, depo, lot ve stok defteri (Faz 07)

- **Defter append-only:** stok hareketleri ve satırları API'de yazma ucu olmadığı
  gibi veritabanı tetikleyicileriyle de korunur; düzeltme yalnızca gerekçeli
  telafi (adjustment) hareketiyle yapılır. Bakiye projeksiyonu defterle aynı
  işlemde yazılır — lot bazlı mutabakat API e2e ile doğrulanır.
- `/urunler` — ürün kartları (SKU/barkod/parti takip türü/min. stok), depo bazlı
  bakiyeler (düşük stok rozeti), FEFO sıralı partiler; **mal kabul** diyaloğu
  (lot kodu + son kullanma + birim maliyet; aynı lot tekrar gelirse birleştirilir,
  uyuşmazlıkta `LOT_CONFLICT`) ve **tüketim** diyaloğu (parti seçilmezse FEFO
  tahsis; süresi geçmiş ve karantina partileri bloklu — `LOT_BLOCKED`).
- `/partiler` — tüm partiler FEFO sırasıyla: "Süresi geçmiş", "N gün" ve
  "Karantina" rozetleri; karantinaya alma/serbest bırakma (denetimli);
  **soğuk zincir** sıcaklık kayıtları (depo bazlı ölçüm defteri).
- `/stok-hareketleri` — salt-okunur hareket defteri (tür filtresi; giriş +/çıkış −
  rozetleri; gerekçe/not/personel); **Transferler** sekmesi: iki aşamalı transfer
  kurulum → sevk (kaynak düşer, "Yolda") → teslim (hedef depoda parti açılır);
  **Sayım**: föy açılışında bakiyeler dondurulur, fark gerekçe ile tamamlandığında
  düzeltme hareketi + denetim kaydı üretilir.
- `/tedarikciler` — tedarikçi kataloğu (mal kabul ve iade hareketlerinde referans).
- **Eş zamanlı tüketim güvenliği:** çıkışlar atomik koşullu azaltımla yazılır
  (`qtyOnHand >= qty`); aynı partiye paralel iki tüketimden biri `INSUFFICIENT_STOCK`
  alır — negatif stok oluşamaz (API e2e ile kanıtlanır).
- **Yeni izinler:** `product.manage`, `supplier.manage`, `inventory.receive`,
  `inventory.consume`, `inventory.transfer`; sayım/düzeltme `inventory.adjust`,
  sıcaklık `warehouse.manage`. Tek şubeli kullanıcı hedef şube depolarını
  görmez; çok şubeli kurulum/transfer yetkisi erişilen tüm şubeleri kapsar.

## Ekran Görüntüleri

Aşağıdaki görüntüler standart faz sonu Playwright E2E koşusundan alınmıştır
(`pnpm --filter @vetcore/web e2e` → `apps/web/e2e/screenshots/`); her faz sonunda
güncellenir. Tüm veriler sentetiktir.

### Web — Genel Bakış kontrol paneli (`/`)

![Web kontrol paneli](docs/screenshots/web-kontrol-paneli.png)

- **Sol kabuk:** 248 px derin-teal kenar çubuğu — 13 bölüm, açılır gruplar; henüz
  aktifleşmemiş yapraklar faz rozetiyle (F05, F07…) pasif gösterilir, sahte iş akışı yoktur.
- **Üst çubuk:** şube seçici (Merkez/İkinci Şube), global arama alanı (Faz 04'te aktif),
  bildirimler, yardım ve profil.
- **KPI kartları:** sentetik gün özeti — Bugünkü Randevular 12, Bekleyen Hastalar 4,
  Günlük Ciro ₺18.450 (tabular numerals), Kritik Stok 7.
- **Bugünün programı:** klinik terminolojisiyle sentetik randevu tablosu; durumlar
  renk + ikon + metin ile gösterilir (Beklemede / Sürüyor / Planlandı / Tamamlandı).
- **Platform bileşenleri:** Web/API/PostgreSQL canlı durumu — API yanıtı zod sözleşmesiyle
  doğrulanır (bu koşuda canlı: hepsi yeşil).
- **Durum hikâyeleri:** yükleme (skeleton), boş, hata (tekrar deneme yolu) ve yetkisiz
  görünümleri tek ekranda.
- **Faz planı:** 15 fazın durumu — Faz 01–08 Tamamlandı, Faz 09 Sırada.

### Web — Giriş sayfası (`/giris`, Faz 03)

![Giriş sayfası](docs/screenshots/web-giris.png)

Scrypt karma doğrulamalı personel girişi; sentetik demo hesap ipuçları kart altında.
Hatalı parola denemeleri hata zarfıyla döner ve `auth.login.failed` olarak denetlenir.

### Web — Aktif şube seçimi (üst çubuk, Faz 03)

![Şube değişimi](docs/screenshots/web-sube-degisimi.png)

Şube seçici oturum verisinden gelir; seçim `PATCH /auth/active-branch` ile Session kaydına
yazılır ve şube kapsamlı isteklerin kapsamını belirler. Sayfa yenilendiğinde seçim korunur.

### Web — Klinik ayarları: profil, personel, izin matrisi, denetim (`/ayarlar`, Faz 03)

![Klinik profili](docs/screenshots/web-ayarlar-klinik-profili.png)

Klinik kimliği, yerelleştirme ve para birimi; settings.manage izni olmayan personel
salt-okunur görür.

![Personel](docs/screenshots/web-ayarlar-personel.png)

Personel listesi rol/şube rozetleriyle; yeni personel diyaloğu çoklu rol ve şube atamasıyla
scrypt karma parola oluşturur.

![İzin matrisi](docs/screenshots/web-ayarlar-izin-matrisi.png)

Rol × izin matrisi — her anahtar değişimi `PUT /roles/:id/permissions` ile yazılır ve
denetim defterine önce/sonra listeleriyle işlenir.

![Denetim kaydı](docs/screenshots/web-ayarlar-denetim.png)

Silinmez denetim defteri: giriş, yetki ve ayar değişiklikleri; eylem filtresi ve sayfalama.

### Web — Yetkisiz görünüm (resepsiyon rolü, Faz 03)

![Yetkisiz görünüm](docs/screenshots/web-yetkisiz-gorunum.png)

staff.manage / audit.view izni olmayan personel kilitli durum hikâyesini görür; API
guard'ı aynı uçları 403 ile korur.


### Web — Sahip listesi (`/sahipler`, Faz 04)

![Sahip listesi](docs/screenshots/web-sahipler-listesi.png)

### Web — Mükerrer kayıt uyarısı (Faz 04)

![Mükerrer uyarı](docs/screenshots/web-mukerrer-uyarisi.png)

Aynı telefonla yeni sahip kaydı girildiğinde adaylar ve eşleşme nedenleri gösterilir;
otomatik birleştirme yapılmaz — "Yine de kaydet" açık onayı gerekir.

### Web — Sahip detayı ve çoklu hasta (Faz 04)

![Sahip detayı](docs/screenshots/web-sahip-detay-hastalar.png)

### Web — Hasta listesi, uyarı rozetleri (Faz 04)

![Hasta listesi uyarılar](docs/screenshots/web-hasta-listesi-uyarilar.png)

Alerji/kronik uyarıları listede önem derecesine göre renkli rozet + ikon + metinle
görünür (renk tek başına bilgi taşımaz).

### Web — Hasta detayı: uyarılar, kilo, dosyalar (Faz 04)

![Hasta detayı](docs/screenshots/web-hasta-detay.png)

### Web — Hasta zaman çizelgesi iskeleti (Faz 04)

![Zaman çizelgesi](docs/screenshots/web-hasta-zaman-cizelgesi.png)

### Web — Dosya yükleme, private storage (Faz 04)

![Dosyalar](docs/screenshots/web-hasta-dosyalar.png)

İndirme yalnızca Bearer kimlik + şube kapsamı doğrulayan API ucuyla akar; dosya URL'si
dışarıya sızmaz (ADR-018).

### Web — Hasta arşivleme (sebep zorunlu, Faz 04)

![Hasta arşiv](docs/screenshots/web-hasta-arsiv.png)

### Web — Yetkisiz şube görünümü (stok rolü, Faz 04)

![Yetkisiz şube](docs/screenshots/web-yetkisiz-sube-hastalar.png)

Yalnızca İkinci Şube'ye erişimi olan personel Merkez hastalarını listelerde görmez;
API aynı kayda doğrudan erişimde 403 döner.

### Web — Randevu takvimi, gün görünümü (`/takvim`, Faz 05)

![Takvim gün](docs/screenshots/web-f05-01-takvim-gun.png)

### Web — Yeni randevu formu ve oluşturma (`/takvim`, Faz 05)

![Yeni randevu](docs/screenshots/web-f05-02-yeni-randevu.png)

### Web — Çakışma hatası (aynı hekim/oda, Faz 05)

![Çakışma hatası](docs/screenshots/web-f05-03-cakisma-hatasi.png)

### Web — Çalışma saati dışı + yetkili override (`/takvim`, Faz 05)

![Override](docs/screenshots/web-f05-04-override-randevu.png)

### Web — Durum geçişleri ve iptal gerekçesi (`/takvim`, Faz 05)

![Durum geçişleri](docs/screenshots/web-f05-05-durum-gecisleri.png)

### Web — Akış panosu (`/akis-panosu`, Faz 05)

![Akış panosu](docs/screenshots/web-f05-06-akis-panosu.png)

### Web — Bekleme listesi ve randevuya çevirme (`/bekleme-listesi`, Faz 05)

![Bekleme listesi](docs/screenshots/web-f05-07-bekleme-listesi.png)

### Web — Hafta görünümü + hekim/oda filtreleri (Faz 05)

![Hafta filtreler](docs/screenshots/web-f05-08-hafta-filtreler.png)

### Web — Ay görünümü (Faz 05)

![Takvim ay](docs/screenshots/web-f05-09-takvim-ay.png)

### Mobil — takvim ve akış panosu (Faz 05)

![Mobil takvim](docs/screenshots/mobil-f05-takvim.png)

![Mobil akış panosu](docs/screenshots/mobil-f05-akis-panosu.png)

![Mobil bekleme listesi](docs/screenshots/mobil-f05-bekleme-listesi.png)

### Mobil — sahipler ve hastalar (Faz 04)

![Mobil sahipler](docs/screenshots/mobil-sahipler.png)

![Mobil hastalar](docs/screenshots/mobil-hastalar.png)

### Mobil — giriş sayfası (Faz 03)

![Mobil giriş](docs/screenshots/mobil-giris.png)


### Web — Ürünler, partiler ve stok defteri (Faz 07)

![Ürünler](docs/screenshots/web-f07-01-urunler.png)

Ürün listesi, depo bazlı bakiyeler (düşük stok rozetli) ve FEFO sıralı parti
paneli tek ekranda; mal kabul ve tüketim diyaloğu izinle görünür.

![Mal kabul ve defter](docs/screenshots/web-f07-03-mal-kabul-defter.png)

Mal kabul lot/SKT/maliyet ile `goods_receipt` hareketi yazar; defterde parti
kodu ve maliyet görünür (append-only — güncelleme/silme yoktur).

![Partiler ve son kullanma](docs/screenshots/web-f07-05-partiler.png)

FEFO sıralı parti tablosu: süresi geçmiş parti "Süresi geçmiş", karantina
partisi "Karantina" rozetiyle bloklu görünür; aksiyon karantinayı tersine
çevirir ve denetim kaydı üretir.

![Defter filtre](docs/screenshots/web-f07-08-defter-filtre.png)

Hareket defteri tür filtresiyle: Mal Kabul, Tüketim, Düzeltme, Transfer
Sevk/Teslim, Tedarikçi İadesi; her satır işaretli miktar rozeti taşır.

![Transfer yolda](docs/screenshots/web-f07-09-transfer-yolda.png)

İki aşamalı transfer: sevk sonrası durum "Yolda" olur, kaynak stok düşer;
teslim hedef şube yetkisiyle yapılır ve hedef depoda aynı özelliklerde parti açar.

![Transfer teslim](docs/screenshots/web-f07-10-transfer-teslim.png)

Teslim sonrası "Teslim Alındı"; satırda hedef depoda açılan parti kodu görünür.

![Sayım](docs/screenshots/web-f07-11-sayim-tamam.png)

Sayım föyü: beklenen/sayılan/fark sütunları; gerekçe girilmeden tamamlama
düğmesi kapalıdır — tamamlama farklar için düzeltme hareketi yazar.

![Tedarikçiler](docs/screenshots/web-f07-12-tedarikciler.png)

Tedarikçi kataloğu; yazma `supplier.manage` izni ister.

![Yetkisiz ürün görünümü](docs/screenshots/web-f07-13-yetkisiz-urunler.png)

Resepsiyon rolünde ürün sayfası salt-okunurdur: mal kabul/yeni ürün/tüketim
aksiyonları hiç görünmez (izin bazlı UI).

## Hizmet → stok → ücret atomik iş akışı (Faz 08)

- **Atomik kesinleştirme:** hizmet kaydı kesinleştirildiğinde klinik kayıt
  (finalized) + stok defter hareketi (`refType=ServiceRecord` — hareketten
  kaynak kayda, partiden lot+SKT'ye izlenebilirlik) + `Charge`/`ChargeLine`
  (fiyatlar kayıt satırından dondurulur) + denetim kaydı TEK transaction'da
  yazılır; stok yazım hatası tüm işlemi geri alır (API e2e ile kanıtlanır).
- **Tüketim onayı diyaloğu:** `ServiceConsumptionRule` kuralından kural planı
  (miktar = defaultQty × hizmet adedi), ürün için seçilebilir stoğu en yüksek
  depo önerisi ve politika bazlı parti tahsisi (FIFO / SKT-yakın; süresi geçmiş
  ve karantina partileri seçilemez). Kullanıcı gerçek miktarı, depoyu ve lotu
  düzenleyip onaylar; yetersiz seçilebilir stokta onay kilitli ve uyarı görünür.
- **Idempotency:** kesinleştirme gövdesi/`Idempotency-Key` başlığı UUID anahtar
  taşır — aynı anahtarla gelen mobil tekrar denemesi REPLAY döner (duplicate
  hareket/ücret yok), farklı anahtar 409 döner.
- **İptal (Reversal):** kesinleşmiş kayıt gerekçeyle iptal edilir — ters stok
  hareketi (stoğa iade) + negatif `service_reversal` ücret satırı yazılır,
  orijinal veriler asla silinmez; tam iadede ücret `void` olur (append-only).
- **Yetkilendirme:** tüketim gerektiren kesinleştirme/iptal `inventory.consume`
  izni ister (API düzeyinde 403); resepsiyon gibi izinsiz rollerde arayüz
  aksiyonlarını hiç göstermez.
- **Demo kural bağlantıları:** Genel Muayene→Eldiven (partisiz), Kuduz
  Asısı→Kuduz aşısı (SKT-yakın, zorunlu), Kan Biyokimyası→Hemogram kiti
  (tamamı karantinada — uyarı senaryosu), Kısırlaştırma→Amoksisilin (çok partili
  FEFO; süresi geçmiş parti elenir) + İV kateter.

### Web — Kesinleştirme, ücret ve reversal (Faz 08)

![Kesinleştirme önizlemesi](docs/screenshots/web-f08-01-kesinlestirme-onizlemesi.png)

Tüketim onayı diyaloğu: kural planı, parti seçim listesi (lot · SKT · kalan)
ve ücret önizlemesi; bloklu partiler devre dışıdır.

![Parti seçim diyaloğu](docs/screenshots/web-f08-03-parti-secim-diyalogu.png)

Parti takipli üründe tahsis: önerilen parti (SKT yakını) önceden seçilir;
kullanıcı düzenleyebilir.

![Kesinleşmiş ve ücretli](docs/screenshots/web-f08-02-kesinlesmis-ucretli.png)

Atomik post sonrası: kayıt "Kesinleşti", ücret rozeti ve satır dökümü görünür;
iptal (reversal) aksiyonu kullanılabilir.

![Reversal](docs/screenshots/web-f08-05-reversal-iptal-edildi.png)

İptal sonrası: "İptal edildi" rozeti, negatif düzeltme satırı ("İptal —") ve
`void` ücret — orijinal satırlar listede kalır (append-only).

![Yetersiz stok uyarısı](docs/screenshots/web-f08-06-yetersiz-stok-uyarisi.png)

Karantinadaki tek partili hizmet (Kan Biyokimyası → Hemogram kiti): yetersiz
seçilebilir stok uyarısı ve kilitli onay düğmesi.

![Yetkisiz hizmet görünümü](docs/screenshots/web-f08-07-yetkisiz-gorunum.png)

Resepsiyon rolünde hizmet paneli salt-okunur: kesinleştirme/iptal aksiyonları
hiç görünmez.

### Mobil — hizmet kesinleştirme (Faz 08)

![Mobil kesinleştirme önizlemesi](docs/screenshots/mobil-f08-01-kesinlestirme-onizlemesi.png)

![Mobil kesinleşmiş kayıt](docs/screenshots/mobil-f08-02-kesinlesmis-ucretli.png)

Mobil kırılımda tüketim diyaloğu ve ücret rozeti; sayfada yatay taşma yoktur
(E2E iddiası).

### Mobil — ürünler ve partiler (Faz 07)

![Mobil ürünler](docs/screenshots/mobil-f07-14-mobil-urunler.png)

![Mobil partiler](docs/screenshots/mobil-f07-14-mobil-partiler.png)

Mobil kırılımda tablolar kart içinde yatay kaydırılabilir; sayfada yatay taşma
yoktur (E2E iddiası).

### Web — Reçeteler: taslak, doz onayı, imza (Faz 10)

![Reçete taslağı ve doz yardımcısı](docs/screenshots/web-f10-02-doz-yardimcisi-satir.png)

Reçete detayında doz yardımcısı formülü (`20 kg × 10 mg/kg = 200 mg`) görünür
tutulur; öneri satıra işlendiğinde imza, açık veteriner onayı verilmeden
bloklanır — kabul kriteri "hiçbir doz otomatik kesinleşmez".

![İmza bloku](docs/screenshots/web-f10-03-imza-bloku.png)

Onaysız doz önerisiyle imza denemesi hata zarfıyla reddedilir (409
`DOSE_NOT_APPROVED`).

![İmzalı reçete](docs/screenshots/web-f10-04-imzali-recete.png)

Veteriner onayı sonrası imza reçeteye klinik tekil numarayı (`REC-####`)
atar; imzalı reçete değişmez, dağıtım/uygulama kayıtları buradan yürür.

![Dağıtım](docs/screenshots/web-f10-05-dagitim.png)

Depodan dağıtım: FEFO önerili parti seçimi, stok defterine tüketim hareketi;
event + hareket tek transaction'da.

![Uygulama kaydı](docs/screenshots/web-f10-06-uygulama-kaydi.png)

İlaç uygulama kaydı hastaya fiilen verilen dozu tutar; dağıtımdan
(prescribed→dispensed→administered ayrışması) bağımsızdır.

![Resepsiyon kısıtlı görünüm](docs/screenshots/web-f10-07-resepsiyon-kisitli.png)

Resepsiyon rolünde imza ve doz onayı düğmeleri hiç üretilmez (izin bazlı UI).

### Web — Aşı kaydı, takvim ve hatırlatmalar (Faz 10)

![Aşı protokolü](docs/screenshots/web-f10-08-protokol-tanimi.png)

Aşı takvimi klinik protokolüyle yapılandırılır: ilk doz yaşı, tekrar aralığı
ve hatırlatma önceliği kliniğe aittir — sabit evrensel takvim yoktur.

![Aşı kaydı parti + SKT](docs/screenshots/web-f10-09-asi-kaydi-lot-skt.png)

Aşı kaydı lot kodu ve son kullanma tarihini partiden dondurur ve uygulama
stoğunu aynı transaction'da düşürür; süresi geçmiş/karantinalı parti reddedilir.

![Aşı takvimi](docs/screenshots/web-f10-10-asi-takvimi.png)

Hasta aşı takvimi protokollerden türetilir; gecikmiş/yaklaşan/ileri tarih
rozetleriyle listelenir.

![Hatırlatma gönderimi](docs/screenshots/web-f10-11-hatirlatma-gonderimi.png)

Hatırlatma aynı aşı kaydı için tekilleşir; gönderim işareti + denetim kaydı
üretir, ikinci gönderim 409 döner.

### Mobil — reçeteler ve aşılar (Faz 10)

![Mobil reçeteler](docs/screenshots/mobil-f10-receteler.png)

![Mobil aşılar](docs/screenshots/mobil-f10-asisler.png)

Mobil kırılımda reçete listesi ve aşı sekmeleri taşmasız yüklenir (E2E iddiası).

### Web — Tasarım sistemi rehberi (`/stil-rehberi`)

![Stil rehberi](docs/screenshots/web-stil-rehberi.png)

Renk tokenları (marka/nötr/durum/accent), tipografi ölçeği + Türkçe glif paneli
(İ ı Ş ş Ğ ğ Ü ü Ö ö Ç ç), buton varyantları, form düzeni (etiket üstte, ipucu altta,
hata alanın yanında), durum rozetleri, yoğun tablo (sağa hizalı sayısal sütunlar),
modal/çekmece/toast tetikleyicileri ve durum hikâyeleri. Kabul kriteri gereği
loading/empty/error/unauthorized hikâyeleri burada da görüntülenir.

### Web — Modal örneği (kesinleştirme onayı)

![Modal örneği](docs/screenshots/web-stil-rehberi-modal.png)

Modal yalnızca odaklı onay/görev için kullanılır: kesinleştirme uyarısı, vazgeç ve
onay eylemleri. Gerçek kesinleştirme akışı Faz 06'da bağlanır.

### Tablet (768 px) — çekmece ile gezinme sonrası stil rehberi

![Tablet çekmece](docs/screenshots/tablet-cekmece-stil-rehberi.png)

Tablet genişliğinde kenar çubuğu gizlenir; hamburger düğmesiyle açılan Sheet çekmecesindeki
"Tasarım Sistemi" bağlantısıyla gezinilir (görüntü, gezinme tamamlanıp çekmece kapandıktan
sonraki durumu gösterir). Sayfada yatay taşma yoktur (E2E iddiası).

### Mobil (iPhone 14, 390 px) — tek kolon düzen

![Mobil genel bakış](docs/screenshots/mobil-genel-bakis.png)

Mobilde KPI kartları tek kolona düşer, tablo kart içinde yatay kaydırılabilir kalır,
üst çubuk hamburger + şube + bildirim + profile iner. `min-width:auto` kaynaklı 128 px
taşma hatası bu görüntünün alındığı E2E koşusunda düzeltilmiştir.

### Mobil — çekmece menü açık

![Mobil çekmece](docs/screenshots/mobil-cekmece.png)

Mobil viewportta kenar çubuğuna erişim: hamburger → Sheet çekmece; Escape veya dış
tıklama ile kapanır, bağlantı seçimi çekmeceyi otomatik kapatır.

> Görüntü seti `docs/screenshots/` altında README için küratörlüüdür; tam ve ham E2E
> çıktısı `apps/web/e2e/screenshots/` altında tutulur.

## Kasa, tahsilat, cari hesap ve giderler (Faz 09)

- **Tahsilat:** nakit/kart/havale/diğer ödeme alınır; tutar sahibin açık
  ücretlerine **FIFO dağıtım** ile bağlanır (`PaymentAllocation` — append-only).
  Kısmi ödeme ücreti `partial` durumuna taşır, tam kapatan tahsilat `paid`
  yapar; ücretleri aşan tutar **ileri kredi** olarak cari hesapta izlenir.
  Tahsilat gövdesindeki `idempotencyKey` ile aynı anahtarlı mobil tekrar
  denemesi REPLAY döner (çift kayıt imkânsız; eşzamanlı istekte P2002 yarış
  güvencesi).
- **İade:** orijinal tahsilata bağlı append-only `Refund` kaydı; iade toplamı
  tahsilat − önceki iadeleri aşamaz, gerekçe zorunludur ve
  `REFUND_CREATED` denetimi yazılır. Ucu `finance.refund` izni ister
  (veteriner/resepsiyon API düzeyinde 403 alır — e2e ile kanıtlanır);
  arayüzde izinsiz rollere İade düğmesi hiç gösterilmez.
- **Kasa:** şube başına kasa tanımı (`CashRegister`); kasa başına tek açık
  oturum **kısmi tekil indeksle** veritabanı düzeyinde garanti edilir.
  Oturumda beklenen tutar = açılış + giriş − çıkış; tahsilat/iade/gider ve
  elle giriş-çıkış hareketleri append-only `CashMovement` defterine yazılır.
- **Kasa kapanışı:** sayım ile beklenen tutar farkı hesaplanır; **fark ≠ 0
  ise açıklama zorunludur** (servis + DB CHECK iki katmanda) ve
  `CASH_SESSION_CLOSED` denetimi yazılır. Kapalı oturuma hareket yazılamaz.
- **Cari ekstre:** sahip bazında ücret(+), tahsilat(−), iade(+) satırları
  kronolojik koşan bakiyeyle listelenir; üç kayıt tipinin ilişkisi tek ekranda
  görünür (`/cari`).
- **Gider ve tedarikçi borcu:** gider kaydı (`/giderler`) — nakit gider açık
  kasa oturumuna bağlanır ve kasadan çıkış hareketi üretir;
  `SupplierPayable` kısmi ödemeyle izlenir, bakiye kapanınca `settled` olur
  (denetim yazımı ile). E-fatura/e-arşiv **iddiası yoktur** — yalnızca ileride
  provider adapter'i için arayüz alanı ayrılmıştır.
- **Para hassasiyeti:** tüm money alanları `Decimal(12,2)`; bakiye hesapları
  kuruş tam sayısı üzerinden yapılır (0.1 + 0.2 türü kayma imkânsız —
  birim ve e2e testleriyle kanıtlanır).

### Web — Tahsilat önizlemesi ve kayıt (Faz 09)

![Tahsilat önizlemesi](docs/screenshots/web-f09-01-tahsilat-onizlemesi.png)

![Tahsilat kaydedildi](docs/screenshots/web-f09-02-tahsilat-kaydedildi.png)

FIFO dağıtım önizlemesi ücret bakiyeleriyle; kayıt sonrası listede net tutar.

### Web — Cari ekstre (Faz 09)

![Cari ekstre](docs/screenshots/web-f09-03-cari-ekstre.png)

Ücret(+)/tahsilat(−)/iade(+) satırları ve koşan bakiye.

### Web — Kasa oturumu ve fark açıklaması (Faz 09)

![Kasa açık](docs/screenshots/web-f09-04-kasa-acik.png)

![Fark açıklaması zorunlu](docs/screenshots/web-f09-05-fark-aciklamasi-zorunlu.png)

![Kasa kapandı](docs/screenshots/web-f09-06-kasa-kapandi.png)

Canlı beklenen tutar; −10 TL farkta açıklama zorunlu hata durumu ve açıklamayla kapanış.

### Web — Gider ve iade (Faz 09)

![Gider kaydedildi](docs/screenshots/web-f09-07-gider-kaydedildi.png)

![İade diyaloğu](docs/screenshots/web-f09-08-iade-diyalogu.png)

![İade kaydedildi](docs/screenshots/web-f09-09-iade-kaydedildi.png)

Gider listesi + açık tedarikçi borcu kartı; iade diyaloğu iade edilebilir kalanı gösterir.

### Web — Yetkisiz kullanıcı (Faz 09)

![Yetkisiz tahsilat](docs/screenshots/web-f09-10-yetkisiz-tahsilat.png)

Veteriner rolünde Tahsilat Al ve İade aksiyonları hiç görünmez (salt-okunur).

### Mobil — kasa (Faz 09)

![Mobil kasa](docs/screenshots/mobil-f09-11-mobil-kasa.png)

Mobil kırılımda kasa kartları ve hareket defteri tek kolona düşer; yatay taşma
yoktur (E2E iddiası).

## Storybook — tasarım sistemi atölyesi (ADR-017)

UI bileşenleri [Storybook 10](https://storybook.js.org/) ile izole geliştirilir ve
sınanır: her story uygulamanın gerçek `globals.css` token'larıyla (Tailwind 4) aynı
şekilde çizilir. Her faz sonunda standart zincirin 4. adımı olarak test-runner
koşar: render smoke + `play` etkileşim testleri + **axe erişilebilirlik kapısı**
(herhangi bir ihlal koşuyu düşürür). Görüntüler
`node scripts/storybook-screenshots.mjs` ile `docs/screenshots/storybook/`
altında üretilir ve her fazla güncellenir.

```bash
pnpm --filter @vetcore/web storybook          # canlı atölye → http://localhost:6006
pnpm --filter @vetcore/web storybook:build    # statik build (storybook-static/)
pnpm --filter @vetcore/web storybook:test     # test-runner: 99/99 PASS (smoke + play + a11y)
node scripts/storybook-screenshots.mjs        # ekran görüntülerini yenile
```

### Storybook arayüzü — kenar çubuğu, Controls ve Accessibility paneli

![Storybook arayüzü](docs/screenshots/storybook/storybook-arayuzu.png)

### StatusChip — beş ton; durum daima ikon + metin ile (renk tek ipucu değil)

![StatusChip tüm tonlar](docs/screenshots/storybook/design-system-statuschip--tum-tonlar.png)

### Button — altı varyant; beyaz metin primary üstünde WCAG AA (4.81:1)

![Button varyantlar](docs/screenshots/storybook/ui-button--varyantlar.png)

### KpiCard — trend yönlü ritim; tabular numerals

![KPI kartları](docs/screenshots/storybook/design-system-kpicard--kart-dizilimi.png)

### StateViews — hata durumu her zaman tekrar deneme yolu sunar (play testi ile sınanır)

![Hata durumu](docs/screenshots/storybook/design-system-stateviews--hata-durumu.png)

### Mobil (390 px) — bileşenler dar viewportta da taşmaz

![Mobil StatusChip](docs/screenshots/storybook/design-system-statuschip--tum-tonlar-mobil.png)

> Not: a11y kapısının ilk koşusu 15 kontrast ihlali yakaladı; marka/nötr/durum
> token'ları WCAG AA üstüne çekildi (bkz. `CHANGELOG.md` 0.2.1 ve `scripts/compute-contrast.py`).
> Koyu tema story'leri ve Next.js kabuk (App Router navigation mocking) story'leri
> sonraki iyileştirme adımlarıdır.

## Kalite kapıları

- TypeScript `strict`; ESLint + Prettier; CI: lint → typecheck → test → migration → seed → build.
- Her faz `prompts/phases/phase-XX-*-test.md` promptu geçmeden tamamlanmış sayılmaz.
- **Her faz sonunda standart Playwright E2E koşusu ve güncel ekran görüntüleri zorunludur**
  (bkz. `docs/TEST_STRATEGY.md` — Standart faz sonu doğrulaması).
- **Her faz sonunda Storybook bileşen testleri (smoke + etkileşim + axe a11y) ve güncel
  `docs/screenshots/storybook/` görüntüleri zorunludur** (ADR-017).
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
