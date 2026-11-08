/** Faz 03 API yanıt tipleri — @vetcore/contracts'a Faz 04+ sürümünde taşınacak. */

export type ClinicProfile = {
  id: string;
  name: string;
  legalName: string | null;
  slug: string;
  timezone: string;
  locale: string;
  currency: string;
};

export type Branch = {
  id: string;
  clinicId: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  active: boolean;
};

export type StaffMember = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  title: string | null;
  phone: string | null;
  active: boolean;
  createdAt: string;
  staffRoles: { role: { id: string; key: string; name: string } }[];
  staffBranches: { isDefault: boolean; branch: { id: string; name: string; code: string } }[];
};

export type Role = {
  id: string;
  clinicId: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  allBranches: boolean;
  active: boolean;
  rolePermissions: { permissionKey: string; permission: { name: string; group: string } }[];
  _count?: { staffRoles: number };
};

export type Permission = {
  key: string;
  group: string;
  name: string;
  description: string | null;
};

export type AuditEvent = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  staff: { firstName: string; lastName: string; email: string } | null;
  branch: { name: string; code: string } | null;
};

export type AuditListResponse = {
  items: AuditEvent[];
  total: number;
};

/* ---------- Faz 04: sahip, hasta, tür/ırk, uyarı, kilo, dosya ---------- */

export type SpeciesOption = {
  id: string;
  key: string;
  name: string;
  breeds: { id: string; name: string }[];
};

export type OwnerContact = {
  id: string;
  kind: 'phone' | 'email';
  value: string;
  normalized: string;
  label: string | null;
  isPrimary: boolean;
};

export type OwnerConsent = {
  id: string;
  kind: string;
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
};

export type OwnerSummary = {
  id: string;
  firstName: string;
  lastName: string;
  identityNo: string | null;
  address: string | null;
  notes: string | null;
  archivedAt: string | null;
  archivedReason: string | null;
  mergedIntoOwnerId: string | null;
  createdAt: string;
  updatedAt: string;
  contacts: OwnerContact[];
  consents: OwnerConsent[];
  _count?: { patients: number };
};

export type PatientAlert = {
  id: string;
  kind: 'allergy' | 'chronic' | 'warning';
  label: string;
  severity: 'low' | 'medium' | 'high';
  active: boolean;
  resolvedAt: string | null;
  createdAt: string;
};

export type OwnerPatient = {
  id: string;
  code: string;
  name: string;
  species: { id: string; name: string };
  breed: { id: string; name: string } | null;
  gender: string;
  birthDate: string | null;
  archivedAt: string | null;
  alerts: PatientAlert[];
};

export type OwnerDetail = OwnerSummary & {
  mergedIntoOwner: { id: string; firstName: string; lastName: string } | null;
  patients: OwnerPatient[];
};

export type OwnerDuplicateCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  reasons: ('phone' | 'email' | 'name')[];
  primaryContact: { kind: string; value: string } | null;
};

export type PatientSummary = {
  id: string;
  code: string;
  name: string;
  microchip: string | null;
  gender: string;
  birthDate: string | null;
  neutered: boolean;
  color: string | null;
  bloodType: string | null;
  archivedAt: string | null;
  archivedReason: string | null;
  mergedIntoPatientId: string | null;
  species: { id: string; name: string };
  breed: { id: string; name: string } | null;
  owner: { id: string; firstName: string; lastName: string };
  alerts: PatientAlert[];
  _count?: { files: number };
};

export type WeightObservation = {
  id: string;
  weightKg: string | number;
  measuredAt: string;
  note: string | null;
  createdByStaffId: string | null;
};

export type PatientDetail = PatientSummary & {
  branch: { id: string; name: string; code: string };
  mergedIntoPatient: { id: string; name: string; code: string } | null;
  weights: WeightObservation[];
};

export type TimelineEvent = {
  id: string;
  type:
    | 'weight'
    | 'alert'
    | 'alert-resolved'
    | 'file'
    | 'created'
    | 'archived'
    | 'merge'
    | 'patient.update';
  title: string;
  description?: string | null;
  at: string;
  byStaff?: string | null;
};

export type FileAssetMeta = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: 'document' | 'image' | 'lab-result' | 'other';
  createdAt: string;
  uploadedByStaffId: string | null;
};

/** Faz 05 — randevu ve akış panosu tipleri. */

export type AppointmentStatus =
  | 'scheduled'
  | 'arrived'
  | 'waiting'
  | 'in_consultation'
  | 'completed'
  | 'no_show'
  | 'cancelled';

