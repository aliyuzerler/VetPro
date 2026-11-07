# API Contract Outline

Base path `/api/v1`. This is a module map; ZCode must define request/response schemas and OpenAPI for each endpoint.

## Identity / setup
- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- `GET /auth/me`, `GET /permissions/me`
- CRUD `/clinic`, `/branches`, `/staff`, `/roles`, `/rooms`, `/warehouses`

### Faz 03 — uygulanan kimlik sözleşmesi (2026-11-07)
- `POST /auth/login` → `{ accessToken, refreshToken, accessExpiresAt, staff, roles[],
  permissions[], allBranches, branches[], activeBranch }` — hatalı deneme 401 +
  `auth.login.failed` denetimi.
- `POST /auth/refresh` → yeni token çifti; eski refresh iptal edilir (rotasyon);
  iptal edilmiş (rotated) token tekrar sunulursa personelin tüm oturumları
  `reuse-detected` ile kapanır.
- `POST /auth/logout` → 204; `GET /auth/me` → güncel oturum + izinler + şubeler;
  `PATCH /auth/active-branch` `{ branchId }` → Session.branchId güncellenir, denetlenir.
- Guard zinciri: JwtAuthGuard (global, Bearer) → PermissionsGuard (@RequirePermissions)
  → BranchScopeGuard (@BranchScoped uçlarda; query.branchId → X-Branch-Id → body.branchId;
  Şube A personeli Şube B kapsamındaki kayda 403 alır). Health uçları @Public.
- `GET /permissions` izin kataloğu (11 anahtar; en az: clinical.sign, inventory.adjust,
  finance.refund, reports.export, audit.view); `PUT /roles/:id/permissions` matris yazımı
  (önce/sonra listeleriyle `role.permissions.update` denetimi).
- `GET /audit-events?take&skip&action&staffId` — audit.view izni gerekir.
- Tüm mutation uçları `audit_events` tablosuna yazar (auth, clinic, branch, room,
  warehouse, staff, role).

### Faz 04 — uygulanan sahip/hasta sözleşmesi (2026-11-07)
- `GET /species` → tür kataloğu + aktif ırklar (tüm kimlikli personel);
  `POST /species/:id/breeds` → ırk ekleme (`master.manage`).
- Sahipler klinik kapsamlıdır: `GET /owners?search=&includeArchived=&take=` (arama:
  ad-soyad kelime bazlı, telefon normalize `contains`, e-posta), `POST /owners`
  (`owner.manage`; contacts[] + consents{kvkk,sms,email,whatsapp,marketing}),
  `GET /owners/:id` (hastalarıyla), `PATCH /owners/:id`,
  `GET /owners/duplicates?firstName=&lastName=&phone=&email=` → mükerrer adaylar
  ({reasons: phone|email|name, primaryContact}; yalnız uyarı — otomatik merge yok),
  `PATCH /owners/:id/archive` {reason} (aktif hastası varsa 409),
  `PATCH /owners/:id/unarchive`, `POST /owners/:id/merge` {intoOwnerId, reason}
  (hastalar hedefe taşınır, kaynak arşivlenir + mergedIntoOwnerId).
- Hastalar ŞUBE KAPSAMLI (BranchScopeGuard; yetkisiz şube liste dışı + doğrudan 403):
  `GET /patients?search=&branchId=&speciesId=` (arama: ad/kod/mikroçip normalize/
  sahip adı-soyadı/telefonu), `POST /owners/:id/patients` (`patient.manage`; kod
  `HP-000N` otomatik, mikroçip klinik içinde tekil — çakışma 409), `GET /patients/:id`,
  `PATCH /patients/:id`, `PATCH /patients/:id/archive` {reason} / `unarchive`,
  `POST /patients/:id/merge` {intoPatientId, reason}, `GET /patients/duplicates`,
  `POST /patients/:id/alerts` {kind: allergy|chronic|warning, label, severity},
  `PATCH /patients/:id/alerts/:alertId` {active}, `POST /patients/:id/weights`
  {weightKg, measuredAt?}, `GET /patients/:id/timeline` (kilo/uyarı/dosya/denetim
  olayları — SOAP olayları Faz 06'da eklenecek iskelet).
- Dosyalar private storage (ADR-018): `POST /file-assets/upload` (multipart `file` +
  `patientId`; MIME beyaz listesi: PDF/JPEG/PNG/WebP/TXT/DOC(X), 10 MB; metadata döner,
  storage key asla sızdırılmaz), `GET /file-assets?patientId=` (metadata),
  `GET /file-assets/:id/download` (Bearer + şube kapsamı; kimliksiz 401, yetkisiz
  şube 403; Content-Disposition ile akış).
- Tüm mutation uçları `audit_events`'e yazar (owner.create/archive/merge,
  patient.create/update/archive/merge, patient.alert.*, patient.weight.create,
  patient.file.upload).

