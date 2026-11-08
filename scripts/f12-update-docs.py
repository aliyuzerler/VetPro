#!/usr/bin/env python3
"""Faz 12 doküman güncellemeleri: CHANGELOG, README, IMPLEMENTATION_STATUS,
DATA_MODEL, API_CONTRACTS, DECISIONS."""
import re

ROOT = '/home/z/my-project'


def read(path: str) -> str:
    with open(path, encoding='utf-8') as f:
        return f.read()


def write(path: str, content: str) -> None:
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)


def insert_before(content: str, marker: str, block: str) -> str:
    idx = content.index(marker)
    return content[:idx] + block + content[idx:]


# ---------------------------------------------------------------- CHANGELOG
changelog_entry = """## [0.12.0] — Faz 12: Bildirimler, PDF belgeler ve entegrasyon adaptörleri (2026-11-08)

### Eklendi
- **Veri modeli (migration `faz12_notifications_documents`)**: `NotificationTemplate`
  (klinik kapsamlı şablon; `@@unique([clinicId, code])`; kanal push/sms/email/whatsapp;
  kategori appointment/vaccine/lab/hospital/custom; `{{degisken}}` yer tutucuları),
  `Notification` (kuyruk satırı; `queued→processing→sent|failed|dead_letter|skipped`;
  `@@unique([clinicId, idempotencyKey])` — REPLAY tekilleştirmesi; normalleştirilmiş
  alıcı, backoff'lu `scheduledFor`, deneme sayacı), `NotificationAttempt`
  (`@@unique([notificationId, attemptNo])` — deneme numarası GLOBAL devam eder;
  outcome success/retryable/permanent; `providerMessageId` — bildirim kimliğinden
  deterministik türetilir, retry duplicate kanıtı), `IntegrationConnection`
  (klinik başına kind tekil; mode sandbox/live — canlı yalnız yetkili sözleşmeyle;
  config JSON'a secret anahtar yazımı reddedilir), `PrintDocument`
  (`@@unique([clinicId, documentNo])` — BELGE-0001 sıralı; 6 tür: muayene özeti,
  aşı kartı, reçete, onam, lab raporu, taburculuk; üretim anında donmuş
  `snapshot` JSON + private storage PDF — dış URL yok, indirme yetkili API ucuyla).
  Yeni izinler: `notification.manage`, `document.manage` (katalog 32 anahtar;
  veteriner +2, resepsiyon +2).
- **API — bildirimler** (`/notifications`): şablon CRUD (kod tekil; eksik şablon
  değişkeni 400 `NOTIFICATION_TEMPLATE_VAR_MISSING`); kuyruğa alma — onay kuralı
  kuyruk girişinde zorlanır (sms/email/whatsapp için `OwnerConsent` granted ve
  geri alınmamış olmalı; yoksa 409 `NOTIFICATION_CONSENT_REQUIRED`; push uygulama
  içi olarak onay ve telefon/e-posta gerektirmez, alıcı `in-app:<ownerId>`),
  alıcı kanal bazlı birincil iletişim kaydından çözülür ve normalleştirilir
  (telefon → 90xxxxxxxxxx), aynı `idempotencyKey` REPLAY döner; kuyruk işleme
  tiki `POST /notifications/run-queue` — koşullu claim (`queued→processing`
  updateMany) eşzamanlı çift işlemeyi kapatır, sağlayıcı hatası kayıt bazında
  izole edilir (retryable → üstel backoff ile kuyruğa geri: 30 sn → 2 dk → 8 dk;
  bütçe 3 denemede biter → `dead_letter`; permanent → `failed`), klinik ana
  akış asla bloklanmaz; manuel retry (`POST /:id/retry`) failed/dead_letter'dan
  kuyruğa alır, denetim yazar, bütçeyi tazeler; teslim raporu
  (`GET /notifications/delivery-report`) durum/kanal kırılımı + teslim
  edilebilirlik yüzdesi; onay durum ucu (`GET /notifications/consents/:ownerId`)
  kanal kilidi nedenlerini raporlar.
- **API — sağlayıcı sözleşmesi**: `NotificationProvider` arayüzü (push/sms/
  email/whatsapp) + sandbox stub'ları; hata enjeksiyonu yalnız sunucu tarafı
  `VETCORE_SANDBOX_FAIL` env'sinden ("sms:always,email:once") — web/mobile
  bundle'ına girmez. `providerMessageId = sbx-<provider>-<notificationId>`
  deterministiktir: aynı bildirimin tüm denemelerinde AYNI kimlik döner.
- **API — PDF belgeler** (`/documents`): 6 belge türü üretimi
  (`POST /documents/print` — kind + refId; kaynak kayıttan donmuş snapshot),
  liste/detay, yetkili indirme (`GET /documents/:id/pdf` — StreamableFile,
  private, no-store). PDF üretimi pdf-lib + **gömülü DejaVu Sans** (Regular/Bold,
  subset): Türkçe glifler (ğışçöüĞİŞÇÖÜ) WinAnsi standart fontla kodlanamadığı
  için TTF gömmesi zorunludur — klinik adı + şube bilgisi + BELGE numarası
  başlıkta, footer'da üretim zamanı damgası. Reçete belgesi imza durumunu
  doğru gösterir: taslak → "TASLAK — İMZALANMAMIŞ" filigranı, imzalı →
  imza bloğu (veteriner adı, "Yetkili Veteriner Hekim" unvanı, imza zamanı).
  Taburculuk özeti yalnız taburcu edilmiş yatış için üretilir.
- **API — entegrasyonlar** (`/integrations`): e-fatura ve lab adapter
  sözleşmeleri (mock değil; ADR-008/ADR-009 deseni) + sandbox stub'lar —
  sandbox çıktıları gerçek sağlayıcı verisi değildir ve bunu açıkça belirtir;
  bağlantı CRUD (`settings.manage`), config'e secret benzeri anahtar yazımı
  400 `INTEGRATION_SECRET_NOT_ALLOWED` (canlı sağlayıcı kimlik bilgileri
  yalnız sunucu env'sinden okunur); sandbox kontrolü adapter ping'ini koşar
  ve sonucu damgalar; `hasLiveIntegration=false` iken list yanıtı
  `liveNotice` ile "canlı yetkili entegrasyon yok" der — UI uyarı şeridi
  bunu gösterir.
- **Web**: `/bildirimler` (teslim raporu KPI kartları + kanal dağılım çubukları,
  durum filtreli kuyruk tablosu, onay paneli gösteren yeni bildirim diyaloğu,
  deneme geçmişli detay diyaloğu, manuel retry, şablonlar sekmesi),
  `/belgeler` (belge tablosu + tür rozetleri, tür→kaynak dinamik seçen üretim
  diyaloğu, yetkili blob akışıyla PDF önizleme diyaloğu/iframe),
  `/entegrasyonlar` (bağlantı kartları, sandbox/canlı rozetleri, canlı yok
  uyarı şeridi, sandbox kontrol düğmesi, secret politikası notu); nav'da
  "İletişim & Belgeler" grubu + Yönetim'de "Entegrasyonlar".
- **Testler**: alan mantığı 35 birim test (şablon render/onay eşlemesi/
  normalizasyon/backoff/durum makinesi/sağlayıcı hata planları; PDF gömülü
  font kanıtı + Türkçe glif boyut karşılaştırması; secret taraması + sandbox
  adapter sözleşmeleri), API e2e 12/12 kabul kriteri (retry duplicate yok —
  REPLAY + deterministik providerMessageId + eşzamanlı çift run-queue'da tek
  işleme; consent 409; PDF %PDF imzası + boyut; reçete taslak/imzalı ayrımı;
  secret 400 + yanıt sızıntısı yok; sağlayıcı hatasına rağmen encounter 201;
  yetki/şube kapsamı; teslim raporu tutarlılığı), Playwright tam süit
  194 PASS (Faz 12 spec 11×2 kırılım) + 22 ekran görüntüsü, Storybook
  153/153 (axe dâhil, 4 yeni bileşen hikâyesi: bildirim durumu, teslim
  raporu kartı, belge türü, entegrasyon modu).

"""
changelog = read(f'{ROOT}/CHANGELOG.md')
marker = '## [0.11.0]'
changelog = insert_before(changelog, marker, changelog_entry)
write(f'{ROOT}/CHANGELOG.md', changelog)