export type AppointmentTypeOption = {
  id: string;
  name: string;
  durationMin: number;
  colorKey: 'brand' | 'green' | 'amber' | 'red' | 'violet' | 'cyan';
  active: boolean;
  createdAt: string;
};

export type ScheduleBlock = {
  id: string;
  branchId: string;
  staffId: string | null;
  kind: 'working' | 'blocked';
  weekday: number;
  startMin: number;
  endMin: number;
  note: string | null;
  active: boolean;
  staff: { id: string; firstName: string; lastName: string; title: string | null } | null;
};

export type PatientAlertBadge = { kind: string; label: string; severity: string };

export type Appointment = {
  id: string;
  clinicId: string;
  branchId: string;
  patientId: string;
  ownerId: string;
  appointmentTypeId: string;
  staffId: string;
  roomId: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  status: AppointmentStatus;
  notes: string | null;
  cancelledReason: string | null;
  checkedInAt: string | null;
  waitingAt: string | null;
  inConsultationAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  overrideReason: string | null;
  patient: {
    id: string;
    name: string;
    code: string;
    branchId: string;
    ownerId: string;
    alerts: PatientAlertBadge[];
  };
  owner: { id: string; firstName: string; lastName: string };
  type: { id: string; name: string; colorKey: string; durationMin: number };
  staff: { id: string; firstName: string; lastName: string; title: string | null };
  room: { id: string; name: string } | null;
  branch: { id: string; name: string; code: string };
};

export type FlowboardEntry = {
  appointmentId: string;
  status: AppointmentStatus;
  scheduledStart: string;
  scheduledEnd: string;
  waitingMinutes: number;
  notes: string | null;
  patient: { id: string; name: string; code: string; alerts: PatientAlertBadge[] };
  owner: { id: string; fullName: string };
  type: { id: string; name: string; colorKey: string; durationMin: number };
  staff: { id: string; fullName: string };
  room: { id: string; name: string } | null;
};

export type FlowboardPayload = {
  date: string;
  lanes: {
    arrived: FlowboardEntry[];
    waiting: FlowboardEntry[];
    in_consultation: FlowboardEntry[];
  };
  counts: Record<AppointmentStatus, number>;
};

export type WaitlistEntry = {
  id: string;
  branchId: string;
  patientId: string;
  ownerId: string;
  appointmentTypeId: string | null;
  preferredStaffId: string | null;
  preferredDate: string | null;
  preferredStartMin: number | null;
  preferredEndMin: number | null;
  note: string | null;
  status: 'waiting' | 'scheduled' | 'cancelled';
  bookedAppointmentId: string | null;
  createdAt: string;
  patient: { id: string; name: string; code: string; alerts: PatientAlertBadge[] };
  owner: { id: string; firstName: string; lastName: string };
  type: { id: string; name: string; colorKey: string; durationMin: number } | null;
  preferredStaff: { id: string; firstName: string; lastName: string } | null;
  bookedAppointment: { id: string; status: string; scheduledStart: string } | null;
};

export type RoomOption = {
  id: string;
  branchId: string;
  name: string;
  kind: string;
  active: boolean;
  branch: { id: string; name: string; code: string };
};

/* ---------- Faz 06: muayene, SOAP, vital bulgular ve hizmet kataloğu ---------- */

export type EncounterStatus = 'draft' | 'in_progress' | 'signed' | 'closed' | 'voided';

export type VitalKind =
  | 'temp'
  | 'weight'
  | 'heart_rate'
  | 'resp_rate'
  | 'cap_refill'
  | 'blood_pressure'
  | 'glucose'
  | 'pain_score'
  | 'other';

export type VitalKindMeta = { kind: VitalKind; label: string; unit: string };

/** Vital katalogları — API'deki encounters.domain ile eşit tutulur (UI seçim listesi). */
export const VITAL_KIND_CATALOG: readonly VitalKindMeta[] = [
  { kind: 'temp', label: 'Vücut Sıcaklığı', unit: '°C' },
  { kind: 'weight', label: 'Ağırlık', unit: 'kg' },
  { kind: 'heart_rate', label: 'Kalp Atışı', unit: 'atım/dk' },
  { kind: 'resp_rate', label: 'Solunum', unit: '/dk' },
  { kind: 'cap_refill', label: 'Kapiler Dolum', unit: 'sn' },
  { kind: 'blood_pressure', label: 'Tansiyon', unit: 'mmHg' },
  { kind: 'glucose', label: 'Kan Şekeri', unit: 'mg/dL' },
  { kind: 'pain_score', label: 'Ağrı Skoru', unit: '0-10' },
  { kind: 'other', label: 'Diğer', unit: '' },
];

