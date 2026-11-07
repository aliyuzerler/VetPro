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
