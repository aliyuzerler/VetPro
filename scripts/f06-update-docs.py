#!/usr/bin/env python3
"""Faz 06 kapanış dokümantasyonu — CHANGELOG, IMPLEMENTATION_STATUS, README,
DECISIONS, API_CONTRACTS ve phases.ts tek seferde güncellenir."""
import re

ROOT = '/home/z/my-project'

# ---------- 1) CHANGELOG.md ----------
changelog_path = f'{ROOT}/CHANGELOG.md'
changelog = open(changelog_path).read()

faz06_entry = '''## [0.5.0] — Faz 06: Muayene, SOAP, vital bulgular ve hizmet kataloğu (2026-11-07)

### Eklendi
- **Veri modeli (migration `faz06_clinical_services`)**: `Encounter` (şube kapsamlı;
  SOAP alanları kayıt üzerinde; ileri yönlü durum makinesi draft → in_progress →
  signed → closed, voided çıkışı yalnız imza öncesi; `version` alanı), `VitalObservation`
  (aynı bulgunun tüm geçmiş ölçümleri ayrı satır — üzerine yazma yok), `Diagnosis`
  (birincil/ikincil/diferansiyel), `ClinicalAttachment` (hastanın mevcut dosya
  varlığına referans; private storage erişimi aynen geçerli), `ClinicalAddendum`
  (imzalı kayıt düzeltmesi; yazar + zaman + encounter referansı), `Service`
  (klinik kataloğu; kod tekil, kategori + süre), `ServicePrice` (geçerlilik tarihli,
  şube override'lı; fiyat satırları geçmiş için korunur), `ServiceConsumptionRule`
  (varsayılan tüketim; `product_id` alanı Faz 07'de Product FK'sı olarak bağlanır),
  `ServiceRecord` + `ServiceRecordLine` (muayene hizmet kaydı; fiyat çözümleme
  anında dondurulur). Yeni izinler: `encounter.manage`, `service.manage` (katalog
  18 anahtar; veteriner şablonu güncellendi).
- **API — muayeneler** (`/encounters`): oluşturma (hasta + hekim + randevu doğrulaması),
  SOAP kaydetme (`PATCH`; yalnız draft/in_progress), imza (`/sign` — `clinical.sign`
  izni), kapatma (`/close`), gerekçeli iptal (`/void`), taslak silme (yalnız draft).
  İmzalı kayıtta PATCH/DELETE ve tüm alt kaynak yazıları 409 `ENCOUNTER_SIGNED`
  döner (kabul kriteri); düzeltme yolu yalnız addendum'dur.
- **API — vital bulgular**: `POST /encounters/:id/vitals` (katalog: temp, weight,
  heart_rate, resp_rate, cap_refill, blood_pressure, glucose, pain_score, other),
  `GET /encounters/patient/:patientId/vitals?kind=` — hasta genelinde tüm ölçüm
  geçmişi korunur (kabul kriteri).
- **API — tanı, ek, addendum**: diagnosis ekleme/kaldırma (imza sonrası kapalı),
  ek ekleme (dosya hasta eşleşmesi doğrulanır — `ASSET_PATIENT_MISMATCH`),
  addendum yalnız imzalı kayda (`ENCOUNTER_NOT_SIGNED` aksi hâlde) ve her ekleme
  `ADDENDUM_CREATED` denetimi üretir (metadata'da encounterId referansı — kabul kriteri).
- **API — hizmet kataloğu** (`/services`): CRUD (`service.manage`), fiyat satırları
  (geçerlilik penceresi doğrulanır — ters pencere 409), tüketim kuralı CRUD.
  **Fiyat çözümleme** (`services.domain.resolvePrice`, birim testli): geçerlilik
  penceresi (closed-open aralık) → şube override genel fiattan önce → en yeni
  `validFrom` kazanır. Süresi dolmuş satır asla seçilmez; fiyatı olmayan hizmet
  kayda giremez (409 `SERVICE_PRICE_MISSING` — kabul kriteri).
- **API — hizmet kayıtları** (`/encounters/:id/service-records`): satır oluşturma
  (fiyat çözümü anında dondurulur, indirim/vergi tutar hesabı birim testli),
  satır değiştirme (yalnız taslak), kesinleştirme (`finalize`) — Faz 06'da yalnız
  durum değişir, gerçek stok/finans post'u Faz 08 atomik işlemiyle bağlanır
  (build promptu gereği stok post'u bu fazda bağlanmadı; arayüzde açıkça belirtilir).
- **Web — `/muayene`**: hasta arama + muayene listesi + yeni muayene diyaloğu;
  workbench (uyarı şeridi, SOAP editörü, vital paneli + hasta geçmişi, tanı paneli,
  hizmet kaydı paneli, addendum paneli). İmza düğmesi yalnız `clinical.sign`
  iznine görünür; imzalı kayıtta tüm yazma alanları kilitlenir ve kilit notu gösterilir.
- **Web — `/hizmetler`**: katalog tablosu (arama), hizmet formu diyaloğu (kod tekil
  hatası ayrıştırılır), fiyat geçmişi (şube override + "Süresi doldu" rozeti),
  fiyat/kural diyaloğu; `service.manage` izni yoksa salt-okunur.
- **Seed**: 6 sentetik hizmet (HIZ-001..006; MRKZ genel fiyatlar), Kuduz Aşısı
  SUB2 override (480 vs 520) ve Genel Muayene süresi dolmuş fiyat satırı (380/2025)
  — fiyat çözümleme kabul kriterinin demo karşılığı; Karabaş için in_progress demo
  muayenesi (SOAP dolu + vital geçmişi + tanı).
- **Storybook**: Faz 06 atölyesi — muayene durum rozeti (5 durum), SOAP editörü
  (dolu taslak + kaydetme etkileşimi + imzalı kilit), vital paneli (geçmiş korunur
  + ekleme etkileşimi + kilit), tanı paneli, hizmet kaydı paneli (taslak +
  kesinleşmiş + kilit), addendum paneli (imzalı ekleme + imzasız kapalı), hizmet
  detay paneli (fiyat geçmişi + override + süresi dolmuş + izinsiz salt-okunur),
  fiyat ve hizmet formu diyaloğu (portal bilinçli body sorgusu); test-runner
  73/73 (render + play + axe).

### Düzeltildi
- Mobil görünümde 174 px yatay taşma: `/muayene` ve `/hizmetler` ızgaralarına temel
  `grid-cols-1` eklenmediğinden gizli ızgara sütunu içerikle genişliyordu
  (minmax(0,1fr) yalnız xl kırılımındaydı).
- Muayene workbench sekmeleri mobilde taşma: `TabsList` satır kırılımına açıldı
  (`flex-wrap`).
- `react-hooks/set-state-in-effect` ihlalleri: diyalog formlarının `useEffect` ile
  sıfırlama deseni, Radix DialogContent'in her açılışta yeniden bağlanması esas
  alınarak `useState` ilk değerine taşındı; SOAP editörü `key` tabanlı yeniden
  bağlama ile senkronlanır.
- `Date.now()` render içinde çağrılmıyordu (react-hooks/purity): fiyat geçerlilik
  karşılaştırması bağlanma anına sabitlendi.

### Bilinen sınırlar
- `ServiceConsumptionRule.product_id` alanı yerinde; Faz 07'de Product modeliyle
  FK olarak bağlanacak (bu fazda dış girdi kabul edilmez, NULL tutulur).
- `ServiceRecord.finalize` gerçek stok çıkışı/ücret üretmez — Faz 08 atomik
  işleminde stok hareketi + Charge bağlanır (idempotencyKey alanı hazır).
- SOAP alanları Encounter üzerinde tekil tutulur (ayrı SoapNote tablosu yok);
  sürüm bilgisi `version` alanı ile izlenir. İmzalı kayıt içeriği asla değişmez;
  tüm düzeltmeler addendum'dur ve denetim defterine yazılır.
- Hizmet kaydı fiyat satırları çözümleme anında dondurulur; sonraki fiyat
  değişiklikleri mevcut kayıtları etkilemez (fiyat geçmişi korunur).

'''
changelog = changelog.replace('## [0.4.0] — Faz 05', faz06_entry + '## [0.4.0] — Faz 05', 1)
open(changelog_path, 'w').write(changelog)
print('CHANGELOG updated')