export type EncounterVital = {
  id: string;
  kind: string;
  value: string;
  unit: string;
  measuredAt: string;
  note: string | null;
  createdBy: { firstName: string; lastName: string } | null;
};

export type EncounterDiagnosis = {
  id: string;
  code: string | null;
  name: string;
  kind: string;
  note: string | null;
  createdAt: string;
};

export type EncounterAttachment = {
  id: string;
  label: string | null;
  createdAt: string;
  asset: { id: string; fileName: string; mimeType: string; sizeBytes: number; kind: string };
};

export type EncounterAddendum = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; firstName: string; lastName: string; title: string | null };
};

export type ServiceRecordLineDto = {
  id: string;
  qty: string;
  unitPrice: string;
  discount: string;
  tax: string;
  lineTotal: string;
  service: { id: string; code: string; name: string; category: string };
};

/** Faz 08 — ücret satırı (append-only; reversal satırları negatif). */
export type ChargeLineDto = {
  id: string;
  sourceType: string; // 'service' | 'service_reversal'
  description: string;
  qty: string;
  unitPrice: string;
  taxAmount: string;
  total: string;
};

export type ChargeDto = {
  id: string;
  status: string; // 'open' | 'void'
  total: string;
  currency: string;
  lines: ChargeLineDto[];
};

export type ServiceRecordDto = {
  id: string;
  status: string;
  performedBy: { firstName: string; lastName: string } | null;
  finalizedAt: string | null;
  reversedAt: string | null;
  reversedBy: { firstName: string; lastName: string } | null;
  createdAt: string;
  lines: ServiceRecordLineDto[];
  charge: ChargeDto | null;
};

/** Faz 08 — kesinleştirme önizlemesi: tüketim planı + ücret. */
export type ConsumptionPreviewLot = {
  lotId: string;
  lotCode: string;
  warehouseId: string;
  expiresAt: string | null;
  qtyOnHand: number;
  unitCost: number;
  blockReason: string | null;
};

export type ConsumptionPreviewLine = {
  ruleId: string;
  productId: string;
  productCode: string | null;
  productName: string | null;
  trackingType: string;
  unit: string | null;
  qty: number;
  required: boolean;
  allocationPolicy: string;
  suggestedWarehouseId: string | null;
  suggestedAllocations: { lotId: string; lotCode: string; qty: number }[];
  shortfall: number;
  warning: string | null;
  lots: ConsumptionPreviewLot[];
};

export type ConsumptionPreview = {
  record: { id: string; status: string };
  consumptions: ConsumptionPreviewLine[];
  issues: { code: string; message: string; serviceId?: string; ruleId?: string }[];
  charge: { lines: { description: string; qty: number; unitPrice: number; taxAmount: number; total: number }[]; total: number };
};

/** Faz 08 — finalize gövdesinde gönderilen onaylı tüketim satırı. */
export type ConsumptionInput = {
  productId: string;
  warehouseId: string;
  lotId?: string;
  qty: number;
};

export type EncounterDetail = {
  id: string;
  clinicId: string;
  branchId: string;
  patientId: string;
  ownerId: string;
  status: EncounterStatus;
  chiefComplaint: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  notes: string | null;
  startedAt: string;
  signedAt: string | null;
  closedAt: string | null;
  version: number;
  patient: {
    id: string;
    name: string;
    code: string;
    gender: string;
    birthDate: string | null;
    branchId: string;
    ownerId: string;
    species: { name: string } | null;
    breed: { name: string } | null;
    alerts: PatientAlertBadge[];
  };
  owner: { id: string; firstName: string; lastName: string };
  veterinarian: { id: string; firstName: string; lastName: string; title: string | null };
  signedBy: { id: string; firstName: string; lastName: string } | null;
  appointment: { id: string; scheduledStart: string; status: string } | null;
  branch: { id: string; name: string; code: string };
  vitals: EncounterVital[];
  diagnoses: EncounterDiagnosis[];
  attachments: EncounterAttachment[];
  addendums: EncounterAddendum[];
  serviceRecords: ServiceRecordDto[];
};

export type EncounterListItem = {
  id: string;
  clinicId: string;
  branchId: string;
  patientId: string;
  ownerId: string;
  status: EncounterStatus;
  chiefComplaint: string | null;
  startedAt: string;
  signedAt: string | null;
  version: number;
  veterinarian: { id: string; firstName: string; lastName: string };
  patient: { id: string; name: string; code: string };
  branch: { id: string; name: string; code: string };
  _count: { vitals: number; diagnoses: number; addendums: number; serviceRecords: number };
};

