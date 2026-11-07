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

export type ServiceRecordDto = {
  id: string;
  status: string;
  performedBy: { firstName: string; lastName: string } | null;
  finalizedAt: string | null;
  createdAt: string;
  lines: ServiceRecordLineDto[];
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
