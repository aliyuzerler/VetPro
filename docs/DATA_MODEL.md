# Data Model (Logical)

## 1. Conventions
- Primary keys: UUID.
- Business tables carry `clinic_id`; branch-specific records also carry `branch_id`.
- Store timestamps as UTC; store clinic timezone in settings.
- Use `created_at`, `updated_at`, `created_by`, `updated_by`, `version` where appropriate.
- Soft delete only for master/reference records where legally and operationally safe. Posted clinical, financial and inventory records are immutable; use void/reversal/addendum.

## 2. Core entities

| Area | Entities | Important relationships |
|---|---|---|
| Clinic | Clinic, Branch, Room, Warehouse, Staff, Role, Permission, StaffBranch | Clinic 1:N Branch; Branch 1:N rooms/warehouses |
| Owner | Owner, OwnerContact, OwnerConsent, OwnerMerge | Owner 1:N Patient; contacts and consent history |
| Patient | Patient, Species, Breed, PatientAlert, WeightObservation, PatientFile | Patient N:1 Owner; patient timeline links visits/events |
| Scheduling | Appointment, AppointmentType, ScheduleBlock, WaitlistEntry | Appointment N:1 Patient, Owner, Staff, Room, Branch |
| Clinical | Encounter, SoapNote, VitalObservation, Diagnosis, ClinicalAttachment, ClinicalAddendum | Encounter N:1 Patient; linked to appointment and veterinarian |
| Catalog | Service, ServicePrice, ServiceConsumptionRule, Product, ProductCategory, Unit, ProductUnitConversion | Service defines default consumption rules |
| Inventory | StockLocation, InventoryLot, StockMovement, StockMovementLine, StockBalance, StockCount, StockTransfer | Ledger lines reference product, location, lot and source entity |
| Procurement | Supplier, PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine, SupplierReturn | Receipt creates stock ledger entries |
| Finance | Charge, ChargeLine, Payment, PaymentAllocation, Refund, CashRegister, CashSession, CashMovement, Expense, SupplierPayable | Charges linked to visits/services; payments allocate to charges |
| Medication | Prescription, PrescriptionLine, DispenseEvent, AdministrationEvent | Prescription linked to encounter and vet |
| Vaccination | VaccineProtocol, VaccineEvent, VaccineReminder | VaccineEvent references product lot and patient |
| Other clinical | LabOrder, LabResult, SurgeryCase, AnesthesiaRecord, HospitalStay, HospitalObservation, Kennel, GroomingBooking, BoardingBooking | Linked to patient/encounter |
| Platform | Notification, NotificationAttempt, FileAsset, AuditEvent, IntegrationConnection, IdempotencyRecord, SyncOperation, BackupJob | Cross-cutting records |

## 3. Entity detail (minimum fields)

### Patient
`id, clinic_id, owner_id, patient_code, name, species_id, breed_id, sex, birth_date?, estimated_age_text?, color?, microchip_no?, neutered?, weight_current?, photo_asset_id?, status, created_at, updated_at`.
Unique constraints should be carefully scoped; microchip may be nullable and must allow manual review rather than silently rejecting legitimate shared/incorrect input.

### Encounter
`id, clinic_id, branch_id, patient_id, owner_id, appointment_id?, veterinarian_id, status(draft|in_progress|signed|closed|voided), chief_complaint, subjective, objective, assessment, plan, started_at, signed_at?, signed_by?, version`.
Signed record corrections use `ClinicalAddendum` referencing original encounter.

### Service and consumption
`Service(id, clinic_id, code, name, category, duration_min, active)`
`ServicePrice(id, service_id, branch_id?, currency, amount, tax_code, valid_from, valid_to?)`
`ServiceConsumptionRule(id, service_id, product_id, default_qty, unit_id, required, allocation_policy, active)`
`ServiceRecord(id, encounter_id, branch_id, status, performed_by, finalized_at, idempotency_key)`
`ServiceRecordLine(id, service_record_id, service_id, qty, unit_price, discount, tax, line_total)`
`ConsumptionRecord(id, service_record_line_id, product_id, qty, unit_id, stock_location_id, lot_id, stock_movement_line_id)`.

### Stock ledger
`StockMovement(id, clinic_id, branch_id, movement_type, source_type, source_id, status, occurred_at, created_by, reversal_of_id?, idempotency_key)`
`StockMovementLine(id, stock_movement_id, product_id, stock_location_id, lot_id?, qty_base_signed, unit_cost?, reason_code?)`.
Posted movement lines are append-only. A receipt is positive; service consumption is negative. Transfers create linked out/in records and a transfer aggregate.

### Finance
`Charge(id, clinic_id, branch_id, owner_id, patient_id?, encounter_id?, status, currency, total, created_at)`
`ChargeLine(id, charge_id, source_type, source_id, description, qty, unit_price, tax_amount, total)`
`Payment(id, clinic_id, branch_id, owner_id, method, amount, currency, reference?, status, received_at, idempotency_key)`
`PaymentAllocation(id, payment_id, charge_id, amount)`.

## 4. Relationship diagram

```mermaid
erDiagram
  CLINIC ||--o{ BRANCH : has
  BRANCH ||--o{ STAFF_BRANCH : grants
  OWNER ||--o{ PATIENT : owns
  PATIENT ||--o{ APPOINTMENT : books
  PATIENT ||--o{ ENCOUNTER : has
  APPOINTMENT o|--o| ENCOUNTER : starts
  ENCOUNTER ||--o{ SERVICE_RECORD : contains
  SERVICE ||--o{ SERVICE_CONSUMPTION_RULE : defaults
  SERVICE_RECORD ||--o{ SERVICE_RECORD_LINE : includes
  SERVICE_RECORD_LINE ||--o{ CONSUMPTION_RECORD : consumes
  PRODUCT ||--o{ INVENTORY_LOT : tracked_as
  PRODUCT ||--o{ STOCK_MOVEMENT_LINE : moved
  STOCK_MOVEMENT ||--|{ STOCK_MOVEMENT_LINE : contains
  CONSUMPTION_RECORD }o--|| STOCK_MOVEMENT_LINE : posts
  SERVICE_RECORD ||--o| CHARGE : creates
  CHARGE ||--|{ CHARGE_LINE : contains
  PAYMENT ||--o{ PAYMENT_ALLOCATION : allocates
  CHARGE ||--o{ PAYMENT_ALLOCATION : settled_by
  PATIENT ||--o{ VACCINE_EVENT : receives
  PATIENT ||--o{ PRESCRIPTION : has
```

## 5. Required database safeguards
- Foreign keys and check constraints for nonnegative quantities where appropriate, valid date ranges, allowed statuses and monetary precision.
- Unique idempotency key per clinic + operation scope.
- Unique document number per clinic/branch/document type/year.
- Appropriate indexes on patient name, normalized phone, microchip, appointment date/status, owner, branch, product SKU/barcode, lot expiry, stock movement source and audit timestamps.
- Do not use floating-point for money or stock quantities. Use Decimal with explicit precision/scale.
- Avoid global unique constraints on owner phone/email; households may share contacts.
- Stock balance projection must be reconcilable against ledger.
