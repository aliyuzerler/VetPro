# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) yaklaşımı; sürümler SemVer uyumlu numaralandırılır.

## [0.11.0] — Faz 11: Laboratuvar, cerrahi ve yatış modülleri (2026-11-08)

### Eklendi
- **Veri modeli (migration `faz11_lab_surgery_hospital`)**: `LabCatalog`
  (klinik kapsamlı test kataloğu; sampleType, unit, türe bağlı opsiyonel satır;
  referans/kritik aralıklar Decimal), `LabOrder` (yaşam döngüsü
  'ordered'|'sample_collected'|'in_progress'|'completed'|'cancelled'; öncelik
  routine/urgent; sonuç uyarısının gittiği yetkili veteriner alanı),
  `LabResult` (sayısal veya metin sonuç; katalogdan kopyalanan refLow/refHigh
  anlık görüntüsü; flag normal/low/high/critical_low/critical_high/abnormal;
  isCritical + acknowledge künyesi; sipariş başına tek sonuç), `Sample`
  (sipariş başına tek numune; LAB-YYMMDD-XXXX etiket kodu; reddet gerekçeli),
  `SurgeryCase` (encounter/patient/vet bağlantılı; planned→prepped→in_surgery→
  recovery→completed, ameliyat sonrası iptal yok; operasyon odası opsiyonel),
  `AnesthesiaRecord` (olgu başına tek kayıt; ASA I-V, premedikasyon, indüksiyon/
  idame ajanları, anestezi sorumlusu), `SurgeryChecklist`
  (`@@unique([surgeryCaseId, kind])` — pre/post; maddeler JSON, tamam/kim/
  ne zaman künyeli), `Kennel` (şube kapsamlı kafes tanımı; small/medium/large),
  `HospitalStay` (kabul/transfer/taburculuk tarihli; aktif yatış kennel işgal
  eder), `HospitalObservation` (günlük vital + not; tüm geçmiş korunur),
  `MedicationAdministration` (yatış içi doz/yol künyeli sarf; `stockMovementId`
  ile defter hareketine bağlı). Yeni izinler: `lab.manage`, `surgery.manage`,
  `hospital.manage` (katalog 30 anahtar; veteriner +3, resepsiyon +1).
- **API — laboratuvar** (`/lab`): katalog CRUD; sipariş açma, numune toplama
  (`collect`), analiz başlatma (`start`), sonuç girişi (`results` — sayısal/
  metin; kritiklik katalog eşiklerinden hesaplanır ve kayda dondurulur; giriş
  siparişi tamamlar), iptal (gerekçe zorunlu). Geçersiz durum geçişi 409
  `LAB_ORDER_INVALID_TRANSITION`; sonuç yalnız `in_progress`'ta. Kritik sonuç
  uyarısı: `GET /lab/results/critical?window=open` şube kapsamlı sıralı liste;
  onay `POST /lab/results/:id/acknowledge` — `lab.manage` + `clinical.sign`
  (resepsiyon uyarıyı görür, kapatamaz); ikinci onay 409.
- **API — cerrahi** (`/surgeries`): olgu planlama (hasta+sahip+hekim
  bağlantılı; sahip-hasta uyuşmazlığı 400), `prep` (varsayılan pre/post
  kontrol listelerini üretir), `start` (yalnız pre listesi tamken — 409
  `SURGERY_CHECKLIST_INCOMPLETE`), `recovery`, `complete` (fiili
  başlangıç/bitiş damgaları), iptal (yalnız ameliyat öncesi, gerekçe zorunlu),
  anestezi upsert, kontrol maddesi işaretleme (dizin + done; kim/ne zaman
  kaydedilir).
- **API — yatış** (`/hospital`): kennel CRUD (içinde aktif yatış olan kafes
  pasifleştirilemez), pano (`/hospital/panel` — aktif yatışlar + doluluk
  özeti + son gözlem/sarf), kabul/transfer öncesi kennel çakışma kontrolü
  ([admittedAt, dischargedAt) pencere kesişimi; 409 `KENNEL_CONFLICT`;
  dolu kafes kabul/transfer diyaloğunda sunulmaz), taburculuk (özet zorunlu;
  pencereyi kapatır), günlük gözlem (vital alanlarından en az biri veya not),
  tedavi sarfı `POST /hospital/stays/:id/medications` — Faz 08 ortak
  transaction servisi `StockService.postConsumptionForRef` (refType=
  `HospitalMedication`; FEFO otomatik veya açık parti; bloklu/geçmiş parti
  409; yetersiz stok 409; `idempotencyKey` REPLAY; `hospital.manage` +
  `inventory.consume` izinli).
