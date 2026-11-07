import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../common/auth/auth-context';
import type { CreateWarehouseDto, UpdateWarehouseDto } from '../master/master.dto';

/** Depo tanımları — şube kapsamlı placeholder master (stok hareketleri Faz 07). */
@Injectable()
export class WarehousesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(clinicId: string, branchId?: string) {
    return this.prisma.warehouse.findMany({
      where: { branch: { clinicId }, ...(branchId ? { branchId } : {}) },
      orderBy: { name: 'asc' },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
  }

  private async assertClinicBranch(clinicId: string, branchId: string): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, clinicId },
      select: { id: true },
    });
    if (!branch) throw new ForbiddenException('Şube bu kliniğe ait değil');
  }

  async create(auth: AuthContext, dto: CreateWarehouseDto, branchId: string) {
    await this.assertClinicBranch(auth.clinicId, branchId);
    const warehouse = await this.prisma.warehouse.create({
      data: { branchId, name: dto.name.trim(), isDefault: dto.isDefault ?? false },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId,
      action: 'warehouse.create',
      entityType: 'warehouse',
      entityId: warehouse.id,
      metadata: { name: warehouse.name },
    });
    return warehouse;
  }

  async update(auth: AuthContext, id: string, dto: UpdateWarehouseDto) {
    const before = await this.prisma.warehouse.findFirst({
      where: { id, branch: { clinicId: auth.clinicId } },
    });
    if (!before) throw new NotFoundException('Depo bulunamadı');
    if (!auth.allBranches && !auth.branchIds.includes(before.branchId)) {
      throw new ForbiddenException('Bu şube için yetkiniz yok');
    }
    const warehouse = await this.prisma.warehouse.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: before.branchId,
      action: 'warehouse.update',
      entityType: 'warehouse',
      entityId: id,
      metadata: {
        before: { name: before.name, active: before.active },
        after: { name: warehouse.name, active: warehouse.active },
      },
    });
    return warehouse;
  }
}
