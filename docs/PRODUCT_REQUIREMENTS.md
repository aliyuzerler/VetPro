# Product Requirements Document (PRD)

## 1. Product vision
VetCore is a clinic-first operations system that connects the entire patient journey: owner registration → appointment/check-in → examination/treatment → medication/material consumption → charge/payment → follow-up and reminders. The clinic should not have to re-enter the same information in separate screens.

## 2. Target customers
- Independent veterinary clinics and polyclinics
- Multi-veterinarian clinics and small veterinary hospitals
- Clinics with pharmacy/medical-product and consumable inventory
- Clinics operating one or more branches
- Clinics that want desktop administration plus staff mobile access

Primary buyer: clinic owner / responsible veterinarian. Daily users: veterinarians, veterinary technicians/assistants, receptionists, stock managers and accounting staff.

## 3. Commercial model
- Initial delivery: one-time customer-specific license, separately installed instance.
- No recurring subscription, trial expiry or in-app subscription purchase in v1.
- Optional one-time setup/migration/training and separately contracted support/updates.
- A clinic can have multiple branches under one installation/license.
- Future SaaS model may be added behind an entitlement/billing boundary without altering core clinical and stock domain logic.

## 4. Platforms
### Web application
Primary back-office and management surface: full clinic dashboard, patient records, appointments, clinical charts, inventory, purchasing, finance, reporting, users, configuration and exports.

### React Native staff application
Fast operational companion: today's agenda, patient search, check-in/status, visit notes, vital signs, treatment/service entries, camera attachments, vaccine reminders, assigned tasks, stock quick lookup, notifications and offline draft capture. High-risk actions such as stock adjustments, refunds and record voids require additional permission and confirmation.

### Not in v1
A public pet-owner application with self-signup, online appointment booking or direct chat is not part of the initial staff app. Design APIs so an owner portal/mobile app can be added later. Website booking widget may be a later optional module.

## 5. Functional scope

### A. Clinic, branch and staff administration
- Clinic profile, legal/business details, logo, timezone, currency, locale, tax configuration and print settings.
- Branches, rooms, treatment areas, operating hours, appointment resources and stock locations.
- User invitation/activation, role and granular permissions, branch scope, staff profile, veterinarian registration details where required, schedules and leave.
- Role templates: owner, clinic manager, veterinarian, vet assistant/technician, receptionist, stock manager, accountant, groomer. Roles are editable.

### B. Customer/owner management
- Owner/contact card: name, phone, email, address, preferred contact channel, notes, invoice details, communication preferences and required privacy notice records.
- Multiple animals per owner; duplicate detection by normalized phone/email plus manual review.
- Search by name, phone, patient name, microchip/identity number and record number.
- Owner balance, visit history, documents, reminders, consent and communication history.
- Merge duplicate owner records only with audit and permission; preserve historical links.

### C. Animal/patient record
- Patient code, name, species, breed, sex, date of birth/estimated age, color, weight history, microchip/ID, neuter status, photo, owner, source/referral and lifecycle status.
- Medical alerts: allergies, chronic conditions, prior adverse reactions, special handling and isolation flag.
- Timeline of visits, diagnoses, services, medicines, vaccines, lab results, surgeries, hospital stays, files and notes.
- Vital measurements include timestamp, value, unit and recording user. Do not silently overwrite historical observations.
- Patient status: active, deceased, transferred/archived; preserve history.

### D. Appointment and clinic flow
- Day/week/month calendar; veterinarian, room/resource and branch filters.
- Appointment types, duration, buffer, recurring appointment, online-request adapter (future), waitlist and cancellation reason.
- Status lifecycle: requested, confirmed, arrived, waiting, in_consultation, completed, no_show, cancelled.
- Collision prevention for provider and room. Configurable working hours and blocked slots.
- Reception flowboard for patients currently in clinic and their next step.
- Appointment reminders via provider adapter; delivery result and consent tracked.