### Faz 05 — uygulanan randevu ve akış panosu sözleşmesi (2026-11-07)
- Randevular ŞUBE KAPSAMLI (BranchScopeGuard): `GET /appointments?from=&to=&staffId=&roomId=&patientId=&includeClosed=`
  (takvim gün/hafta/ay aralığı — UTC instant parametreler), `POST /appointments`
  (`appointment.manage`; hasta/tür/hekim doğrulanır, oda şubeye ait olmalı,
  `endAt` verilmezse tür süresi kullanılır), `GET /appointments/:id`,
  `PATCH /appointments/:id` (yeniden planlama — çakışma ve politika yeniden işletilir),
  `POST /appointments/:id/check-in` (yalnız scheduled → arrived),
  `POST /appointments/:id/status` {status, note?}, `POST /appointments/:id/cancel`
  {reason} (gerekçe zorunlu, min 3).
- **Çakışma kontrolü:** aynı hekim VEYA aynı oda için aktif randevu
  (scheduled/arrived/waiting/in_consultation) kesişirse 409 `APPOINTMENT_CONFLICT`;
  Serializable transaction + P2034 yeniden denemesi ile yarış güvenli.
- **Çalışma saati politikası:** ScheduleBlock 'working' (personel esas, şube yedek) ve
  'blocked'; dışı 422 `APPOINTMENT_OUTSIDE_WORKING_HOURS` — `allowOutsideHours` +
  zorunlu `overrideReason` yalnız `appointment.override` izniyle kabul edilir ve
  `appointment.override` denetimi yazılır; 'blocked' her koşulda 409
  `APPOINTMENT_BLOCKED` (override edilemez). Gün/hafta hesapları Clinic.timezone
  (Europe/Istanbul) ile yapılır; gece yarısını aşan randevu reddedilir.
- **Durum makinesi:** scheduled→arrived→waiting→in_consultation→completed; aktif
  aşamalardan cancelled/no_show çıkışı serbest. Geçersiz sıra 409
  `APPOINTMENT_INVALID_TRANSITION`. Geçiş zaman damgaları (checkedInAt, waitingAt,
  inConsultationAt, completedAt, closedAt) satıra yazılır.
- `GET /flowboard?date=YYYY-MM-DD` → {date, lanes: {arrived, waiting, in_consultation}
  (bekleme dakikaları + hasta uyarı rozetleri), counts} — gerçek randevu satırlarından
  türetilir.
- Randevu türleri: `GET /appointment-types`, `POST`/`PATCH /appointment-types/:id`
  (`appointment.manage`; klinik+ad unique).
- Çalışma saatleri: `GET /schedule-blocks?staffId=`, `POST`, `PATCH /:id`,
  `DELETE /:id` (`appointment.manage`).
- Bekleme listesi: `GET /waitlist?status=`, `POST` {patientId, appointmentTypeId?,
  preferredStaffId?, preferredDate?, preferredStartMin/EndMin?, note?},
  `PATCH /:id` (yalnız waiting), `POST /:id/book` {startAt, endAt?, staffId?, roomId?,
  appointmentTypeId?, allowOutsideHours?, overrideReason?} — tür/hekim çözümlenemezse
  400; randevu kuralları (çakışma, çalışma saati) aynen uygulanır, giriş 'scheduled'
  işaretlenir, `POST /:id/cancel`.
