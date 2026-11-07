import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { UpdateClinicDto } from '../auth/dto/auth.dto';

@Injectable()
export class ClinicService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async get(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      include: { branches: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] } },
    });
    if (!clinic) throw new NotFoundException('Klinik bulunamadı');
    return clinic;
  }

  async update(clinicId: string, staffId: string, dto: UpdateClinicDto) {
    const before = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!before) throw new NotFoundException('Klinik bulunamadı');
    const updated = await this.prisma.clinic.update({
      where: { id: clinicId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.legalName !== undefined ? { legalName: dto.legalName } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      },
    });
    await this.audit.record({
      clinicId,
      staffId,
      action: 'clinic.update',
      entityType: 'clinic',
      entityId: clinicId,
      metadata: {
        before: {
          name: before.name,
          timezone: before.timezone,
          locale: before.locale,
          currency: before.currency,
        },
        after: {
          name: updated.name,
          timezone: updated.timezone,
          locale: updated.locale,
          currency: updated.currency,
        },
      },
    });
    return updated;
  }
}