export type ServicePriceDto = {
  id: string;
  branchId: string | null;
  branch: { id: string; name: string; code: string } | null;
  currency: string;
  amount: string;
  taxCode: string | null;
  validFrom: string;
  validTo: string | null;
};

export type ServiceConsumptionRuleDto = {
  id: string;
  defaultQty: string;
  unit: string | null;
  required: boolean;
  allocationPolicy: string;
  active: boolean;
};

export type ServiceDto = {
  id: string;
  clinicId: string;
  code: string;
  name: string;
  category: string;
  durationMin: number;
  notes: string | null;
  active: boolean;
  prices: ServicePriceDto[];
  consumptionRules: ServiceConsumptionRuleDto[];
};

export const SERVICE_CATEGORY_CATALOG: readonly { value: string; label: string }[] = [
  { value: 'muayene', label: 'Muayene' },
  { value: 'cerrahi', label: 'Cerrahi' },
  { value: 'laboratuvar', label: 'Laboratuvar' },
  { value: 'aşılama', label: 'Aşılama' },
  { value: 'görüntüleme', label: 'Görüntüleme' },
  { value: 'diş', label: 'Diş' },
  { value: 'bakım', label: 'Bakım' },
  { value: 'diğer', label: 'Diğer' },
];

// ── Faz 07 — Ürün, tedarikçi, parti ve stok defteri ────────────────────────

export type ProductCategoryDto = {
  id: string;
  clinicId: string;
  name: string;
  active: boolean;
};

export type UnitDto = {
  id: string;
  clinicId: string;
  key: string;
  name: string;
};

export type ProductConversionDto = {
  id: string;
  fromUnit: { id: string; key: string; name: string };
  toUnit: { id: string; key: string; name: string };
  factor: string;
};

export type ProductDto = {
  id: string;
  clinicId: string;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  code: string;
  barcode: string | null;
  name: string;
  trackingType: 'lot' | 'none';
  baseUnit: { id: string; key: string; name: string };
  minStock: string;
  defaultSalePrice: string | null;
  notes: string | null;
  active: boolean;
  conversions: ProductConversionDto[];
};

export type SupplierDto = {
  id: string;
  clinicId: string;
  name: string;
  taxNumber: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
};

export type LotBlockReason = 'expired' | 'quarantined' | 'exhausted';

export type LotViewDto = {
  id: string;
  lotCode: string;
  expiresAt: string | null;
  status: string;
  unitCost: number;
  receivedAt: string;
  qtyOnHand: number;
  warehouseId: string;
  warehouseName: string;
  branchName: string;
  blockReason: LotBlockReason | null;
};

export type StockBalanceDto = {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  trackingType: 'lot' | 'none';
  unit: string;
  minStock: number;
  warehouseId: string;
  warehouseName: string;
  branchName: string;
  lotId: string | null;
  lotCode: string | null;
  expiresAt: string | null;
  lotStatus: string | null;
  qtyOnHand: number;
  lowStock: boolean;
};

export type StockMovementLineDto = {
  id: string;
  productId: string;
  product: { id: string; code: string; name: string };
  lotId: string | null;
  lot: { id: string; lotCode: string; expiresAt: string | null } | null;
  qty: string;
  unitCost: string;
};

export type StockMovementDto = {
  id: string;
  clinicId: string;
  branchId: string;
  warehouseId: string;
  warehouse: { id: string; name: string; branch: { name: string } };
  kind: string;
  status: string;
  supplier: { id: string; name: string } | null;
  refType: string | null;
  refId: string | null;
  reason: string | null;
  note: string | null;
  performedBy: { id: string; firstName: string; lastName: string } | null;
  idempotencyKey: string | null;
  postedAt: string;
  lines: StockMovementLineDto[];
};

export type StockTransferLineDto = {
  id: string;
  productId: string;
  product: { id: string; code: string; name: string };
  lotId: string | null;
  lot: { id: string; lotCode: string; expiresAt: string | null } | null;
  qty: string;
  receivedLot: { id: string; lotCode: string } | null;
};

export type StockTransferDto = {
  id: string;
  clinicId: string;
  code: string;
  fromWarehouse: { id: string; name: string; branch: { name: string } };
  toWarehouse: { id: string; name: string; branch: { name: string } };
  status: 'draft' | 'dispatched' | 'received' | 'cancelled';
  note: string | null;
  dispatchedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  lines: StockTransferLineDto[];
};

export type StockCountLineDto = {
  id: string;
  productId: string;
  product: { id: string; code: string; name: string };
  lotId: string | null;
  lot: { id: string; lotCode: string; expiresAt: string | null } | null;
  expectedQty: string;
  countedQty: string | null;
};