- **API — atama seçici**: `GET /staff/veterinarians` — oturum açmış herkese
  açık hafif personel listesi (id/ad-soyad/unvan); lab/cerrahi/yatış
  diyaloqlarında veteriner ataması `staff.manage` gerektirmeden çalışır.
- **Seed**: 8 testlik lab kataloğu (hemogram/biyokimya/glukoz/T4/BUN/idrar/
  FIV-FeLV/kültür; referans+kritik eşikler sentetik), MRKZ 6 + SUB2 2 kennel.
- **Web**: `/laboratuvar` (kritik sonuç uyarı paneli — 30 sn yenilemeli,
  onay düğmesi yalnız clinical.sign sahiplerinde; durum filtreli sipariş
  tablosu; yeni istek diyaloğu; detay diyaloğunda numune/analiz/sonuç/iptal
  akışı), `/cerrahi` (plan diyaloğu; detayda kontrol listeleri — pre kilidi
  ve post takibi, anestezi formu, durum geçiş düğmeleri), `/yatis` (aktif
  yatış kartları + kennel doluluk şeridi; kabul diyaloğu — yalnız boş kafesler;
  detayda gözlem formu + sarf diyaloğu + transfer + taburculuk özeti).
  Kenar çubuğunda Faz 11 yaprakları aktifleşti. Yeni bileşenler + Storybook
  hikâyeleri: `LabOrderStatusBadge`, `LabCriticalBadge`, `SurgeryStatusBadge`,
  `KennelOccupancyChip`.

### Doğrulama
- API e2e 10/10 (6 kabul kriteri + replay + şube kapsamı), alan mantığı 28
  birim test, tam API regresyonu 332/332, Playwright tam süit 170 PASS
  (Faz 11 spec 11×2 kırılım) + 18 ekran görüntüsü (`docs/screenshots/`),
  Storybook 141/141 (axe dâhil), lint + typecheck + build (6/6) temiz.

## [0.10.0] — Faz 10: Reçete, ilaç uygulaması, aşı ve takip (2026-11-08)

### Eklendi
- **Veri modeli (migration `faz10_prescriptions_vaccines`)**: `Prescription`
  (status 'draft'|'signed'|'voided'; imzada klinik tekil `REC-####` numarası;
  imzalı kayıt değişmez), `PrescriptionLine` (productId SetNull — katalog dışı
  ilaç serbest adla yazılabilir; doz yardımcısı alanları `doseCalc*` ve
  `doseApproved` onay künyesi), `DispenseEvent` (dağıtım kaydı; lotCode/SKT
  partiden dondurulur; `movementId` ile stok defterine bağlı; `idempotencyKey`
  tekil), `AdministrationEvent` (uygulama kaydı; dağıtımdan bağımsız;
  `idempotencyKey` tekil), `VaccineProtocol` (klinik kapsamlı aşı protokolü:
  ilk doz yaşı, tekrar aralığı, hatırlatma önceliği; klinik+ad tekil),
  `VaccineEvent` (lot zorunlu; lotCode/SKT kayıt anında dondurulur; `nextDueAt`
  protokolden; `idempotencyKey` tekil), `VaccineReminder`
  (`@@unique([vaccineEventId, kind])` — aynı aşı kaydına aynı türden ikinci
  hatırlatma yazılamaz; `dueAt` @db.Date). Yeni izinler: `prescription.manage`,
  `prescription.sign`, `prescription.dispense`, `vaccine.manage`
  (katalog 27 anahtar; veteriner +4, resepsiyon +2, stok +1).
- **API — reçete** (`/prescriptions`): taslak oluşturma/satır düzenleme
  (`prescription.manage`); doz yardımcısı `POST /prescriptions/dose-helper`
  (kalıcılık yok — ağırlık × mg/kg aritmetiği, formül ve birimler görünür;
  otomatik ilaç/doz önerisi üretilmez); doz onayı
  `POST /prescriptions/:id/lines/:lineId/approve-dose` (yalnız
  `prescription.sign`); imza `POST /prescriptions/:id/sign` — doz önerisi
  taşıyan onaysız satır 409 `DOSE_NOT_APPROVED` ile imzayı bloklar; dağıtım
  `POST /prescriptions/:id/dispense` (yalnız imzalı reçetede ve ürün
  bağıntılı satırda): `DispenseEvent` + stok defterine `consumption` hareketi
  tek transaction'da — lot verilmezse FEFO, expired/karantina 409
  `LOT_BLOCKED`, yetersiz stok 409 `INSUFFICIENT_STOCK`, `idempotencyKey`
  ile mobil tekrar denemesi tekilleşir; uygulama
  `POST /prescriptions/administrations`. Prescribed/dispensed/administered
  kayıtları üç ayrı tabloda tutulur ve reçete detayında ayrı listelerde döner.
  Defter yazımı yeni ortak giriş `StockService.postConsumptionForRef` ile
  tek noktadan yapılır (ADR-021 atomik azaltımı korunur).