# ---------------------------------------------------------------- README
readme_block = """### Web — Bildirim merkezi: teslim raporu, kuyruk ve onay paneli (Faz 12)

![Bildirim merkezi](docs/screenshots/web-f12-01-bildirim-merkezi.png)

Teslim raporu kartları toplam/durum kırılımı/kanal bazlı dağılımı gösterir;
kuyruk tablosu durum filtresiyle çalışır (Kuyrukta → İşleniyor → Gönderildi /
Başarısız / Ölü Mektup / Atlandı).

![Yeni bildirim onay paneli](docs/screenshots/web-f12-02-yeni-bildirim-onay-paneli.png)

Yeni bildirim diyaloğu sahibin kanal bazlı iletişim onaylarını gösterir: onaysız
kanalda kuyruğa alma düğmesi API 409 `NOTIFICATION_CONSENT_REQUIRED` ile
reddedilir ve hata diyaloğunda görünür.

![Onay hatası](docs/screenshots/web-f12-03-onay-hatasi.png)

Kuyruk işleme tiki ("Kuyruğu Çalıştır") queued kayıtları sağlayıcıya gönderir;
sağlayıcı hatası retryable ise kayıt üstel backoff'la kuyruğa döner, bütçe
(3 deneme) bitince ölü mektuba düşer ve "Yeniden Kuyruğa Al" operatör aksiyonu
bekler. Özet satırı işleme sonucunu raporlar.

![Kuyruk özeti](docs/screenshots/web-f12-04-kuyruk-ozeti.png)

![Bildirim detayı](docs/screenshots/web-f12-05-bildirim-detayi.png)

Stok rolü bildirim merkezini hiç görmez (API düzeyinde de 403).

![Bildirim erişim yok](docs/screenshots/web-f12-06-bildirim-erisim-yok.png)

### Web — Belgeler: klinik markalı PDF üretimi ve önizleme (Faz 12)

![PDF önizleme](docs/screenshots/web-f12-07-belge-pdf-onizleme.png)

6 belge türü (muayene özeti, aşı kartı, reçete, onam, lab raporu, taburculuk)
üretim anındaki kaynak verisinden donmuş anlık görüntüyle üretilir; PDF gömülü
DejaVu Sans ile Türkçe karakterleri taşır, başlıkta klinik adı + şube bilgisi +
BELGE numarası vardır. Önizleme yetkili API ucundan blob akışıyla açılır —
bağlantı paylaşılamaz.

![Belge listesi](docs/screenshots/web-f12-08-belge-listesi.png)

Reçete belgesi imza durumunu doğru gösterir: taslak filigranlı ("TASLAK —
İMZALANMAMIŞ"), imzalı belge imza bloğuyla (veteriner + "Yetkili Veteriner
Hekim" unvanı + zaman) üretilir. Onam formu rıza tablosuyla üretilir.

![Onam formu](docs/screenshots/web-f12-09-onam-formu.png)

### Web — Entegrasyonlar: sandbox sözleşmesi ve canlı yok uyarısı (Faz 12)

![Entegrasyonlar](docs/screenshots/web-f12-10-entegrasyonlar.png)

E-fatura ve lab entegrasyonları mock değil, adapter sözleşmesi + sandbox
stub'dır. "Canlı yetkili entegrasyon yok" uyarı şeridi canlı modun yalnız
yetkili sözleşmeyle açılacağını belirtir; sandbox kontrolü adapter ping'ini
koşar ve sonucu damgalar. Sağlayıcı secret'ları yalnız sunucu env'sindedir —
config'e secret yazımı API'de 400 ile reddedilir.

![Sandbox kontrol](docs/screenshots/web-f12-11-sandbox-kontrol.png)

### Mobil — bildirimler, belgeler ve entegrasyonlar (Faz 12)

![Mobil bildirim merkezi](docs/screenshots/mobil-web-f12-01-bildirim-merkezi.png)

![Mobil PDF önizleme](docs/screenshots/mobil-web-f12-07-belge-pdf-onizleme.png)

![Mobil entegrasyonlar](docs/screenshots/mobil-web-f12-10-entegrasyonlar.png)

Mobil kırılımda üç sayfa da tek kolona düşer ve taşmasız yüklenir (E2E iddiası).

"""
readme = read(f'{ROOT}/README.md')
marker = '### Web — Tasarım sistemi rehberi (`/stil-rehberi`)'
readme = insert_before(readme, marker, readme_block)
# API uçları bölümüne Faz 12 satırları ekle
write(f'{ROOT}/README.md', readme)