### E. Consultation / clinical record
- Encounter linked to patient, owner, appointment, branch and responsible veterinarian.
- Structured SOAP: Subjective, Objective, Assessment, Plan; configurable examination templates.
- Chief complaint, anamnesis, physical findings, diagnosis/problem list, vital signs, treatment plan, follow-up date and clinician notes.
- Clinical attachments: photos, lab files, documents and imaging references.
- Draft → signed/finalized workflow; signed records are immutable except addendum/correction flow with audit.
- The system records a professional's decision; it must not diagnose or prescribe automatically.

### F. Service catalog and service records
- Service categories: consultation, examination, vaccination, injection, laboratory, imaging, surgery, hospitalization, grooming, dental, other.
- Price list, branch/role-specific price, tax setting, duration, active/inactive, discount policy and accounting category.
- A service can define default stock consumption rules: product, quantity, unit, optional/mandatory, lot selection policy and wastage allowance.
- Actual consumption can be edited by authorized user before finalization; changes after finalization require reversal/adjustment.
- One service event can include multiple service lines and multiple consumed products.
- Keep performed service, clinical notes, stock consumed, charge and payment as separate but linked domain entities.

### G. Inventory, warehouse and purchasing
- Product master: SKU, barcode, name, category, brand, type (medicine, vaccine, consumable, food, retail, equipment), base unit, purchase/sale unit, conversion, tax, purchase/sale price, minimum stock, storage requirement and traceability flags.
- Warehouses/stock locations per branch; optional bins/shelves.
- Lot/batch, serial where applicable, expiry date, supplier lot code, receipt date, cost, quantity, quarantine/recall status.
- Stock movements: purchase receipt, service consumption, direct sale, transfer, return, waste, expiry, adjustment, opening balance and reversal.
- Immutable stock ledger; balance is derived/cached from movements with reconciliation tools.
- FEFO (earliest expiry first) suggestions for expiry-tracked items. Warn/block expired or quarantined lots. Permissions allow documented override only where lawful and safe.
- Low-stock, expiring-soon and expired-stock alerts.
- Purchase requests, supplier orders, goods receipt, supplier invoice reference, returns and supplier balances.
- Barcode scan from web scanner/camera and mobile camera where supported.
- Multi-branch transfer workflow: request → approve → dispatch → receive; in-transit quantity tracked.
- Cold-chain/temperature logs for configured products, with excursion alert and quarantine workflow.

### H. Critical transaction: service → stock → finance
On service finalization:
1. Validate patient, veterinarian, service lines and required clinical fields.
2. Resolve product consumption rules and user-confirmed actual quantities.
3. Validate available quantities, branch/warehouse, lot, expiry, quarantine and permissions.
4. In one database transaction, create finalized service record, immutable stock movement(s), linked charge/invoice line(s), and audit event; update balance projection.
5. If any required write fails, roll back all writes.
6. Use idempotency key to avoid duplicate finalization from a mobile retry.
7. If product quantity is insufficient, do not partially finalize. Offer authorized alternatives: choose another lot/warehouse, record non-stocked usage with reason if policy permits, or save as pending.
8. Cancellation after posting creates linked reversal entries; never delete posted stock/finance rows.

### I. Prescriptions and medication
- Prescription document linked to encounter/patient/owner and responsible veterinarian.
- Product, strength/form, dose, route, frequency, duration, quantity, administration instructions and warnings entered/confirmed by veterinarian.
- Optional calculation helper for weight-based arithmetic only; show formula, inputs and result, require vet confirmation and do not suggest a drug or regimen.
- Printable/shareable prescription with required clinic and clinician details configurable to current regulations.
- Track prescribed versus dispensed/administered quantities separately.
- Controlled/high-risk medicine categories may require stricter permissions, secondary approval and special register exports according to clinic policy and current law.

### J. Vaccination and preventive care
- Vaccine catalog and configurable schedules by species/age/clinic protocol; not a universal clinical recommendation.
- Vaccination event: product, lot/batch, expiry, dose, route/site, administration time and administering veterinarian.
- Next-dose/recheck date; due/overdue queue and reminders.
- Vaccine card PDF and complete historical timeline.

