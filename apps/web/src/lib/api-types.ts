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