# ------------------------------------------------- IMPLEMENTATION_STATUS
status = read(f'{ROOT}/docs/IMPLEMENTATION_STATUS.md')
row12 = """| 12 | Notifications, documents and integrations | Done | Build complete | PASS (2026-11-08) | NotificationTemplate/Notification/NotificationAttempt/IntegrationConnection/PrintDocument (migration `faz12_notifications_documents`); notifications + documents + integrations modülleri (kuyruk satırı queued→processing→sent/failed/dead_letter/skipped; idempotencyKey REPLAY + koşullu claim eşzamanlı çift işlemeyi kapatır; satır deneme numarası GLOBAL, bütçe sayacı çevrim yerel — manuel retry unique çakışmasını ve bütçe tazelemeyi birlikte çözer; retryable → üstel backoff 30sn→2dk→8dk, 3 denemede dead_letter; sağlayıcı hatası kayıt bazında izole — klinik akış bozulmaz; consent kuralı kuyruk girişinde 409 CONSENT_REQUIRED, push uygulama içi muaf; providerMessageId bildirim kimliğinden deterministik — retry duplicate kanıtı; PDF: pdf-lib + gömülü DejaVu Sans Türkçe gliflerle, 6 belge türü donmuş snapshot + private storage, reçete TASLAK filigranı/İMZALI imza bloğu ayrımı; entegrasyon: adapter sözleşme + sandbox stub, config secret yazımı 400 SECRET_NOT_ALLOWED, hasLiveIntegration=false → UI uyarı şeridi); 2 yeni izin notification.manage/document.manage (katalog 32 anahtar; veteriner +2, resepsiyon +2); /bildirimler + /belgeler + /entegrasyonlar sayfaları (onay paneli, deneme geçmişi, blob akışlı PDF önizleme). API e2e kabul kriterleri 12/12, alan mantığı 35 birim test, Playwright tam süit 194 PASS (Faz 12 spec 11×2 kırılım) + 22 ekran görüntüsü, Storybook 153/153 (axe dâhil, 4 yeni hikâye). QA bulguları: NotificationProviderRegistry kurucu string parametresi Nest DI'da "String provider" hatası üretiyordu (env okumaya taşındı); manuel retry attempts=0 yapınca attemptNo unique kısıtı (notificationId,attemptNo) eski satırlarla çakışıyordu ve dış catch kaydı sonsuz queued'da bırakıyordu (satır numarası global, bütçe çevrim yerel ayrımı); consent listesinde seed owner email/sms onay dağılımı test seçimini belirledi; POST uçları 201 döndüğünden run-queue bekleyenleri 201'e çekildi; react/no-unescaped-entities 3 ihlal &apos; ile çözüldü; node_modules .bun/.pnpm hibrit kalıntısı eslint-parser modülünü bulamıyordu — .bun silinip tam pnpm install ile ADR-010 zinciri geri kuruldu |
"""
old_row = '| 12 | Notifications, documents and integrations | Not started | — | — | |'
status = status.replace(old_row, row12.rstrip('\n'))
write(f'{ROOT}/docs/IMPLEMENTATION_STATUS.md', status)