- Tüm mutation uçları `audit_events`'e yazar (appointment.create/update/status/
  checkin/cancel/override, appointment.type.*, schedule.block.*, waitlist.*).

### Faz 06 — uygulanan muayene ve hizmet kataloğu sözleşmesi (2026-11-07)
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

### Faz 07 — uygulanan stok yönetimi sözleşmesi (2026-11-07)
- Ürün kataloğu: `GET /products?search=&categoryId=&active=`, `POST /products`
  (`product.manage`; klinik+SKU unique — 409 `PRODUCT_DUPLICATE_CODE`, barkod
  çakışması 409 `PRODUCT_DUPLICATE_BARCODE`), `PATCH /products/:id` (parti takip
  türü sonradan değişmez), `GET /products/:id/lots?warehouseId=&includeBlocked=`
  (FEFO sıralı; her partide `blockReason`: expired | quarantined | exhausted |
  null), `GET|POST /product-categories`, `GET|POST /units`,
  `GET|POST /products/:id/conversions` (1 fromUnit = factor × toUnit).
- Tedarikçiler: `GET /suppliers?search=&active=`, `POST|PATCH /suppliers/:id`
  (`supplier.manage`; klinik+ad unique — 409 `SUPPLIER_DUPLICATE_NAME`).
- Stok yazıları (`/stock`, @BranchScoped): `POST /stock/receipts`
  (`inventory.receive`; {warehouseId, supplierId?, note?, idempotencyKey?,
  lines: [{productId, lotCode?, expiresAt?, unitCost?, qty}]}) — parti takipli
  üründe lot+SKT zorunlu; aynı (kod,SKT,maliyet) mevcut partiye eklenir,
  uyuşmazlıkta 409 `LOT_CONFLICT`. `POST /stock/consumptions` (`inventory.consume`;
  lotId verilmezse FEFO tahsis; bloklu parti 409 `LOT_BLOCKED`, yetersiz stok
  409 `INSUFFICIENT_STOCK` — atomik koşullu azaltım). `POST /stock/returns`
  (`inventory.receive`; gerekçe zorunlu). `POST /stock/adjustments`
  (`inventory.adjust`; işaretli qtyDelta + zorunlu reason).
- Transfer: `GET /stock/transfers?status=`, `POST /stock/transfers`
  (`inventory.transfer`; {fromWarehouseId, toWarehouseId, lines: [{productId,
  lotId?, qty}]}) — lot takipli üründe kaynak parti zorunlu; `PATCH
  /stock/transfers/:id/dispatch` (kaynak şube yetkisi; kaynak stoğu düşer,
  `transfer_out` yazar, durum dispatched = yolda), `PATCH
  /stock/transfers/:id/receive` (hedef şube yetkisi; hedef depoda parti açar/
  büyütür, `transfer_in` yazar, satıra receivedLotId yazar), `PATCH .../cancel`
  (yalnız taslak). Geçersiz durum geçişi 409 `TRANSFER_INVALID_STATE`.
- Sayım: `GET /stock/counts`, `POST /stock/counts` (`inventory.adjust`; mevcut
  bakiyeler expectedQty olarak dondurulur), `PATCH /stock/counts/:id/lines`
  {lines: [{lineId, countedQty?}]}, `POST /stock/counts/:id/complete` {reason}
  — gerekçe zorunlu (400 `COUNT_REASON_REQUIRED`); her fark satırı için
  `adjustment` hareketi + `STOCK_COUNT_COMPLETED` denetimi.
- Parti/sıcaklık: `PATCH /stock/lots/:lotId/status` {status: active|quarantined}
  (`inventory.receive`; `LOT_QUARANTINED`/`LOT_RELEASED` denetimi),
  `GET|POST /stock/temperature-logs` (yazım `warehouse.manage`).
