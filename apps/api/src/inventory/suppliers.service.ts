import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import type { CreateSupplierDto, ListSuppliersQueryDto, UpdateSupplierDto } from './inventory.dto';

export const SUPPLIER_ERROR_CODES = {
  DUPLICATE_NAME: 'SUPPLIER_DUPLICATE_NAME',
  NOT_FOUND: 'SUPPLIER_NOT_FOUND',
} as const;

/**
 * Tedarikçi servisi — Faz 07. Klinik kapsamlı master kayıt; mal kabul ve
 * tedarikçi iadesi hareketlerinde referans alınır. Yazma uçları supplier.manage
 * izni ister (controller).
 */
@Injectable()
export class SuppliersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async recordAudit(
    input: {
      clinicId: string;
      staffId?: string | null;
      action: string;
      entityType?: string;
      entityId?: string;
      metadata?: Record<string, unknown>;
    },
    request?: AuthRequest,
  ): Promise<void> {
    await this.audit.record(input, this.prisma);
  }

  async list(auth: AuthContext, query: ListSuppliersQueryDto) {
    const where: Prisma.SupplierWhereInput = {
      clinicId: auth.clinicId,
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { taxNumber: { contains: query.search } },
            ],
          }
        : {}),
    };
    const items = await this.prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    return { items };
  }

  async detail(auth: AuthContext, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, clinicId: auth.clinicId },
    });
    if (!supplier) {
      throw new NotFoundException({
        code: SUPPLIER_ERROR_CODES.NOT_FOUND,
        message: 'Tedarikçi bulunamadı',
      });
    }
    return supplier;
  }

  async create(auth: AuthContext, dto: CreateSupplierDto, request: AuthRequest) {
    const duplicate = await this.prisma.supplier.findFirst({
      where: { clinicId: auth.clinicId, name: dto.name },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: SUPPLIER_ERROR_CODES.DUPLICATE_NAME,
        message: 'Bu tedarikçi adı zaten kayıtlı',
      });
    }
    const supplier = await this.prisma.supplier.create({
      data: {
        clinicId: auth.clinicId,
        name: dto.name,
        taxNumber: dto.taxNumber ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        notes: dto.notes ?? null,
      },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        action: 'SUPPLIER_CREATED',
        entityType: 'Supplier',
        entityId: supplier.id,
        metadata: { name: supplier.name },
      },
      request,
    );
    return supplier;
  }

  async update(auth: AuthContext, supplierId: string, dto: UpdateSupplierDto, request: AuthRequest) {
    const supplier = await this.detail(auth, supplierId);
    const updated = await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.taxNumber !== undefined ? { taxNumber: dto.taxNumber } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        action: 'SUPPLIER_UPDATED',
        entityType: 'Supplier',
        entityId: updated.id,
        metadata: { changes: dto as Record<string, unknown> },
      },
      request,
    );
    return updated;
  }
}