- **API — aşı** (`/vaccines`): protokol CRUD (klinik+ad tekil, 409
  `VACCINE_PROTOCOL_DUPLICATE_NAME`); aşı kaydı `POST /vaccines/events` —
  expired 409 `LOT_EXPIRED`, karantina 409 `LOT_BLOCKED`, uygulama stoğu
  aynı transaction'da düşer, `protocolId` verilirse `nextDueAt` hesaplanır;
  takvim `GET /vaccines/schedule/:patientId` — **yalnız kliniğin aktif
  protokollerinden** türetilir (son aşı + tekrar aralığı, yoksa doğum + ilk
  doz yaşı; protokolsüz hasta için girdi yok — sabit evrensel takvim yok);
  hatırlatma `POST /vaccines/events/:id/reminders` (aynı event+kind 409
  `VACCINE_REMINDER_DUPLICATE`) ve `POST /vaccines/reminders/:id/send`
  (ikinci gönderim 409 `VACCINE_REMINDER_ALREADY_SENT`); yaklaşan/geciken
  listeleri `GET /vaccines/reminders?window=upcoming|overdue`. Gerçek
  bildirim trafiği Faz 12'ye bırakıldı (kanal alanı hazır).
- **Web**: `/receteler` (durum filtreli liste + taslak diyaloğu),
  `/receteler/[id]` (doz yardımcısı kartı — formül görünür; satır başına
  doz onayı, dağıtım ve uygulama diyalogları; yazdırılabilir reçete bölümü
  `print:` medya sorgusuyla), `/asisler` (Aşı Kayıtları / Takvim &
  Hatırlatmalar / Protokoller sekmeleri; hasta bazlı takvim girdileri
  gecikmiş-yaklaşan-ileri rozetleriyle; hatırlatma gönder/ertele).
  Kenar çubuğunda Faz 10 için bekleyen üç bağlantı etkinleşti.
- **Storybook**: Reçete Durum Rozeti, Doz Yardımcısı Kartı (etkileşimli
  `play` — veteriner onay yetkili/yetkisiz görünümleri), Aşı Vade Rozeti,
  Aşı Protokol Tablosu hikâyeleri (axe erişilebilirlik kapısı dahil).

### Düzeltildi
- **auth-flow test fikstürü** paylaşılan resepsiyon rolünün izinlerini
  `deleteMany` ile silip geri koymadığından, paralel koşan spec dosyalarının
  resepsiyonlu testleri 403'e düşüyordu → "izin sıfır" testi özel
  `f03-izinsiz` rol + personel fikstürüne taşındı; fikstür artık resepsiyon
  şablon izinlerini onarır.
- **Seed'de bugün randevuları** UTC tarih parçalarından türetildiğinden,
  İstanbul gece yarısı sınırında (UTC henüz dün) yanlış güne yazılıyordu;
  takvim/akış panosu E2E'leri boş "bugün" görüyordu → UTC+3 ile doğrudan
  hesaplama (ADR-019 ile aynı saat dilimi ilkesi).
- Satır ekleme diyaloğu 900px görünümde taşarak kaydet düğmesine
  ulaşılamıyordu → `max-h-[92vh] overflow-y-auto`.

### Bilinen sınırlar
- Reçete yazdırma istemci `print:` medya sorgusudur; sunucu tarafı PDF
  Faz 12/14 belge hattına bırakıldı.
- Hatırlatma "gönderim" kayıt + denetim düzeyindedir; SMS/e-posta sağlayıcı
  bağlantısı Faz 12 bildirim entegrasyonudur.
- Aşı uygulaması stoğu tek parti (doz) düşer; çoklu doz/ambalaj dönüşümü
  Faz 08 hizmet-tüketim akışıyla birlikte değerlendirilecek.
## [0.9.0] — Faz 09: Kasa, tahsilat, cari hesap ve giderler (2026-11-08)