- Okuma uçları: `GET /stock/movements?kind=&warehouseId=&productId=&from=&to=`
  ve `GET /stock/movements/:id` — **append-only: PATCH/DELETE yok** (yol 404,
  doğrudan ORM girişimi DB tetikleyicisiyle bloklanır). `GET /stock/balances
  ?warehouseId=&productId=&lowStock=true`, `GET /stock/alerts` (expired/yaklaşan
  SKT partileri + min. stok altı ürünler).
- Yeni izinler: `product.manage`, `supplier.manage`, `inventory.receive`,
  `inventory.consume`, `inventory.transfer`; sayım/düzeltme mevcut
  `inventory.adjust`, sıcaklık `warehouse.manage`. Okuma uçları kimlik + şube
  kapsamı yeterlidir.
- `CRUD /products`, `/suppliers`, `/stock-locations` (StockLocation → Warehouse; ADR-021)
- `GET /stock/balances`, `GET /stock/lots` (→ `/products/:id/lots`), `GET /stock/alerts`
- `POST /stock/receipts`, `/stock/transfers`, `/stock/counts`, `/stock/adjustments`
- `PATCH /stock/transfers/:id/dispatch`, `PATCH /stock/transfers/:id/receive`
- `GET /stock/movements?sourceType=&sourceId=` (→ kind/refType/refId filtreleri)

## Owners and patients
- CRUD `/owners`, `/owners/:id/patients`, `/patients`
- `GET /patients/search?q=`
- `GET /patients/:id/timeline`
- `POST /owners/:id/merge` (privileged, reason required)

## Appointments and encounters
- CRUD `/appointments`; `POST /appointments/:id/check-in`; `POST /appointments/:id/status`
- `GET /flowboard?branchId=&date=`
- `POST /encounters`; `PATCH /encounters/:id/draft`; `POST /encounters/:id/sign`
- `POST /encounters/:id/addenda`; `GET /encounters/:id/print`

## Catalog and service finalization
- CRUD `/services`, `/services/:id/pricing`, `/services/:id/consumption-rules`
- `POST /service-records/preview` (validate proposed lines and stock allocation; no posting)
- `POST /service-records/finalize` (Idempotency-Key required; atomic stock + charge + audit)
- `POST /service-records/:id/reverse` (permission + reason + idempotency)

## Inventory / purchasing
- CRUD `/products`, `/product-categories`, `/suppliers`, `/stock-locations`
- `GET /inventory/balances`, `GET /inventory/lots`, `GET /inventory/alerts`
- `POST /inventory/receipts`, `/inventory/transfers`, `/inventory/counts`, `/inventory/adjustments`
- `POST /inventory/transfers/:id/dispatch`, `POST /inventory/transfers/:id/receive`
- `GET /inventory/movements?sourceType=&sourceId=`

## Prescriptions / vaccines / laboratory
- CRUD `/prescriptions`; `POST /prescriptions/:id/sign`; `POST /prescriptions/:id/dispense`
- `POST /patients/:id/vaccine-events`; `GET /vaccinations/due`
- CRUD `/lab-orders`; `POST /lab-orders/:id/results`

## Finance
- `POST /charges/:id/payments`, `POST /payments`, `POST /payments/:id/refund`
- CRUD `/cash-registers`; `POST /cash-sessions/open`; `POST /cash-sessions/:id/close`
- CRUD `/expenses`; `GET /owners/:id/statement`

## Mobile sync
- `POST /sync/push` accepts bounded batch with operation IDs and entity versions.
- `GET /sync/pull?cursor=` returns permitted delta and cursor.
- Each operation returns accepted, duplicate, conflict or rejected with stable error code.
- Do not permit offline commands to finalize stock/finance actions unless server executes and confirms them synchronously.

## Common rules
- Enforce RBAC, clinic scope and branch scope at controller/service level.
- Validate all body/query/route inputs; reject mass assignment.
- Return stable error codes; include correlation ID.
- Redact sensitive data from logs.
- Rate-limit authentication, search, file upload and export endpoints.