export type StockCountDto = {
  id: string;
  clinicId: string;
  code: string;
  warehouse: { id: string; name: string; branch: { name: string } };
  status: 'draft' | 'completed' | 'cancelled';
  note: string | null;
  completedAt: string | null;
  completedBy: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
  lines: StockCountLineDto[];
};

export type TemperatureLogDto = {
  id: string;
  warehouseId: string;
  warehouse: { id: string; name: string };
  celsius: string;
  measuredAt: string;
  note: string | null;
  recordedBy: { id: string; firstName: string; lastName: string } | null;
};

export type StockAlertsDto = {
  expiringLots: {
    lotId: string;
    lotCode: string;
    productId: string;
    productName: string;
    warehouseId: string;
    warehouseName: string;
    expiresAt: string;
    expired: boolean;
    qtyOnHand: number;
    status: string;
  }[];
  lowStockProducts: {
    productId: string;
    productCode: string;
    productName: string;
    warehouseId: string;
    warehouseName: string;
    total: number;
    minStock: number;
  }[];
};

export const MOVEMENT_KIND_CATALOG: readonly { value: string; label: string }[] = [
  { value: 'goods_receipt', label: 'Mal Kabul' },
  { value: 'consumption', label: 'Tüketim' },
  { value: 'adjustment', label: 'Düzeltme' },
  { value: 'transfer_out', label: 'Transfer Sevk' },
  { value: 'transfer_in', label: 'Transfer Teslim' },
  { value: 'supplier_return', label: 'Tedarikçi İadesi' },
];

// ─── Faz 09 — kasa, tahsilat, cari hesap ve giderler ────────────────────────

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

export const PAYMENT_METHOD_CATALOG: readonly { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Nakit' },
  { value: 'card', label: 'Kart' },
  { value: 'transfer', label: 'Havale/EFT' },
  { value: 'other', label: 'Diğer' },
];

export const EXPENSE_CATEGORY_CATALOG: readonly { value: string; label: string }[] = [
  { value: 'medication', label: 'İlaç/Tıbbi Sarf' },
  { value: 'equipment', label: 'Ekipman' },
  { value: 'rent', label: 'Kira' },
  { value: 'salary', label: 'Maaş' },
  { value: 'utility', label: 'Fatura/Abonelik' },
  { value: 'marketing', label: 'Pazarlama' },
  { value: 'maintenance', label: 'Bakım/Onarım' },
  { value: 'other', label: 'Diğer' },
];

export type FinanceChargeDto = {
  id: string;
  ownerId: string;
  owner: { id: string; firstName: string; lastName: string };
  patientId: string | null;
  patientName: string | null;
  status: 'open' | 'partial' | 'paid' | 'void';
  total: string;
  allocated: string;
  balance: string;
  description: string | null;
  createdAt: string;
};

export type OwnerBalanceDto = {
  ownerId: string;
  name: string;
  charges: string;
  payments: string;
  refunds: string;
  balance: string;
  archived: boolean;
};

export type PaymentDto = {
  id: string;
  ownerId: string;
  owner: { id: string; firstName: string; lastName: string };
  method: PaymentMethod;
  amount: string;
  refunded: string;
  net: string;
  note: string | null;
  createdAt: string;
};

export type PaymentDetailDto = {
  id: string;
  ownerId: string;
  owner: { id: string; firstName: string; lastName: string };
  branchId: string;
  method: PaymentMethod;
  amount: string;
  idempotencyKey: string | null;
  cashSessionId: string | null;
  note: string | null;
  createdBy: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
  allocations: { chargeId: string; chargeStatus: string; chargeTotal: string; amount: string }[];
  refunds: { id: string; amount: string; reason: string; createdAt: string }[];
  refunded: string;
  refundable: string;
};

export type StatementRowDto = {
  id: string;
  kind: 'charge' | 'payment' | 'refund';
  direction: '+' | '-';
  amount: string;
  runningBalance: string;
  occurredAt: string;
  description: string;
};

export type StatementDto = {
  owner: { id: string; name: string };
  rows: StatementRowDto[];
  closingBalance: string;
  summary: { charges: string; payments: string; refunds: string };
};

export type CashRegisterDto = {
  id: string;
  name: string;
  branch: { id: string; name: string };
  active: boolean;
  openSession: {
    id: string;
    openingFloat: string;
    expected: string | null;
    openedAt: string;
  } | null;
};

export type CashSessionDto = {
  id: string;
  status: 'open' | 'closed';
  register: { id: string; name: string };
  openingFloat: string;
  countedTotal: string | null;
  expectedTotal: string | null;
  difference: string | null;
  differenceNote: string | null;
  openedBy?: { firstName: string; lastName: string };
  openedAt: string;
  closedAt: string | null;
};

