import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../common/auth/auth-context';

/**
 * Tür/ırk kataloğu — global master veri (seed ile doldurulur).
 * Okuma tüm kimlikli personel içindir (hasta formunda seçim için);
 * yeni ırk ekleme master.manage izni ister (klinik özel ırklar).
 */
@Injectable()
export class SpeciesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.species.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      include: {
        breeds: {
          where: { active: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        },
      },
    });
  }

  async createBreed(auth: AuthContext, speciesId: string, name: string) {
    const species = await this.prisma.species.findFirst({
      where: { id: speciesId, active: true },
      select: { id: true, name: true },
    });
    if (!species) {
      return null;
    }
    const existing = await this.prisma.breed.findFirst({
      where: { speciesId, name },
      select: { id: true },
    });
    if (existing) {
      return { alreadyExists: true as const, breed: existing };
    }
    const breed = await this.prisma.breed.create({ data: { speciesId, name } });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'breed.create',
      entityType: 'breed',
      entityId: breed.id,
      metadata: { name: breed.name, species: species.name },
    });
    return { alreadyExists: false as const, breed };
  }
}