# ---------- 2) IMPLEMENTATION_STATUS.md ----------
status_path = f'{ROOT}/docs/IMPLEMENTATION_STATUS.md'
status = open(status_path).read()
faz06_row = '| 06 | Clinical encounter, SOAP, services | Done | Build complete | PASS (2026-11-07) | Encounter/VitalObservation/Diagnosis/ClinicalAttachment/ClinicalAddendum/Service/ServicePrice/ServiceConsumptionRule/ServiceRecord(+Line) (migration faz06_clinical_services); encounters + services modülleri (imza kilitli draft/signed yaşam döngüsü, addendum + ADDENDUM_CREATED denetimi, geçerlilik + şube override fiyat çözümleyicisi, SERVICE_PRICE_MISSING kilidi); /muayene workbench (SOAP/vital geçmişi/tanı/hizmet/addendum) + /hizmetler katalog; yeni izinler encounter.manage + service.manage (18 anahtar). API e2e kabul kriterleri 12/12, Playwright 76/76 + ekran görüntüleri, Storybook 73/73 (axe dahil), alan mantığı 14 birim test. QA bulguları: mobilde 174 px yatay taşma (grid-cols-1 temel kırılımı eksik — /muayene ve /hizmetler ızgaraları), workbench TabsList mobil taşması (flex-wrap), diyalog formlarında setState-in-effect (Radix DialogContent remount deseni ile useState ilk değerine taşındı), render içinde Date.now() (purity), node16 ESM modunda dinamik import TS2307 (e2e statik import), ClinicalAddendum onDelete Restrict draft temizliğini blokluyordu (Cascade — addendum yalnız imzalı kayıtta var) |'
status = status.replace(
    '| 06 | Clinical encounter, SOAP, services | Not started | — | — | |',
    faz06_row,
)
open(status_path, 'w').write(status)
print('IMPLEMENTATION_STATUS updated')