### K. Finance and cash
- Service charges, product retail sales, discounts with permission, payments, partial payments, refunds and credit balance.
- Payment methods configurable: cash, card/POS reference, bank transfer, other.
- Cash register sessions, opening float, cash in/out, close and variance report.
- Owner account/cari ledger, statement, debt aging and collection notes.
- Expenses and categories; supplier balances and purchase costs.
- Financial dashboards: daily/monthly revenue, payment mix, outstanding balances, discounts, refunds and branch comparison.
- Tax rates and invoice numbering configurable. Official e-invoice/e-archive issuance must use a validated provider/integration adapter; do not claim a PDF is a legal invoice.

### L. Laboratory, surgery and hospitalization
- Lab catalog, request/order, sample metadata, status, result values, reference interval and file attachment; mark critical results for clinician review.
- External lab provider and result import adapter.
- Surgery scheduling, pre-op checklist, anesthesia chart, procedure notes, monitoring and post-op instruction.
- Hospitalization: admission/discharge, ward/kennel/cage, daily rounds, medication administrations, fluid/feeding, vital checks and responsible staff.
- A patient stay can generate service/consumption charges using the same transaction services.

### M. Grooming and boarding (optional module, same patient record)
- Grooming services, resource/staff booking and completion checklist.
- Pet hotel reservation, kennel/room, check-in/out, feeding/medication notes, incident notes and billing.

### N. Notifications and communication
- Internal notifications: appointment changes, due vaccines, low stock, expiry, pending lab results, patient follow-up, cash close and assigned tasks.
- External adapters: SMS, email, WhatsApp Business provider, push notifications. Provider keys live only server-side.
- Consent and contact preference checked before sending marketing messages; transactional reminders handled under reviewed legal basis and clinic policy.
- Delivery attempts, provider message IDs, failures and retries recorded. Avoid duplicate notification on retry.

### O. Reporting, documents and exports
- Patient/owner list, visit statistics, veterinarian workload, service mix, vaccine due list, lab turnaround, inventory valuation, low/expired stock, product consumption, supplier purchases, income/expense, cash and receivables.
- Date/branch/veterinarian/service/product filters; CSV/XLSX/PDF exports with permission and audit.
- Templates for consent, visit summary, vaccine card, prescription, lab report, surgery form, discharge note, quotation and non-fiscal receipt.
- Print templates support clinic branding and Turkish characters.

### P. Audit, backup and administration
- Append-only audit of sign-in, view-sensitive record where appropriate, create/update/finalize/void, permission changes, exports, stock/finance changes and backup operations.
- Automated local backup with encryption-at-rest option, retention policy, offsite copy configuration and restore verification.
- Backup/restore wizard restricted to owner/system administrator.
- Data export/import to avoid vendor lock-in; CSV for core entities and structured JSON plus files for full backup.

## 6. Non-functional requirements
- Turkish UI and Europe/Istanbul timezone as default, localization-ready.
- Responsive web; mobile-first clinical quick actions.
- Offline-capable mobile drafts and read cache. Financial posting and stock finalization require server confirmation; queue with explicit pending state until acknowledged.
- Accessible keyboard navigation and WCAG 2.2 AA-oriented contrast/focus behavior.
- Strong tenant/branch scoping, role-based permissions, secure session management and encrypted transport.
- No data loss on retries; idempotency for all write paths with side effects.
- Observability, structured logs, health checks, metrics and traceable errors.
- Target p95 API response under 400 ms for common read endpoints on agreed test hardware and dataset; long reports run asynchronously.

## 7. MVP release gate
A clinic can create owner and patient; schedule/check in; record examination and service; map service to inventory product; consume correct lot safely; charge/pay; print visit/vaccine documents; track reminders; and review audit/report data from web and staff mobile. This complete end-to-end workflow must pass before the system is called pilot-ready.