### Eklendi
- **Veri modeli (migration `faz09_finance` + `faz09_cash_session_guard`)**:
  `Payment` (tahsilat — method `cash|card|transfer|other`; `idempotencyKey`
  clinic bazında unique — NULL değerler çok olabilir; opsiyonel açık kasa
  oturumu), `PaymentAllocation` (ücret başına tek satır — `(paymentId,
  chargeId)` unique; append-only), `Refund` (orijinal tahsilata Restrict FK
  ile bağlı; gerekçe zorunlu), `CashRegister` (şubeye bağlı kasa —
  `(clinic, branch, name)` unique), `CashSession` (açılış bakiyesi, sayım,
  beklenen, fark, `differenceNote` — CHECK kısıtı: fark ≠ 0 iken açıklama
  boş olamaz), `CashMovement` (append-only defter — `payment|refund|expense|
  manual_in|manual_out` kaynaklı), `Expense` (kategori katalogu + nakit gider
  oturum bağlantılı) ve `SupplierPayable` (kısmi ödemeli tedarikçi borcu —
  `paidAmount >= amount` durumunda `settled`). **Kasa başına tek açık oturum**
  kısmi tekil indeksle (`WHERE status = 'open'`) veritabanı düzeyinde
  garanti edilir.
- **İzin kataloğu:** 4 yeni anahtar — `finance.pay`, `finance.cash`,
  `finance.expense`, `finance.payable` (27 anahtar). Finans rolü tüm finance
  izinlerini aldı; resepsiyona `finance.pay` verildi (iade yok). Yeni sentetik
  personel: finans@vetcore-demo.example (Burak Çelik). Seed'e şube başına
  kasa eklendi (Merkez Kasa 1, Şube Kasa 1).
- **API — finance modülü** (şube kapsamlı; guard zinciri Jwt→Permission→Branch):
  - **Tahsilat** `POST /finance/payments` (`finance.pay`): TEK transaction —
    ücret dağıtımı (elle verilmemişse otomatik FIFO; `ALLOCATION_EXCEEDS_*`
    kontrolleri), ücret durumu güncellemesi (`open→partial→paid`), opsiyonel
    kasa hareketi, `PAYMENT_CREATED` denetimi. `idempotencyKey` ile REPLAY
    (aynı anahtar aynı yanıtı döner; P2002 yarış güvencesi dâhil).
  - **İade** `POST /finance/payments/:id/refund` (`finance.refund`): kalan
    iade edilebilir tutar üst sınırı; gerekçe zorunlu; `REFUND_CREATED`
    denetimi; nakit iade kasadan çıkış hareketi üretir.
  - **Cari:** `GET /finance/charges` (dağıtım özeti + kalan bakiye),
    `GET /finance/balances` (sahip bakiye özeti),
    `GET /finance/owners/:id/statement` — ücret(+)/tahsilat(−)/iade(+) satırları
    kronolojik koşan bakiyeyle (kabul kriteri: üç kayıt ilişkisi görünür).
  - **Kasa:** `GET/POST /cash/registers`, `POST /cash/sessions/open`,
    `POST /cash/sessions/:id/close` (fark hesabı; **fark ≠ 0 iken açıklama
    zorunlu** — `CASH_DIFFERENCE_NOTE_REQUIRED`), `POST /cash/sessions/:id/
    movements` (elle giriş/çıkış — kapalı oturuma yazım 409), `GET /cash/
    sessions[/:id]` (canlı beklenen tutar = açılış + giriş − çıkış).
    Yazma uçları `finance.cash` izni ister.
  - **Gider/borç:** `POST/GET /finance/expenses` (`finance.expense` — nakit
    gider oturum ister, çıkış hareketi üretir), `POST/GET /finance/payables` +
    `POST /finance/payables/:id/pay` (`finance.payable` — kısmi ödeme,
    `PAYMENT_EXCEEDS_PAYABLE` kontrolü, kapanınca `settled` + denetim).
- **Web:** 4 yeni sayfa — `/tahsilat` (bugün net/nakit KPI, sahibe FIFO
  önizlemeli tahsilat diyaloğu, iade diyaloğu), `/cari` (sahip arama +
  bakiye listesi + ekstre), `/kasa` (kasa kartları, canlı oturum paneli,
  nakit giriş/çıkış, kapanış farkı diyaloğu), `/giderler` (gider listesi +
  diyaloğu, tedarikçi borçları + ödeme). Kenar çubuğu Finans grubu
  aktifleşti. Storybook: 12 yeni story (tahsilat FIFO/ileri kredi/geçersiz
  tutar, cari ekstre ilişkisi, kasa kapanış farkı/tam sayım/canlı panel/kasa
  kartları, gider diyaloğu ×2) — axe erişilebilirlik kapısı dâhil.
- **Doğrulama:** alan mantığı 31 birim test; API e2e 15/15 (7 kabul kriteri +
  kasa 409 + nakit gider oturum kilidi + tedarikçi borcu kapatma + şube
  kapsamı); tam API regresyonu 262/262; Playwright tam süit 128 PASS (Faz 09
  spec 7×2 kırılım) + 22 ekran görüntüsü; Storybook 114/114 (axe dâhil);
  lint/typecheck/build 6/6.

