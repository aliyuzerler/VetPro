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
