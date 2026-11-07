import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateBranchDto, UpdateBranchDto } from '../master/master.dto';

@Injectable()
export class BranchesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  list(clinicId: string) {
    return this.prisma.branch.findMany({
      where: { clinicId },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    });
  }

  async create(clinicId: string, staffId: string, dto: CreateBranchDto) {
    const code = dto.code.toUpperCase().trim();
    const exists = await this.prisma.branch.findUnique({
      where: { clinicId_code: { clinicId, code } },
      select: { id: true },
    });
    if (exists) throw new ConflictException('Bu şube kodu kullanılıyor');
    const branch = await this.prisma.branch.create({
      data: {
        clinicId,
        name: dto.name.trim(),
        code,
        address: dto.address ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        isPrimary: dto.isPrimary ?? false,
      },
    });
    await this.audit.record({
      clinicId,
      staffId,
      branchId: branch.id,
      action: 'branch.create',
      entityType: 'branch',
      entityId: branch.id,
      metadata: { name: branch.name, code: branch.code },
    });
    return branch;
  }

  async update(clinicId: string, staffId: string, id: string, dto: UpdateBranchDto) {
    const before = await this.prisma.branch.findFirst({ where: { id, clinicId } });
    if (!before) throw new NotFoundException('Şube bulunamadı');
    const branch = await this.prisma.branch.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    await this.audit.record({
      clinicId,
      staffId,
      branchId: id,
      action: 'branch.update',
      entityType: 'branch',
      entityId: id,
      metadata: { before: { name: before.name, active: before.active }, after: { name: branch.name, active: branch.active } },
    });
    return branch;
  }
}