# ---------------------------------------------------------------- DATA_MODEL
data_model_block = """
## Faz 12 — Bildirimler, belgeler ve entegrasyonlar (2026-11-08)

- `NOTIFICATION_TEMPLATE ||--o{ NOTIFICATION : templated` — kanal
  push/sms/email/whatsapp; `{{degisken}}` yer tutucuları render anında
  zorunlu kılınır (eksik değişken 400).
- `NOTIFICATION }o--|| OWNER : addressed` — kuyruk satırı; durum makinesi
  `queued → processing → sent | failed | dead_letter | skipped`;
  `@@unique([clinicId, idempotencyKey])` REPLAY tekilleştirmesi; koşullu
  claim (queued→processing updateMany) eşzamanlı çift işlemeyi kapatır.
- `NOTIFICATION ||--o{ NOTIFICATION_ATTEMPT : attempted` —
  `@@unique([notificationId, attemptNo])`; attemptNo GLOBAL sıralıdır
  (manuel retry sıfırlansa bile çakışmaz); outcome success/retryable/
  permanent; `providerMessageId` bildirim kimliğinden deterministik
  türetilir — sağlayıcı tarafı duplicate gönderim kanıtı.
- `INTEGRATION_CONNECTION` — klinik başına kind (einvoice/lab) tekil;
  mode sandbox/live (canlı yalnız yetkili sözleşmeyle); config JSON'a
  secret benzeri anahtar yazımı uygulama katmanında reddedilir
  (`SECRET_NOT_ALLOWED`) — sağlayıcı kimlik bilgileri yalnız sunucu env'si.
- `PRINT_DOCUMENT }o--|| PATIENT/OWNER/ENCOUNTER/PRESCRIPTION/LAB_ORDER/
  HOSPITAL_STAY : frozen` — `@@unique([clinicId, documentNo])` (BELGE-0001
  sıralı); 6 tür (exam_summary/vaccine_card/prescription/consent/lab_report/
  discharge); üretim anında donmuş `snapshot` JSON + private storage PDF
  (storageKey dışa sızmaz — indirme yetkili API ucuyla, ADR-018 deseni).
  PDF gömülü DejaVu Sans ile üretilir (Türkçe glifler WinAnsi'ye sığmaz).
"""
dm = read(f'{ROOT}/docs/DATA_MODEL.md')
dm = dm.rstrip('\n') + '\n' + data_model_block
write(f'{ROOT}/docs/DATA_MODEL.md', dm)

