import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../common/auth/auth-context';
import type { CreateRoomDto, UpdateRoomDto } from '../master/master.dto';

const ROOM_KINDS = ['examination', 'surgery', 'lab', 'other'] as const;

/**
 * Oda kayıtları — şube kapsamlı. Şube kimliği BranchScopeGuard'ın çözümlediği
 * `request.branchId` değeridir (istemci verirse kapsam doğrulanmış olur);
 * allBranches rolünde istemci şubesi klinik doğrulamasından geçer.
 */
@Injectable()
export class RoomsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(clinicId: string, branchId?: string) {
    return this.prisma.room.findMany({
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

  async create(auth: AuthContext, dto: CreateRoomDto, branchId: string) {
    await this.assertClinicBranch(auth.clinicId, branchId);
    const kind = ROOM_KINDS.includes((dto.kind ?? 'examination') as (typeof ROOM_KINDS)[number])
      ? (dto.kind ?? 'examination')
      : 'examination';
    const room = await this.prisma.room.create({
      data: { branchId, name: dto.name.trim(), kind },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId,
      action: 'room.create',
      entityType: 'room',
      entityId: room.id,
      metadata: { name: room.name, kind: room.kind },
    });
    return room;
  }

  async update(auth: AuthContext, id: string, dto: UpdateRoomDto) {
    const before = await this.prisma.room.findFirst({
      where: { id, branch: { clinicId: auth.clinicId } },
    });
    if (!before) throw new NotFoundException('Oda bulunamadı');
    if (!auth.allBranches && !auth.branchIds.includes(before.branchId)) {
      throw new ForbiddenException('Bu şube için yetkiniz yok');
    }
    const room = await this.prisma.room.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.kind !== undefined && ROOM_KINDS.includes(dto.kind as (typeof ROOM_KINDS)[number])
          ? { kind: dto.kind }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: before.branchId,
      action: 'room.update',
      entityType: 'room',
      entityId: id,
      metadata: {
        before: { name: before.name, active: before.active },
        after: { name: room.name, active: room.active },
      },
    });
    return room;
  }
}