export type CashSessionDetailDto = CashSessionDto & {
  branchId: string;
  live: { expected: string; cashIn: string; cashOut: string };
  movements: {
    id: string;
    direction: 'in' | 'out';
    amount: string;
    sourceType: string;
    sourceId: string | null;
    reason: string | null;
    createdAt: string;
  }[];
};

export type ExpenseDto = {
  id: string;
  branchId: string;
  category: string;
  method: PaymentMethod;
  amount: string;
  description: string;
  vendor: { id: string; name: string } | null;
  createdBy: { firstName: string; lastName: string } | null;
  spentAt: string;
};

export type SupplierPayableDto = {
  id: string;
  supplier: { id: string; name: string };
  documentNo: string | null;
  description: string | null;
  amount: string;
  paidAmount: string;
  status: 'open' | 'settled' | 'void';
  dueDate: string | null;
  settledAt: string | null;
  createdAt: string;
};
// ── Faz 10 — Reçete, ilaç uygulaması, aşı ve takip ─────────────────────────

export type PrescriptionStatus = 'draft' | 'signed' | 'voided';

export type PrescriptionLineDto = {
  id: string;
  productId: string | null;
  drugName: string;
  form: string;
  doseAmount: string | number | null;
  doseUnit: string | null;
  route: string;
  frequency: string;
  durationDays: number | null;
  quantity: string | number;
  quantityUnit: string;
  instructions: string | null;
  doseCalcWeightKg: string | number | null;
  doseCalcMgPerKg: string | number | null;
  doseCalcFormula: string | null;
  doseCalcSuggested: string | number | null;
  doseCalcUnit: string | null;
  doseApproved: boolean;
  doseApprovedAt: string | null;
  doseApprovedBy?: { id: string; firstName: string; lastName: string } | null;
  product?: { id: string; code: string; name: string; baseUnit?: { name: string } } | null;
  createdAt: string;
};

export type PrescriptionDto = {
  id: string;
  clinicId: string;
  branchId: string;
  status: PrescriptionStatus;
  code: string | null;
  notes: string | null;
  officialRef: string | null;
  version: number;
  createdAt: string;
  signedAt: string | null;
  voidedAt: string | null;
  voidedReason: string | null;
  patient: { id: string; name: string; code: string };
  veterinarian: { id: string; firstName: string; lastName: string };
  signedBy?: { id: string; firstName: string; lastName: string } | null;
  encounter?: { id: string; status: string; startedAt: string } | null;
  lines: PrescriptionLineDto[];
  _count?: { dispenses: number };
};

export type PrescriptionDetailDto = PrescriptionDto & {
  dispenses: DispenseEventDto[];
  administrations: AdministrationEventDto[];
};

export type DispenseEventDto = {
  id: string;
  prescriptionLineId: string;
  productId: string;
  warehouseId: string;
  lotId: string | null;
  lotCode: string | null;
  expiresAt: string | null;
  qty: string | number;
  movementId: string | null;
  dispensedAt: string;
  note: string | null;
  product?: { id: string; code: string; name: string } | null;
  lot?: { id: string; lotCode: string; expiresAt: string | null } | null;
  dispensedBy?: { id: string; firstName: string; lastName: string } | null;
};

export type AdministrationEventDto = {
  id: string;
  patientId: string;
  prescriptionLineId: string | null;
  drugName: string;
  doseGiven: string | number | null;
  doseUnit: string | null;
  route: string | null;
  site: string | null;
  administeredAt: string;
  note: string | null;
  administeredBy?: { id: string; firstName: string; lastName: string } | null;
  prescriptionLine?: {
    id: string;
    drugName: string;
    prescription: { id: string; code: string | null };
  } | null;
};

export type DoseHelperResultDto = {
  formula: string;
  singleDose: number;
  doseUnit: string;
  dailyDose: number | null;
  courseTotal: number | null;
  inputs: {
    weightKg: number;
    mgPerKg: number;
    frequencyPerDay: number | null;
    durationDays: number | null;
  };
};

export type VaccineProtocolDto = {
  id: string;
  name: string;
  firstDoseAgeDays: number;
  boosterIntervalDays: number;
  reminderLeadDays: number;
  doseLabel: string | null;
  route: string | null;
  notes: string | null;
  active: boolean;
  product: { id: string; code: string; name: string };
  species?: { id: string; key: string; name: string } | null;
};