# ---------- 3) packages/domain/src/phases.ts ----------
phases_path = f'{ROOT}/packages/domain/src/phases.ts'
phases = open(phases_path).read()
phases = phases.replace(
    'export const CURRENT_PHASE_ID = 2;',
    'export const CURRENT_PHASE_ID = 6;',
)
open(phases_path, 'w').write(phases)
print('phases.ts updated (CURRENT_PHASE_ID = 6)')

# ---------- 4) DECISIONS.md — ADR-020 ----------
decisions_path = f'{ROOT}/docs/DECISIONS.md'
decisions = open(decisions_path).read()
adr020 = '''| ADR-020 | Faz 06'da imzalı muayene kaydı değişmez: PATCH/DELETE ve tüm alt kaynak yazıları imzada 409 `ENCOUNTER_SIGNED` döner; düzeltme yolu yalnız `clinical.sign` izniyle `ClinicalAddendum`'dur ve her addendum `ADDENDUM_CREATED` denetimi üretir (metadata'da encounter referansı). Hizmet fiyatı çözümleme kuralı: geçerlilik penceresi (closed-open) → şube override (branchId eşit) genel fiattan (null) önce → en yeni validFrom kazanır; fiyatı olmayan hizmet kayda giremez (409 SERVICE_PRICE_MISSING) ve kayıt satırlarına birim fiyat çözümleme anında dondurulur. SOAP alanları Encounter üzerinde tekil tutulur (ayrı SoapNote tablosu yok, `version` izlenir); ServiceConsumptionRule.product_id alanı Faz 07 Product FK'sı için hazır, ServiceRecord.finalize Faz 08 atomik stok/finans post'una bağlanacak | KVKK/kayıt bütünlüğü ve clinical-record-integrity kuralı: hekim imzası hukuki ve klinik sorumluluk anıdır — imza sonrası sessiz değişiklik denetim zincirini bozar; fiyat dondurma geçmiş faturalama tutarlılığını korur (ADR-006 append-only ilkesinin katalog uzantısı) | Accepted — 2026-11-07 |'''
decisions = decisions.rstrip('\n') + '\n' + adr020 + '\n'
open(decisions_path, 'w').write(decisions)
print('DECISIONS updated (ADR-020)')