### Değişti
- `Charge.status` artık `open|partial|paid|void` — dağıtım yazımı durumları
  günceller (Faz 08'den gelen `open|void` genişletildi).
- `prisma/permissions.ts` tek kaynak izin kataloğuna finance grubu tamamlandı;
  Finans rol tanımı ve resepsiyon izinleri genişletildi.
- Playwright zincir betiği spec dosyası argümanı destekledi (uzun süit
  parçalı koşum için).

### Bilinen sınırlar
- E-fatura/e-arşiv iddiası yoktur — yalnızca ileride provider adapter için
  arayüz ayrılmıştır (build prompt gereği).
- Tahsilatın ücretlere dağılmayan kısmı (ileri kredi) iadeye kapanmaz —
  iade yalnız tahsilat üzerinden tanımlıdır; ücret iadesi Faz 08 reversal
  akışıyla yapılır.
- Kasa sayımı banka POS gün sonu mutabakatı içermez (oturum defteri yalnız
  nakit hareketlerini izler).

## [0.7.0] — Faz 08: Hizmet → stok → ücret atomik iş akışı (2026-11-08)

### Eklendi
- **Veri modeli (migration `faz08_service_charge`)**: `Charge` (hizmet
  kesinleşmesinden doğan sahibin borcu; serviceRecordId unique — hizmet başına
  tek ücret; durum `open` | `void`; currency/toplam; sahibi/hasta/muayene
  referansları) ve `ChargeLine` (append-only; `sourceType`: `service` |
  `service_reversal`; reversal satırları negatif qty/total ile yazılır —
  orijinal satırlar asla değiştirilmez). `ServiceRecord`'a `reversedAt` +
  `reversedByStaffId` eklendi; encounter/owner/patient/branch/staff
  ilişkileri kataloglandı.
- **API — service-finalization modülü** (encounters altında; şube kapsamlı):
  - **Önizleme** `GET /encounters/:id/service-records/:recordId/consumption-preview`
    (`encounter.manage`): `ServiceConsumptionRule` üzerinden kural planı
    (defaultQty × hizmet satır adedi), ürün için seçilebilir stoğu en yüksek
    şube deposu önerisi, politika bazlı parti tahsisi (fifo → receivedAt,
    nearest_expiry → SKT; bloklu partiler atlanır; manual → kullanıcı seçer),
    yetersiz stok uyarısı, ürünsüz kural için `RULE_WITHOUT_PRODUCT` bilgilisi
    ve dondurulmuş ücret önizlemesi döner.
  - **Atomik finalize** `POST .../service-records/:recordId/finalize`
    (`encounter.manage` + tüketim varsa `inventory.consume`): TEK transaction —
    `FOR UPDATE` satır kilidi, stok defter hareketi (kind `service_consumption`,
    `refType=ServiceRecord` → lot no + SKT + kaynak kayıt izlenebilir; depo
    bazında gruplanır), bakiye projeksiyonu atomik koşullu azaltımı,
    `Charge` + `ChargeLine` (fiyatlar kayıt satırından dondurulur),
    `SERVICE_RECORD_FINALIZED` denetimi ve `status=finalized`. Stok yazım
    hatası tüm işlemi geri alır (çok depolu kısmi yazım dâhil).
  - **Idempotency:** gövde `idempotencyKey` veya `Idempotency-Key` başlığı
    (UUID). Aynı anahtarla tekrar → REPLAY (aynı yanıt, yeni hareket/ücret
    yok — mobil tekrar denemesi güvenli); farklı anahtarla ikinci finalize →
    409 `SERVICE_RECORD_FINALIZED`.
  - **Reversal** `POST .../service-records/:recordId/reverse`
    (`encounter.manage` + `inventory.consume`; gerekçe zorunlu): ters stok
    hareketi (stoğa iade) + negatif `service_reversal` ücret satırları +
    `SERVICE_RECORD_REVERSED` denetimi; tam iadede ücret toplamı 0'a iner ve
    `void` olur. İkinci reversal 409 `SERVICE_RECORD_REVERSED`; orijinal
    hareket ve satırlar korunur (ADR-006 append-only).
- **Kural → ürün bağlantısı:** `POST /services/:id/consumption-rules` artık
  `productId` kabul eder (klinik ürünü doğrulanır); seed demo kuralları ürünlere
  bağlandı — Genel Muayene→Eldiven (partisiz), Kuduz Asısı→Kuduz aşısı
  (nearest_expiry, zorunlu), Kan Biyokimyası→Hemogram kiti (tamamı karantinada —
  yetersiz stok uyarısı senaryosu), Kısırlaştırma→Amoksisilin (çok partili FEFO;
  süresi geçmiş parti elenir) + İV kateter.
- **Web:** `/muayene` iş istasyonunda kesinleştirme artık tüketim onayı
  diyaloğuyla açılır (kural planı, depo/parti/miktar düzenleme, bloklu partiler
  devre dışı, yetersiz stok uyarısı, ücret önizlemesi); kesinleşmiş kayıt
  ücret rozeti + satır dökümü gösterir; **İptal (Reversal)** gerekçe diyaloğu.
  Idempotency anahtarı diyaloğu açan olay işleyicisinde üretilir (oturumda
  sabit). Storybook: 4 yeni story (kesinleştirme önizlemesi, reversal gerekçesi
  ×2, iptal edilmiş kayıt görünümü).
- **Doğrulama:** API e2e 14/14 (7 kabul kriteri + iki depolu rollback + çift
  kayıt eşzamanlı tüketim + manual politika kilidi + LOT_BLOCKED + şube
  kapsamı); tam API regresyonu 216/216; alan mantığı 24 birim test; Playwright
  tam süit 114/114 + ekran görüntüleri; Storybook 103/103 (axe kapısı dâhil).

### Değişti
- `CreateConsumptionRuleDto`'ya `productId` alanı eklendi (Faz 06'daki
  "dışarıdan girilmez" kısıtı kalktı).
