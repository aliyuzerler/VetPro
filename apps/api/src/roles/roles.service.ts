import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../common/auth/auth-context';
import type { CreateRoleDto, UpdateRoleDto } from '../master/master.dto';

@Injectable()
export class RolesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  list(clinicId: string) {
    return this.prisma.role.findMany({
      where: { clinicId },
      orderBy: [{ name: 'asc' }],
      include: {
        rolePermissions: { select: { permissionKey: true, permission: { select: { name: true, group: true } } } },
        _count: { select: { staffRoles: true } },
      },
    });
  }

  permissionCatalog() {
    return this.prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] });
  }

  private async assertPermissionKeys(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const count = await this.prisma.permission.count({ where: { key: { in: keys } } });
    if (count !== keys.length) throw new NotFoundException('Bilinmeyen izin anahtarı');
  }

  async create(auth: AuthContext, dto: CreateRoleDto) {
    const key = dto.key.toLowerCase().trim();
    const exists = await this.prisma.role.findUnique({
      where: { clinicId_key: { clinicId: auth.clinicId, key } },
      select: { id: true },
    });
    if (exists) throw new ConflictException('Bu rol anahtarı kullanılıyor');
    const permissionKeys = dto.permissionKeys ?? [];
    await this.assertPermissionKeys(permissionKeys);

    const role = await this.prisma.role.create({
      data: {
        clinicId: auth.clinicId,
        key,
        name: dto.name.trim(),
        description: dto.description ?? null,
        allBranches: dto.allBranches ?? false,
        isSystem: false,
        rolePermissions: { create: permissionKeys.map((permissionKey) => ({ permissionKey })) },
      },
      include: { rolePermissions: true },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'role.create',
      entityType: 'role',
      entityId: role.id,
      metadata: { key, name: role.name, permissionKeys, allBranches: role.allBranches },
    });
    return role;
  }

  async update(auth: AuthContext, id: string, dto: UpdateRoleDto) {
    const before = await this.prisma.role.findFirst({ where: { id, clinicId: auth.clinicId } });
    if (!before) throw new NotFoundException('Rol bulunamadı');
    const role = await this.prisma.role.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.allBranches !== undefined ? { allBranches: dto.allBranches } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      include: { rolePermissions: true },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'role.update',
      entityType: 'role',
      entityId: id,
      metadata: {
        before: { name: before.name, allBranches: before.allBranches, active: before.active },
        after: { name: role.name, allBranches: role.allBranches, active: role.active },
      },
    });
    return role;
  }

  /** İzin matrisi yazımı — replace-list semantiği, denetim zorunlu. */
  async setPermissions(auth: AuthContext, id: string, permissionKeys: string[]) {
    const role = await this.prisma.role.findFirst({ where: { id, clinicId: auth.clinicId } });
    if (!role) throw new NotFoundException('Rol bulunamadı');
    const uniqueKeys = [...new Set(permissionKeys)];
    await this.assertPermissionKeys(uniqueKeys);

    const before = await this.prisma.rolePermission.findMany({ where: { roleId: id }, select: { permissionKey: true } });
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (uniqueKeys.length > 0) {
        await tx.rolePermission.createMany({
          data: uniqueKeys.map((permissionKey) => ({ roleId: id, permissionKey })),
        });
      }
      return tx.role.findUnique({ where: { id }, include: { rolePermissions: true } });
    });

    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'role.permissions.update',
      entityType: 'role',
      entityId: id,
      metadata: {
        roleKey: role.key,
        before: before.map((bp) => bp.permissionKey).sort(),
        after: [...uniqueKeys].sort(),
      },
    });
    return updated;
  }
}