# ---------- 5) API_CONTRACTS.md ----------
contracts_path = f'{ROOT}/docs/API_CONTRACTS.md'
contracts = open(contracts_path).read()
faz06_contract = '''### Faz 06 — uygulanan muayene ve hizmet kataloğu sözleşmesi (2026-11-07)
- Muayeneler ŞUBE KAPSAMLI: `GET /encounters?patientId=&status=&veterinarianId=`,
  `POST /encounters` (`encounter.manage`; patientId + veterinarianId zorunlu,
  appointmentId verilirse hasta/şube eşleşmesi doğrulanır), `GET /encounters/:id`
  (SOAP + vitals + diagnoses + attachments + addendums + serviceRecords tek yanıt),
  `PATCH /encounters/:id` (SOAP alanları + draft→in_progress; yalnız draft/in_progress),
  `POST /encounters/:id/sign` (`clinical.sign`), `POST /encounters/:id/close`,
  `POST /encounters/:id/void` {reason}, `DELETE /encounters/:id` (yalnız draft).
- **İmza kilidi:** signed/closed kayıtta PATCH, DELETE, vital/tanı/ek/hizmet yazıları
  409 `ENCOUNTER_SIGNED`; addendum yalnız signed/closed'ta kabul edilir
  (`ENCOUNTER_NOT_SIGNED` aksi hâlde) ve `ADDENDUM_CREATED` denetimi yazar.
- Vital bulgular: `POST /encounters/:id/vitals` {kind, value, unit, measuredAt, note?}
  (kind kataloğu: temp | weight | heart_rate | resp_rate | cap_refill |
  blood_pressure | glucose | pain_score | other), `GET /encounters/patient/:patientId/vitals?kind=`
  — tüm ölçüm geçmişi korunur (desc, take 200).
- Tanı: `POST /encounters/:id/diagnoses` {name, code?, kind?, note?},
  `DELETE /encounters/:id/diagnoses/:diagnosisId` (yalnız editable durumda).
- Ekler: `POST /encounters/:id/attachments` {assetId, label?} — dosya hasta
  eşleşmesi doğrulanır (`ASSET_PATIENT_MISMATCH`); `DELETE .../attachments/:attachmentId`.
- Hizmet kataloğu: `GET /services?category=&active=&search=`, `POST /services`
  (`service.manage`; klinik+kod unique — 409 `SERVICE_DUPLICATE_CODE`),
  `PATCH /services/:id`, `GET /services/:id/prices`, `POST /services/:id/prices`
  {branchId?, amount, validFrom, validTo?} (ters pencere 409
  `SERVICE_PRICE_INVALID_WINDOW`), `POST /services/:id/consumption-rules`
  {defaultQty, unit?, required?, allocationPolicy?}, `DELETE .../consumption-rules/:ruleId`
  (soft: active=false).
- **Fiyat çözümleme:** geçerlilik penceresi (validFrom ≤ t < validTo; null validTo =
  süresiz) → şube override (branchId eşit) genel fiattan önce → en yeni validFrom.
  Süresi dolmuş satır asla seçilmez; fiyat geçmişi satır olarak korunur.
- Hizmet kayıtları: `POST /encounters/:id/service-records` {lines: [{serviceId, qty,
  discount?, tax?}]} — fiyat çözümlenir ve satıra dondurulur; fiyatı olmayan hizmet
  409 `SERVICE_PRICE_MISSING` (missingServiceIds listed). `PATCH .../service-records/:recordId/lines`
  (yalnız taslak), `POST .../service-records/:recordId/finalize` (performedBy +
  finalizedAt yazılır; **Faz 06'da stok/finans post yok** — Faz 08 atomik işlemde
  bağlanır), `DELETE .../service-records/:recordId` (yalnız taslak).
- Yeni izinler: `encounter.manage` (muayene yazma uçları), `service.manage`
  (katalog yazma uçları); imza ve addendum `clinical.sign` ister. Okuma uçları
  kimlik + şube kapsamı yeterlidir.

'''
anchor = '## Owners and patients'
contracts = contracts.replace(anchor, faz06_contract + anchor, 1)
open(contracts_path, 'w').write(contracts)
print('API_CONTRACTS updated')