- Eski Faz 06 finalize ucu (yalnız durum değişikliği) `ServiceFinalizationService`
  ile değiştirildi; gövdesiz çağrılar geriye dönük uyumlu (tüketim planı kuraldan
  otomatik kurulur).

### Bilinen sınırlar
- Ücret yalnız `open`/`void` durumlarında; ödeme/tahsilat bağlantıları Faz 09
  `PaymentAllocation` ile eklenir.
- Manual tahsis politikasında otomatik finalize 409
  `REQUIRED_CONSUMPTION_MISSING` döner — tüketim satırları açık gönderilmelidir.

## [0.6.0] — Faz 07: Ürün, depo, lot, tedarikçi ve stok defteri (2026-11-07)

### Eklendi
- **Veri modeli (migration `faz07_inventory`)**: `ProductCategory`, `Unit`,
  `Product` (SKU/barkod/parti-takip türü/min. stok/referans satış fiyatı),
  `ProductUnitConversion` (1 fromUnit = factor × toUnit), `Supplier`,
  `InventoryLot` (depo bazlı parti; lot kodu + SKT + birim maliyet + durum),
  `StockMovement` + `StockMovementLine` (APPEND-ONLY defter; kind: goods_receipt |
  consumption | adjustment | transfer_out | transfer_in | supplier_return;
  idempotencyKey ile mobil tekrar deneme tekilleştirme), `StockBalance`
  (defterle aynı işlemde güncellenen projeksiyon; partisiz ürünler lotId NULL —
  kısıt `NULLS NOT DISTINCT` ile yeniden tanımlandı), `StockTransfer` + line
  (iki aşamalı: draft → dispatched → received; iptal yalnız taslakta),
  `StockCount` + line (beklenen bakiye açılışta dondurulur),
  `TemperatureLog` (soğuk zincir). Yeni izinler: `product.manage`,
  `supplier.manage`, `inventory.receive`, `inventory.consume`,
  `inventory.transfer` (katalog 23 anahtar; veteriner + stok şablonları güncellendi).
  **Defter append-only veritabanı düzeyinde:** `stock_movements` ve
  `stock_movement_lines` üzerinde UPDATE/DELETE bloklayan tetikleyiciler;
  doğrudan ORM girişimi de hata verir (kabul kriteri 7).
