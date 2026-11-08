import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../common/auth/password.service';
import type { AuthContext } from '../common/auth/auth-context';
import type { CreateStaffDto, UpdateStaffDto } from '../master/master.dto';

const STAFF_LIST_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  title: true,
  phone: true,
  active: true,
  createdAt: true,
  staffRoles: { select: { role: { select: { id: true, key: true, name: true } } } },
  staffBranches: {
    select: { isDefault: true, branch: { select: { id: true, name: true, code: true } } },
  },
} as const;

/**
 * Personel yönetimi. Parolalar scrypt ile hash'lenir, asla geri dönmez.
 * Rol/şube atamaları replace-list (PUT) semantiğindedir ve denetime yazılır.
 */
@Injectable()
export class StaffService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
  ) {}

  list(clinicId: string) {
    return this.prisma.staff.findMany({
      where: { clinicId },
      orderBy: [{ active: 'desc' }, { firstName: 'asc' }],
      select: STAFF_LIST_SELECT,
    });
  }

  /**
   * Atama seçicileri için hafif liste — yalnız aktif personel; ad-soyad/unvan.
   * Lab/cerrahi/yatış diyaloqlarında veteriner ataması için kullanılır;
   * e-posta, rol ve şube verisi içermez.
   */
  listAssignees(clinicId: string) {
    return this.prisma.staff.findMany({
      where: { clinicId, active: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, title: true },
    });
  }

  async detail(clinicId: string, id: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id, clinicId },
      select: STAFF_LIST_SELECT,
    });
    if (!staff) throw new NotFoundException('Personel bulunamadı');
    return staff;
  }

  private async assertRolesAndBranches(clinicId: string, roleIds: string[], branchIds: string[]) {
    if (roleIds.length > 0) {
      const count = await this.prisma.role.count({ where: { id: { in: roleIds }, clinicId } });
      if (count !== roleIds.length)
        throw new NotFoundException('Bir veya daha fazla rol bulunamadı');
    }
    if (branchIds.length > 0) {
      const count = await this.prisma.branch.count({ where: { id: { in: branchIds }, clinicId } });
      if (count !== branchIds.length)
        throw new NotFoundException('Bir veya daha fazla şube bulunamadı');
    }
  }

  async create(auth: AuthContext, dto: CreateStaffDto) {
    const email = dto.email.toLowerCase().trim();
    const exists = await this.prisma.staff.findUnique({ where: { email }, select: { id: true } });
    if (exists) throw new ConflictException('Bu e-posta zaten kayıtlı');
    const roleIds = dto.roleIds ?? [];
    const branchIds = dto.branchIds ?? [];
    await this.assertRolesAndBranches(auth.clinicId, roleIds, branchIds);
    if (roleIds.length === 0 || branchIds.length === 0) {
      throw new ForbiddenException('Personel en az bir rol ve bir şube ile tanımlanmalı');
    }

    const staff = await this.prisma.staff.create({
      data: {
        clinicId: auth.clinicId,
        email,
        passwordHash: this.passwords.hash(dto.password),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        title: dto.title ?? null,
        phone: dto.phone ?? null,
        staffRoles: { create: roleIds.map((roleId) => ({ roleId })) },
        staffBranches: { create: branchIds.map((branchId) => ({ branchId, isDefault: false })) },
      },
      select: STAFF_LIST_SELECT,
    });

    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'staff.create',
      entityType: 'staff',
      entityId: staff.id,
      metadata: { email: staff.email, roleIds, branchIds },
    });
    return staff;
  }

  async update(auth: AuthContext, id: string, dto: UpdateStaffDto) {
    const before = await this.prisma.staff.findFirst({ where: { id, clinicId: auth.clinicId } });
    if (!before) throw new NotFoundException('Personel bulunamadı');
    const staff = await this.prisma.staff.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        // Parola değişikliği açık oturumları geçersiz kılar.
        ...(dto.password ? { passwordHash: this.passwords.hash(dto.password) } : {}),
        ...(dto.active === false || dto.password
          ? {
              sessions: {
                updateMany: {
                  where: { revokedAt: null },
                  data: { revokedAt: new Date(), revokedReason: 'logout' },
                },
              },
            }
          : {}),
      },
      select: STAFF_LIST_SELECT,
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'staff.update',
      entityType: 'staff',
      entityId: id,
      metadata: {
        before: { active: before.active, title: before.title },
        after: { active: staff.active, title: staff.title },
        passwordChanged: Boolean(dto.password),
      },
    });
    return staff;
  }

  async setRoles(auth: AuthContext, id: string, roleIds: string[]) {
    const staff = await this.prisma.staff.findFirst({
      where: { id, clinicId: auth.clinicId },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Personel bulunamadı');
    await this.assertRolesAndBranches(auth.clinicId, roleIds, []);
    if (roleIds.length === 0) throw new ForbiddenException('Personel en az bir role sahip olmalı');
    const beforeRoles = await this.prisma.staffRole.findMany({
      where: { staffId: id },
      select: { roleId: true, role: { select: { name: true } } },
    });
    await this.prisma.$transaction([
      this.prisma.staffRole.deleteMany({ where: { staffId: id } }),
      this.prisma.staffRole.createMany({
        data: roleIds.map((roleId) => ({ staffId: id, roleId })),
      }),
    ]);
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'staff.roles.update',
      entityType: 'staff',
      entityId: id,
      metadata: {
        before: beforeRoles.map((sr) => sr.roleId),
        after: roleIds,
      },
    });
    return this.detail(auth.clinicId, id);
  }

  async setBranches(auth: AuthContext, id: string, branchIds: string[]) {
    const staff = await this.prisma.staff.findFirst({
      where: { id, clinicId: auth.clinicId },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Personel bulunamadı');
    await this.assertRolesAndBranches(auth.clinicId, [], branchIds);
    if (branchIds.length === 0) throw new ForbiddenException('Personel en az bir şubeye atanmalı');
    const beforeBranches = await this.prisma.staffBranch.findMany({
      where: { staffId: id },
      select: { branchId: true },
    });
    await this.prisma.$transaction([
      this.prisma.staffBranch.deleteMany({ where: { staffId: id } }),
      this.prisma.staffBranch.createMany({
        data: branchIds.map((branchId) => ({ staffId: id, branchId, isDefault: false })),
      }),
    ]);
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'staff.branches.update',
      entityType: 'staff',
      entityId: id,
      metadata: {
        before: beforeBranches.map((sb) => sb.branchId),
        after: branchIds,
      },
    });
    return this.detail(auth.clinicId, id);
  }
}