export type VaccineEventDto = {
  id: string;
  patientId: string;
  lotId: string;
  lotCode: string;
  expiresAt: string | null;
  administeredAt: string;
  nextDueAt: string | null;
  doseLabel: string | null;
  route: string | null;
  site: string | null;
  note: string | null;
  patient: { id: string; name: string; code: string };
  product: { id: string; code: string; name: string };
  lot?: { id: string; lotCode: string; expiresAt: string | null; status: string } | null;
  protocol?: { id: string; name: string; boosterIntervalDays: number } | null;
  administeredBy?: { id: string; firstName: string; lastName: string } | null;
};

export type VaccineScheduleEntryDto = {
  protocolId: string;
  protocolName: string;
  product: { id: string; code: string; name: string };
  doseLabel: string | null;
  dueAt: string;
  basis: 'first_dose' | 'booster';
  classification: 'overdue' | 'due_soon' | 'later';
  lastEventId: string | null;
};

export type VaccineReminderDto = {
  id: string;
  patientId: string;
  vaccineEventId: string | null;
  kind: string;
  dueAt: string;
  status: string;
  channel: string | null;
  sentAt: string | null;
  note: string | null;
  patient: { id: string; name: string; code: string };
  product?: { id: string; code: string; name: string } | null;
  vaccineEvent?: {
    id: string;
    lotCode: string;
    expiresAt: string | null;
    administeredAt: string;
  } | null;
};

export const PRESCRIPTION_FORM_CATALOG: readonly { value: string; label: string }[] = [
  { value: 'tablet', label: 'Tablet' },
  { value: 'sirup', label: 'Şurup' },
  { value: 'enjeksiyon', label: 'Enjeksiyon' },
  { value: 'merhem', label: 'Merhem' },
  { value: 'damla', label: 'Damla' },
  { value: 'diger', label: 'Diğer' },
];

export const PRESCRIPTION_ROUTE_CATALOG: readonly { value: string; label: string }[] = [
  { value: 'oral', label: 'Oral' },
  { value: 'deri_alti', label: 'Deri altı' },
  { value: 'kas_ici', label: 'Kas içi' },
  { value: 'damar_ici', label: 'Damar içi' },
  { value: 'topikal', label: 'Topikal' },
  { value: 'diger', label: 'Diğer' },
];

export const PRESCRIPTION_STATUS_CATALOG: readonly { value: PrescriptionStatus; label: string }[] = [
  { value: 'draft', label: 'Taslak' },
  { value: 'signed', label: 'İmzalı' },
  { value: 'voided', label: 'İptal' },
];

export const VACCINE_REMINDER_KIND_CATALOG: readonly { value: string; label: string }[] = [
  { value: 'booster_due', label: 'Tekrar doz vadesi' },
  { value: 'first_dose', label: 'İlk doz' },
  { value: 'custom', label: 'Serbest' },
];

// ============================================================================
// Faz 11 — Laboratuvar, cerrahi ve yatış
// ============================================================================

export type StaffSummary = { id: string; firstName: string; lastName: string };

export type LabOrderStatus =
  | 'ordered'
  | 'sample_collected'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type LabResultFlag =
  | 'normal'
  | 'low'
  | 'high'
  | 'critical_low'
  | 'critical_high'
  | 'abnormal';

export type LabTestDto = {
  id: string;
  code: string;
  name: string;
  sampleType: string;
  unit: string | null;
  speciesId: string | null;
  refLow: number | null;
  refHigh: number | null;
  criticalLow: number | null;
  criticalHigh: number | null;
  turnaroundHours: number;
  active: boolean;
};

export type LabSampleDto = {
  id: string;
  labelCode: string;
  status: string;
  sampleType: string;
  collectedAt: string;
  rejectionReason: string | null;
};

export type LabResultDto = {
  id: string;
  value: number | null;
  valueText: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  flag: LabResultFlag;
  isCritical: boolean;
  acknowledgedAt: string | null;
  notes: string | null;
  resultedAt: string;
};

export type LabOrderDto = {
  id: string;
  branchId: string;
  status: LabOrderStatus;
  priority: string;
  patient: { id: string; name: string; code: string };
  encounterId: string | null;
  test: { id: string; code: string; name: string; unit: string | null; sampleType: string };
  veterinarian: StaffSummary;
  requestedBy: StaffSummary;
  notes: string | null;
  cancelReason: string | null;
  orderedAt: string;
  completedAt: string | null;
  sample: LabSampleDto | null;
  result: LabResultDto | null;
};