- **API — stok çekirdeği** (`/stock`, `/products`, `/suppliers`):
  - **Mal kabul** `POST /stock/receipts` (`inventory.receive`): lot/SKT/maliyet
    ile stok artışı (kabul kriteri 1); aynı (kod, SKT, maliyet) tekrar gelirse
    mevcut partiye eklenir, uyuşmazlıkta 409 `LOT_CONFLICT`. Partisiz üründe
    lot kodu reddedilir.
  - **Tüketim** `POST /stock/consumptions` (`inventory.consume`): parti verilirse
    seçilebilirlik denetimi (expired/quarantined/exhausted → 409 `LOT_BLOCKED`),
    verilmezse **FEFO otomatik tahsis** (çok partiye bölebilir; bloklu partiler
    atlanır — kabul kriteri 3). Çıkış **atomik koşullu azaltım**
    (`qtyOnHand >= qty` güvencesi) ile yazılır: aynı partiye eş zamanlı iki
    tüketimden biri 409 `INSUFFICIENT_STOCK` alır, negatif stok oluşamaz
    (kabul kriteri 6).
  - **Mutabakat:** lot bazlı bakiye = SUM(defter satırları); bakiye yazımı defter
    ile aynı işlemde yapılır (kabul kriteri 2).
  - **Transfer** `POST /stock/transfers` → `/dispatch` → `/receive`
    (`inventory.transfer`; iki aşamalı): sevk kaynak stoğu düşer ve `transfer_out`
    yazar (durum dispatched = **yolda**); teslim hedef depoda aynı özelliklerde
    parti açar/büyütür ve `transfer_in` yazar (kabul kriteri 4). Sevk kaynak şube,
    teslim hedef şube yetkisiyle yapılır (iki aşamalı yetki).
  - **Sayım** `POST /stock/counts` → `PATCH .../lines` → `POST .../complete`
    (`inventory.adjust`): tamamlama **gerekçe zorunlu** (400
    `COUNT_REASON_REQUIRED`); her fark satırı için `adjustment` hareketi +
    `STOCK_COUNT_COMPLETED` denetimi (kabul kriteri 5). Manuel düzeltme
    `POST /stock/adjustments` aynı gerekçe + denetim disiplinini uygular.
  - **Tedarikçi iadesi** `POST /stock/returns` (`inventory.receive`; gerekçe
    zorunlu), **parti durumu** `PATCH /stock/lots/:id/status` (karantina/serbest;
    `LOT_QUARANTINED`/`LOT_RELEASED` denetimi), **sıcaklık kayıtları**
    `GET|POST /stock/temperature-logs` (`warehouse.manage`).
  - Okuma uçları: `/stock/movements` (+detay; append-only — PATCH/DELETE yok),
    `/stock/balances?lowStock=true`, `/stock/alerts` (süresi geçen/yaklaşan
    partiler + düşük stok), `/stock/transfers`, `/stock/counts`,
    `/products/:id/lots?includeBlocked=` (FEFO sıralı + blok gerekçesi).
- **Web** — `/urunler` (liste + arama + depo bakiyeleri + FEFO partiler + mal
  kabul/tüketim diyaloğu), `/partiler` (FEFO parti tablosu; süresi geçmiş/
  karantina rozetleri; karantina aksiyonu; soğuk zincir sıcaklık kayıtları),
  `/stok-hareketleri` (salt-okunur defter + tür filtresi; Transferler sekmesi:
  kurulum/sevk/teslim; sayım başlatma + föy), `/tedarikciler` (liste + kart).
  Kenar çubuğunda "Depo & Stok" ve "Satın Alma" yaprakları aktifleşti. Yazma
  aksiyonları izinle görünür; izin yoksa sayfa salt-okunurdur.
- **Testler:** alan mantığı 17 birim test (FEFO sıralama/tahsis, blok
  seçilebilirlik, sayım farkı, birim dönüşümü), API e2e 15 test (7 kabul
  kriterinin tamamı + izin/şube kapsam testleri), Playwright 26 test × 2
  kırılım (masaüstü + mobil; tam süit 102 PASS), Storybook 26 yeni hikâye —
  toplam 99/99 (axe dahil).

### Değişti
- `packages/domain` faz göstergesi Faz 07'ye taşındı; kontrol paneli faz rozeti
  artık faz tanımından (`getPhase`) dinamik okunur.
- Karantina partisi durumu değiştiğinde tüketim FEFO tahsisi otomatik güncellenir;
  uyarı listesi (`/stock/alerts`) düşük stok + SKT uyarılarını tek yanıtta verir.

### Bilinen sınırlar
- Tedarikçi iadesi ve manuel düzeltme maliyet muhasebesi (ortalama maliyet
  güncellemesi) Faz 09 finans modülüne ertelendi.
- Transfer receive'de hedef depoda aynı lot kodu farklı SKT/maliyetle varsa
  409 `LOT_CONFLICT` döner; kod çakışması manuel çözüm ister.
- `ServiceConsumptionRule.product_id` artık Product FK'sıdır; tüketim kurallarının
  gerçek stok hareketine dönüşmesi Faz 08 atomik işlemindedir.

## [0.5.0] — Faz 06: Muayene, SOAP, vital bulgular ve hizmet kataloğu (2026-11-07)

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

## [0.4.0] — Faz 05: Randevu takvimi ve klinik akış panosu (2026-11-07)

