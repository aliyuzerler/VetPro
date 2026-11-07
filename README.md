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
- **Faz planı:** 15 fazın durumu — Faz 01–06 Tamamlandı, Faz 07 Sırada.

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
pnpm --filter @vetcore/web storybook:test     # test-runner: 18/18 PASS (smoke + play + a11y)
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