export type LabCriticalResultDto = {
  id: string;
  orderId: string;
  testCode: string;
  testName: string;
  patient: { id: string; name: string; code: string };
  veterinarian: StaffSummary;
  branchId: string;
  flag: string;
  value: number | null;
  valueText: string | null;
  unit: string | null;
  criticalLow: number | null;
  criticalHigh: number | null;
  resultedAt: string;
  acknowledgedAt: string | null;
};

export type SurgeryStatus =
  | 'planned'
  | 'prepped'
  | 'in_surgery'
  | 'recovery'
  | 'completed'
  | 'cancelled';

export type ChecklistItemDto = {
  label: string;
  done: boolean;
  doneAt?: string | null;
  doneById?: string | null;
};

export type SurgeryChecklistDto = {
  kind: 'pre' | 'post';
  total: number;
  done: number;
  items: ChecklistItemDto[];
};

export type SurgeryCaseDto = {
  id: string;
  branchId: string;
  status: SurgeryStatus;
  procedure: string;
  diagnosis: string | null;
  patient: { id: string; name: string; code: string };
  owner: { id: string; firstName: string; lastName: string };
  veterinarian: StaffSummary;
  room: { id: string; name: string; kind: string } | null;
  encounterId: string | null;
  plannedStart: string;
  plannedDurationMin: number;
  actualStart: string | null;
  actualEnd: string | null;
  cancelReason: string | null;
  notes: string | null;
  anesthesia: {
    asaClass: string | null;
    premedication: string | null;
    inductionAgent: string | null;
    maintenanceAgent: string | null;
    monitoringNotes: string | null;
    anesthetistId: string | null;
    startedAt: string | null;
    endedAt: string | null;
  } | null;
  checklists: SurgeryChecklistDto[];
};

export type HospitalStayStatus = 'admitted' | 'transferred' | 'discharged';

export type HospitalStayDto = {
  id: string;
  branchId: string;
  status: HospitalStayStatus;
  patient: { id: string; name: string; code: string };
  owner: { id: string; firstName: string; lastName: string };
  veterinarian: StaffSummary;
  kennel: { id: string; code: string; name: string; size: string };
  encounterId: string | null;
  admissionReason: string;
  admittedAt: string;
  transferredAt: string | null;
  expectedDischargeAt: string | null;
  dischargedAt: string | null;
  dischargeSummary: string | null;
};

export type HospitalPanelItemDto = HospitalStayDto & {
  patientName: string | null;
  lastObservation: {
    kind: string;
    tempC: number | null;
    heartRate: number | null;
    observedAt: string;
  } | null;
  lastMedication: {
    productId: string | null;
    qty: number | null;
    administeredAt: string;
  } | null;
};

export type HospitalPanelDto = {
  totalActiveKennels: number;
  occupiedKennels: number;
  items: HospitalPanelItemDto[];
};

export type HospitalStayDetailDto = HospitalStayDto & {
  observations: Array<{
    id: string;
    kind: string;
    tempC: number | null;
    weightKg: number | null;
    heartRate: number | null;
    respRate: number | null;
    appetite: string | null;
    behavior: string | null;
    notes: string | null;
    observedAt: string;
    observedBy: string;
  }>;
  medications: Array<{
    id: string;
    product: { code: string; name: string; baseUnit?: { key: string; name: string } } | null;
    qty: number | null;
    dose: string | null;
    route: string | null;
    notes: string | null;
    hasStockMovement: boolean;
    administeredAt: string;
    administeredBy: string;
  }>;
};

export type KennelDto = {
  id: string;
  branchId: string;
  code: string;
  name: string;
  size: string;
  active: boolean;
  notes: string | null;
  occupancy: Array<{ stayId: string; patientName: string | null; admittedAt: string }>;
};

export const LAB_ORDER_STATUS_CATALOG: readonly { value: LabOrderStatus; label: string }[] = [
  { value: 'ordered', label: 'İstendi' },
  { value: 'sample_collected', label: 'Numune Alındı' },
  { value: 'in_progress', label: 'Analizde' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'cancelled', label: 'İptal' },
];

export const SURGERY_STATUS_CATALOG: readonly { value: SurgeryStatus; label: string }[] = [
  { value: 'planned', label: 'Planlandı' },
  { value: 'prepped', label: 'Hazırlanıyor' },
  { value: 'in_surgery', label: 'Ameliyatta' },
  { value: 'recovery', label: 'İyileşmede' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'cancelled', label: 'İptal' },
];

export const HOSPITAL_STAY_STATUS_CATALOG: readonly { value: HospitalStayStatus; label: string }[] = [
  { value: 'admitted', label: 'Yatırıda' },
  { value: 'transferred', label: 'Transfer' },
  { value: 'discharged', label: 'Taburcu' },
];