# ---------------------------------------------------------------- CONTRACTS
contracts_block = """
## Notifications / documents / integrations (Faz 12)

- `GET|POST|PATCH /notifications/templates` (`notification.manage`) → şablon
  CRUD; kod klinikte tekil; eksik şablon değişkeni render'da 400
  `NOTIFICATION_TEMPLATE_VAR_MISSING`.
- `GET /notifications/consents/:ownerId` → kanal bazlı onay durumu (kilit
  nedenleri; push uygulama içi olarak muaf).
- `POST /notifications/enqueue` → onay kuralı zorunlu (sms/email/whatsapp;
  yoksa 409 `NOTIFICATION_CONSENT_REQUIRED`); alıcı birincil iletişim
  kaydından normalleştirilir (telefon → 90xxxxxxxxxx); aynı
  `idempotencyKey` REPLAY döner (duplicate kuyruk yok).
- `POST /notifications/run-queue` → koşullu claim ile queued kayıtları işler;
  retryable hata üstel backoff'la kuyruğa döner (30 sn → 2 dk → 8 dk), bütçe
  3 denemede `dead_letter`; permanent → `failed`. Sağlayıcı hatası kayıt
  bazında izole edilir — klinik ana akış bozulmaz. Özet: claimed/sent/
  retrying/deadLettered/failed.
- `GET /notifications` (status/channel/category/ownerId filtreleri),
  `GET /notifications/:id` (deneme geçmişiyle), `POST /notifications/:id/retry`
  (failed/dead_letter → queued; bütçe tazelenir; NOTIFICATION_RETRIED denetimi).
- `GET /notifications/delivery-report?sinceDays=30` → durum/kanal kırılımı +
  teslim edilebilirlik yüzdesi.
- `POST /documents/print` (`document.manage`) → kind + refId; kaynak kayıttan
  donmuş snapshot + BELGE-#### numaralı PDF (private storage). Yanıt
  `downloadUrl` + reçete için `authorizedStatus` taşır.
- `GET /documents` / `GET /documents/:id` / `GET /documents/:id/pdf` →
  liste/detay/StreamableFile indirme (private, no-store; dış/imzalı URL yok).
- `GET /integrations` (`settings.manage`) → bağlantılar + `hasLiveIntegration`
  + `liveNotice` (canlı yetkili entegrasyon yoksa UI uyarı şeridi bunu
  gösterir) + secret politikası notu. `POST /integrations` /
  `PATCH /integrations/:id` → config'e secret benzeri anahtar yazımı 400
  `INTEGRATION_SECRET_NOT_ALLOWED`. `POST /integrations/:id/sandbox-check`
  → adapter sözleşme ping'i koşar, sonucu damgalar (sandbox stub çıktısı
  gerçek sağlayıcı verisi değildir).
"""
contracts = read(f'{ROOT}/docs/API_CONTRACTS.md')
contracts = contracts.rstrip('\n') + '\n' + contracts_block
write(f'{ROOT}/docs/API_CONTRACTS.md', contracts)

