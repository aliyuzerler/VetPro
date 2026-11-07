import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AuditInput = {
  clinicId: string;
  staffId?: string | null;
  branchId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Silinmez denetim defteri yazıcısı. Kritik her işlem (giriş, yetki değişikliği,
 * ayar güncellemesi) buradan kaydedilir. Kayıt hatası iş akışını engellemez —
 * yalnızca loglanır (uygunluk kaybı operasyon kesintisinden iyidir).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(input: AuditInput, client?: Pick<PrismaService, 'auditEvent'>): Promise<void> {
    const db = client ?? this.prisma;
    try {
      await db.auditEvent.create({
        data: {
          clinicId: input.clinicId,
          staffId: input.staffId ?? null,
          branchId: input.branchId ?? null,
          action: input.action,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          metadata: (input.metadata ?? undefined) as never,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Denetim kaydı yazılamadı (${input.action}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async list(params: {
    clinicId: string;
    staffId?: string;
    action?: string;
    from?: Date;
    to?: Date;
    skip: number;
    take: number;
  }) {
    const where = {
      clinicId: params.clinicId,
      ...(params.staffId ? { staffId: params.staffId } : {}),
      ...(params.action ? { action: params.action } : {}),
      ...(params.from || params.to
        ? {
            createdAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
        include: {
          staff: { select: { firstName: true, lastName: true, email: true } },
          branch: { select: { name: true, code: true } },
        },
      }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return { items, total };
  }
}
