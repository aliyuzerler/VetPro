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