### Eklendi
- **Veri modeli (migration `faz05_appointments_flowboard`)**: `AppointmentType`
  (klinik katalog; süre + takvim rengi), `ScheduleBlock` (çalışma saatleri / plan
  engelleri — personel veya şube düzeyi, weekday + dakika aralığı), `Appointment`
  (şube kapsamlı; UTC instants; ileri yönlü durum makinesi ve geçiş zaman damgaları;
  override denetim alanları), `WaitlistEntry` (tercih günü/penceresi, kitaplaştırma
  bağlantısı). Yeni izinler: `appointment.manage`, `appointment.override` (katalog
  16 anahtar; veteriner/resepsiyon şablonları güncellendi).
- **API — randevular**: aralıklı listeleme (from/to UTC instant + staffId/roomId/
  patientId/includeClosed filtreleri), oluşturma/düzenleme, check-in, durum geçişi,
  gerekçeli iptal. Çakışma kontrolü Serializable transaction ile (aynı hekim veya
  oda); çalışma saati politikası Clinic.timezone (Europe/Istanbul) ile değerlendirilir,
  istisna yalnız izin + zorunlu gerekçeyle (denetim yazımı `appointment.override`).
- **API — akış panosu**: `GET /flowboard` — arrived/waiting/in_consultation şeritleri,
  bekleme dakikaları, hasta uyarı rozetleri, günün durum sayaçları.
- **API — randevu türleri / çalışma saatleri / bekleme listesi**: katalog CRUD,
  ScheduleBlock CRUD, waitlist CRUD + `POST /:id/book` (randevu kuralları aynen
  uygulanır; tür/hekim çözülemezse 400).
- **Web — `/takvim`**: gün/hafta/ay görünümleri, hekim/oda filtreleri, randevu
  oluşturma/düzenleme diyaloğu (hasta araması; çakışma ve çalışma saati hataları
  stabil kodlarla ayrıştırılır; override paneli yalnız yetkili kullanıcıya), durum
  eylemleri, gerekçeli iptal diyaloğu.
- **Web — `/akis-panosu`**: canlı kuyruk (15 sn yenileme), kart içi eylemler,
  yükleme/boş/hata durumları. **`/bekleme-listesi`**: kuyruk tablosu, kayıt ekleme
  (hasta araması), randevuya çevirme ve iptal. Kenar çubuğunda Faz 05 yaprakları
  (Akış Panosu, Takvim, Bekleme Listesi) aktifleşti.
- **Mobil**: bugünün ajandası ve randevu detay ekranları gerçek API sözleşmesiyle
  (Bearer + X-Branch-Id); oturum kaynağı Faz 13'te bağlanır — oturum yoksa dürüst
  "giriş gerekli" durumu (sahte veri yok).
- **Seed**: 5 randevu türü, hekim çalışma saatleri (Pzt–Cmt 09:00–18:00) + şube
  varsayılanı, bugünün 4 sentetik randevusu (completed/in_consultation/waiting/
  scheduled), 1 bekleme kaydı — takvim ve pano gerçek veriyle açılır.
- **Storybook**: Faz 05 atölyesi — durum rozeti (7 durum), akış panosu (dolu/boş/
  yükleme), bekleme listesi, takvim panosu (gün/ay + saat dilimi yardımcısı), randevu
  formu diyaloğu; test-runner 53/53 (render + play + axe).

### Düzeltildi
- Radix `Select.Root` DOM elemanı üretmediği için bileşenlere konan `data-testid`
  `SelectTrigger`'a taşındı (E2E seçicileri bulamıyordu).
- Bekleme kitaplaştırmada tür/hekim çözümlenemezse boş UUID ile 500 yerine açık 400
  doğrulama hatası dönülüyor.
- Axe kapısı Faz 05 bileşenlerinde 5 ihlal yakaladı ve düzeltildi: aria-label
  görünür metni içermeli (label-content-name-mismatch), `role="grid"` alt yapısı
  (aria-required-children), `dl` doğrudan dt/dd içermeli (definition-list), skeleton
  konteyneri `role="status"`.
- E2E zinciri determinizmi: zincir kapanışı yetim `bin/postgres` sürecini de
  öldürür, 5433/4000 portları hâlâ dinlemedeyse sert çıkar (bayat DB ile koşum
  engellenir); API e2e'de supertest'in listen/close yarışı `app.listen(0)` ile
  elendi.

### Bilinen sınırlar
- Randevu geçmişi ve denetim satırları korunur; fiziksel silme yoktur (Faz 08+
  finansal bağlamda da geçerli).
- Mobil oturum akışı Faz 13'te bağlanana dek mobil ekranlar "giriş gerekli" durumu
  gösterir; API sözleşmesi ve durum makinesi istemcide birebir yansıtılmıştır.
- Turkey DST'siz sabit UTC+03 esas alınmıştır; Intl tabanlı yardımcılar genel
  DST'li klinik saat dilimlerini de destekler.

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