# ---------- 6) README.md ----------
readme_path = f'{ROOT}/README.md'
readme = open(readme_path).read()

faz06_section = '''## Muayene, SOAP ve hizmet kataloğu (Faz 06)

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

'''
anchor = '## Ekran Görüntüleri'
readme = readme.replace(anchor, faz06_section + anchor, 1)

# Faz planı satırı
readme = readme.replace(
    'Faz 01–04 Tamamlandı, Faz 05 Tamamlandı, Faz 06 Sırada.',
    'Faz 01–06 Tamamlandı, Faz 07 Sırada.',
)

# Ekran görüntüleri bölümüne Faz 06 alt bölümü (Mobil bölümlerinden önce)
faz06_shots = '''### Web — Muayene workbench (SOAP kayıtlı, `/muayene`, Faz 06)

![Muayene SOAP](docs/screenshots/web-f06-03-soap-kayitli.png)

- **Workbench düzeni:** solda hasta arama + muayene listesi, sağda uyarı şeridi,
  durum rozeti ve İmzala eylemi; SOAP alanları S/O/A/P etiketleriyle.
- Kaydedilen SOAP alanları yeniden açıldığında birebir geri gelir (kabul kriteri).

### Web — Vital bulgu ekleme ve geçmiş (`/muayene`, Faz 06)

![Vital ekleme](docs/screenshots/web-f06-04-vital-eklendi.png)

- Bulgu kataloğundan seçim, değer/birim/ölçüm zamanı girişi; aynı bulgunun tüm
  geçmiş ölçümleri ayrı satırlarda korunur (üzerine yazma yok).

### Web — Hizmet kaydı ve fiyat çözümü (`/muayene`, Faz 06)

![Hizmet kaydı](docs/screenshots/web-f06-05-hizmet-kaydi.png)

- Hizmet seçimi → satır → kayıt; satır tutarı API'de çözümlenir (geçerlilik +
  şube override) ve tabloda gösterilir (2 × Genel Muayene = ₺900,00).

### Web — İmzalı kayıt kilidi ve addendum (`/muayene`, Faz 06)

![İmzalı kilit](docs/screenshots/web-f06-06-imzali-kilitli.png)

- İmza sonrası SOAP alanları disabled, kaydet düğmesi kalkar, kilit notu görünür;
  düzeltmeler Addendum sekmesinden yapılır (denetim yazımıyla).

### Web — Hizmet kataloğu ve fiyat geçmişi (`/hizmetler`, Faz 06)

![Hizmet kataloğu](docs/screenshots/web-f06-09-hizmet-katalogu.png)

- Tablo + seçili hizmetin fiyat geçmişi: genel ₺450, süresi dolmuş ₺380 satırı
  "Süresi doldu" rozetiyle; tüketim kuralları (seans) listelenir.

### Web — Yetkisiz kullanıcı muayene görünümü (Resepsiyon, Faz 06)

![Yetkisiz muayene](docs/screenshots/web-f06-08-yetkisiz-gorunum.png)

- `encounter.manage` / `clinical.sign` izni olmayan kullanıcıda İmzala düğmesi ve
  yazma alanları yoktur; API tarafında da 403 ile korunur (çift katman).

### Mobil — Muayene workbench (`/muayene`, Faz 06)

![Mobil muayene](docs/screenshots/chromium-mobile-f06-10-mobil-muayene.png)

- Sekmeler mobilde satır kırılır; yatay taşma yoktur (grid-cols-1 temel kırılımı).

'''
anchor_mobil = '### Mobil — Genel bakış'
readme = readme.replace(anchor_mobil, faz06_shots + anchor_mobil, 1)

open(readme_path, 'w').write(readme)
print('README updated')
