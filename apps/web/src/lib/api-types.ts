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