# ---------------------------------------------------------------- DECISIONS
adr_block = """| ADR-024 | Faz 12'de bildirim kuyruğu tek Postgres satırı üstünden yürütülür: `Notification` status makinesi (queued→processing→sent/failed/dead_letter/skipped) + `@@unique([clinicId, idempotencyKey])` REPLAY + koşullu claim (queued→processing updateMany) + satır deneme numarası GLOBAL / bütçe sayacı çevrim yerel ayrımı + sağlayıcıya bildirim kimliğinden deterministik türetilen `providerMessageId`; onay kuralı kuyruk girişinde zorlanır (sms/email/whatsapp için OwnerConsent; push uygulama içi muaf). PDF belgeler pdf-lib + gömülü DejaVu Sans (subset) ile client-side değil sunucuda üretilir ve kaynak veriden donmuş snapshot + private storage ile saklanır (dış URL yok). Entegrasyonlar mock değil adapter sözleşmesi + sandbox stub; canlı mod yalnız yetkili sözleşmeyle, sağlayıcı secret yalnız sunucu env'si ve config JSON'a secret anahtar yazımı reddedilir | Kabul kriterleri "retry duplicate üretmemeli", "iletişim tercihi/izin kontrol edilmeli", "PDF Türkçe karakter + klinik branding", "reçete imza/authorized status doğru göstermeli", "provider secret bundle'a girmemeli", "sağlayıcı hatası klinik ana işlemi bozmasın"ı doğrudan zorlar; REDIS_URL'siz geliştirme ortamında worker pasif olduğundan kuyruk tiki API ucudur (üretimde worker aynı servisi çağırır); DejaVu Sans OFL lisanslıdır ve sandbox/üretim ayrımı gözetmez (font dosyası apps/api/assets/fonts altında taşınır) | Accepted — 2026-11-08 |
"""
decisions = read(f'{ROOT}/docs/DECISIONS.md')
decisions = decisions.rstrip('\n') + '\n' + adr_block
write(f'{ROOT}/docs/DECISIONS.md', decisions)

print('OK — tüm dokümanlar güncellendi')
