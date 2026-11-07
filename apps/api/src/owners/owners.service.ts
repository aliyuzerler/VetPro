import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { normalizeContact } from '../common/normalize';
import { findOwnerDuplicates, type OwnerDuplicateMatch } from '../common/duplicates';
import type { AuthContext } from '../common/auth/auth-context';
import type { CreateOwnerDto, UpdateOwnerDto } from './owners.dto';
import { CONSENT_KINDS } from './owners.dto';

/** List yanıtında dönen özet görünüm (hasta sayısı dahil). */
const OWNER_LIST_INCLUDE = {
  contacts: { orderBy: [{ isPrimary: 'desc' as const }, { kind: 'asc' as const }] },
  consents: true,
  _count: { select: { patients: { where: { archivedAt: null } } } },
} satisfies Prisma.OwnerInclude;

const OWNER_DETAIL_INCLUDE = {
  ...OWNER_LIST_INCLUDE,
  mergedIntoOwner: { select: { id: true, firstName: true, lastName: true } },
  patients: {
    where: { archivedAt: null },
    orderBy: { createdAt: 'desc' as const },
    include: {
      species: { select: { id: true, name: true } },
      breed: { select: { id: true, name: true } },
      alerts: { where: { active: true } },
    },
  },
} satisfies Prisma.OwnerInclude;

type OwnerWithRelations = Prisma.OwnerGetPayload<{ include: typeof OWNER_DETAIL_INCLUDE }>;

/**
 * Hasta sahibi yönetimi — klinik kapsamlı (şubeler arası görünür; hasta kayıtları
 * şube kapsamlıdır). Silme yok: arşiv + açık merge. Mükerrer kontrolü yalnızca
 * uyarı üretir; otomatik birleştirme yapılmaz (kabul kriteri).
 */
@Injectable()
export class OwnersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Serbest metin araması: ad/soyad veya normalize telefon. `q` boşsa alfabetik liste. */
  async list(
    clinicId: string,
    query: { search?: string; includeArchived?: boolean; take?: number },
  ) {
    const search = query.search?.trim() ?? '';
    const take = Math.min(Math.max(query.take ?? 50, 1), 100);
    const digits = search.replace(/\D/g, '');
    const lower = search.toLocaleLowerCase('tr-TR');
    // Ad-soyad araması kelime bazlıdır: her kelime ad VEYA soyad içinde geçebilir
    // ("zeynep aksoy", "aksoy zeynep", "test sahibi" gibi sıra bağımsız eşleşir).
    const words = lower.split(/\s+/).filter((word) => word.length >= 2);

    const where = {
      clinicId,
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(search
        ? {
            OR: [
              ...(words.length > 0
                ? [
                    {
                      AND: words.map((word) => ({
                        OR: [
                          { firstName: { contains: word, mode: 'insensitive' as const } },
                          { lastName: { contains: word, mode: 'insensitive' as const } },
                        ],
                      })),
                    },
                  ]
                : []),
              ...(digits.length >= 7
                ? [{ contacts: { some: { kind: 'phone', normalized: { contains: digits } } } }]
                : []),
              ...(search.includes('@')
                ? [{ contacts: { some: { kind: 'email', normalized: { contains: lower } } } }]
                : []),
            ],
          }
        : {}),
    };

    return this.prisma.owner.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take,
      include: OWNER_LIST_INCLUDE,
    });
  }

  async findOne(clinicId: string, id: string): Promise<OwnerWithRelations> {
    const owner = await this.prisma.owner.findFirst({
      where: { id, clinicId },
      include: OWNER_DETAIL_INCLUDE,
    });
    if (!owner) throw new NotFoundException('Sahip bulunamadı');
    return owner;
  }

  /** Yeni sahip oluşturmadan önce olası mükerrer kayıtları döndürür (uyarı amaçlı). */
  async duplicates(
    clinicId: string,
    input: { firstName?: string; lastName?: string; phone?: string; email?: string },
  ) {
    if (!input.firstName && !input.lastName && !input.phone && !input.email) {
      throw new BadRequestException(
        'En az bir arama alanı gerekli (ad, soyad, telefon veya e-posta)',
      );
    }
    const owners = await this.prisma.owner.findMany({
      where: { clinicId, archivedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        contacts: { select: { kind: true, normalized: true } },
      },
      take: 500,
    });
    const candidates = owners.map((owner) => ({
      id: owner.id,
      firstName: owner.firstName,
      lastName: owner.lastName,
      phoneNumbers: owner.contacts.filter((c) => c.kind === 'phone').map((c) => c.normalized),
      emails: owner.contacts.filter((c) => c.kind === 'email').map((c) => c.normalized),
    }));
    const matches: OwnerDuplicateMatch[] = findOwnerDuplicates(input, candidates);
    // Adaylara kullanıcıya gösterilecek özet alanları ekle (birincil iletişim).
    const byId = new Map(
      (
        await this.prisma.ownerContact.findMany({
          where: { ownerId: { in: matches.map((m) => m.id) }, isPrimary: true },
          select: { ownerId: true, kind: true, value: true },
        })
      ).map((c) => [c.ownerId, c]),
    );
    return matches.map((match) => {
      const primary = byId.get(match.id);
      return {
        id: match.id,
        firstName: match.firstName,
        lastName: match.lastName,
        reasons: match.reasons,
        primaryContact: primary ? { kind: primary.kind, value: primary.value } : null,
      };
    });
  }

  async create(auth: AuthContext, dto: CreateOwnerDto) {
    const phones = dto.contacts.filter((c) => c.kind === 'phone');
    const hasPrimary = phones.length === 0 || phones.some((c) => c.isPrimary);
    if (phones.length > 0 && !hasPrimary) {
      throw new BadRequestException('Telefon kaydı varsa en az biri birincil olmalı');
    }
    const normalizedContacts = dto.contacts.map((c) => ({
      kind: c.kind,
      value: c.value.trim(),
      normalized: normalizeContact(c.kind, c.value),
      label: c.label ?? null,
      isPrimary: c.isPrimary ?? false,
    }));

    const owner = await this.prisma.owner.create({
      data: {
        clinicId: auth.clinicId,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        identityNo: dto.identityNo ?? null,
        address: dto.address ?? null,
        notes: dto.notes ?? null,
        contacts: { create: normalizedContacts },
        consents: {
          create: CONSENT_KINDS.map((kind) => ({
            kind,
            granted: Boolean(dto.consents?.[kind]),
            grantedAt: dto.consents?.[kind] ? new Date() : null,
          })),
        },
      },
      include: OWNER_LIST_INCLUDE,
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'owner.create',
      entityType: 'owner',
      entityId: owner.id,
      metadata: {
        name: `${owner.firstName} ${owner.lastName}`,
        contactCount: normalizedContacts.length,
      },
    });
    return owner;
  }

  async update(auth: AuthContext, id: string, dto: UpdateOwnerDto) {
    const before = await this.prisma.owner.findFirst({
      where: { id, clinicId: auth.clinicId },
      include: { contacts: true, consents: true },
    });
    if (!before) throw new NotFoundException('Sahip bulunamadı');
    if (before.archivedAt)
      throw new ConflictException('Arşivlenmiş sahip düzenlenemez (önce arşivden çıkar)');

    const owner = await this.prisma.$transaction(async (tx) => {
      if (dto.contacts) {
        // Tam liste değişimi: normalize eşleşmeyenler silinir, yenileri eklenir.
        const desired = dto.contacts.map((c) => ({
          kind: c.kind,
          value: c.value.trim(),
          normalized: normalizeContact(c.kind, c.value),
          label: c.label ?? null,
          isPrimary: c.isPrimary ?? false,
        }));
        const existingByNormalized = new Map(
          before.contacts.map((c) => [`${c.kind}:${c.normalized}`, c.id]),
        );
        const desiredKeys = new Set(desired.map((c) => `${c.kind}:${c.normalized}`));
        await tx.ownerContact.deleteMany({
          where: {
            ownerId: id,
            id: {
              notIn: before.contacts
                .filter((c) => desiredKeys.has(`${c.kind}:${c.normalized}`))
                .map((c) => c.id),
            },
          },
        });
        for (const contact of desired) {
          const existingId = existingByNormalized.get(`${contact.kind}:${contact.normalized}`);
          if (existingId) {
            await tx.ownerContact.update({
              where: { id: existingId },
              data: { value: contact.value, label: contact.label, isPrimary: contact.isPrimary },
            });
          } else {
            await tx.ownerContact.create({ data: { ownerId: id, ...contact } });
          }
        }
      }
      if (dto.consents) {
        for (const kind of CONSENT_KINDS) {
          const granted = Boolean(dto.consents[kind]);
          const existing = before.consents.find((c) => c.kind === kind);
          if (!existing) {
            await tx.ownerConsent.create({
              data: { ownerId: id, kind, granted, grantedAt: granted ? new Date() : null },
            });
          } else if (existing.granted !== granted) {
            await tx.ownerConsent.update({
              where: { id: existing.id },
              data: {
                granted,
                grantedAt: granted ? new Date() : existing.grantedAt,
                revokedAt: granted ? null : new Date(),
              },
            });
          }
        }
      }
      return tx.owner.update({
        where: { id },
        data: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
          ...(dto.identityNo !== undefined ? { identityNo: dto.identityNo } : {}),
          ...(dto.address !== undefined ? { address: dto.address } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
        include: OWNER_LIST_INCLUDE,
      });
    });

    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'owner.update',
      entityType: 'owner',
      entityId: id,
      metadata: {
        before: { firstName: before.firstName, lastName: before.lastName },
        after: { firstName: owner.firstName, lastName: owner.lastName },
        contactsReplaced: dto.contacts !== undefined,
      },
    });
    return owner;
  }

  /** Arşivleme (silme yerine): kayıt kalır, listelerden kalkar, düzenlenemez. */
  async archive(auth: AuthContext, id: string, reason: string) {
    const owner = await this.prisma.owner.findFirst({ where: { id, clinicId: auth.clinicId } });
    if (!owner) throw new NotFoundException('Sahip bulunamadı');
    if (owner.archivedAt) throw new ConflictException('Sahip zaten arşivlenmiş');
    if (owner.mergedIntoOwnerId)
      throw new ConflictException('Birleştirilmiş kayıt ayrıca arşivlenemez');

    const activePatients = await this.prisma.patient.count({
      where: { ownerId: id, archivedAt: null },
    });
    if (activePatients > 0) {
      throw new ConflictException(
        `Sahibin ${activePatients} aktif hastası var; önce hastaları arşivleyin veya başka sahibe taşıyın`,
      );
    }

    const archived = await this.prisma.owner.update({
      where: { id },
      data: { archivedAt: new Date(), archivedReason: reason },
      include: OWNER_LIST_INCLUDE,
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'owner.archive',
      entityType: 'owner',
      entityId: id,
      metadata: { reason, name: `${owner.firstName} ${owner.lastName}` },
    });
    return archived;
  }

  /** Arşivden çıkarma (yanlışlıkla arşivlenen kayıt için). */
  async unarchive(auth: AuthContext, id: string) {
    const owner = await this.prisma.owner.findFirst({ where: { id, clinicId: auth.clinicId } });
    if (!owner) throw new NotFoundException('Sahip bulunamadı');
    if (!owner.archivedAt) throw new ConflictException('Sahip arşivlenmemiş');
    if (owner.mergedIntoOwnerId)
      throw new ConflictException('Birleştirilmiş kayıt arşivden çıkarılamaz');
    const restored = await this.prisma.owner.update({
      where: { id },
      data: { archivedAt: null, archivedReason: null },
      include: OWNER_LIST_INCLUDE,
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'owner.unarchive',
      entityType: 'owner',
      entityId: id,
      metadata: { name: `${owner.firstName} ${owner.lastName}` },
    });
    return restored;
  }

  /** Açık merge: kaynak sahibin hastaları hedefe taşınır, kaynak arşivlenir.
   * Otomatik merge yoktur — kullanıcı doğrulaması ve sebep zorunludur. */
  async merge(auth: AuthContext, id: string, intoOwnerId: string, reason: string) {
    if (id === intoOwnerId) throw new BadRequestException('Kaynak ve hedef sahip aynı olamaz');
    const [source, target] = await Promise.all([
      this.prisma.owner.findFirst({
        where: { id, clinicId: auth.clinicId },
        include: { patients: true },
      }),
      this.prisma.owner.findFirst({ where: { id: intoOwnerId, clinicId: auth.clinicId } }),
    ]);
    if (!source) throw new NotFoundException('Kaynak sahip bulunamadı');
    if (!target) throw new NotFoundException('Hedef sahip bulunamadı');
    if (source.archivedAt) throw new ConflictException('Arşivlenmiş sahip birleştirilemez');
    if (target.archivedAt) throw new ConflictException('Hedef sahip arşivlenmiş olamaz');

    const merged = await this.prisma.$transaction(async (tx) => {
      await tx.patient.updateMany({ where: { ownerId: id }, data: { ownerId: intoOwnerId } });
      return tx.owner.update({
        where: { id },
        data: {
          archivedAt: new Date(),
          archivedReason: `Merge: ${reason}`,
          mergedIntoOwnerId: intoOwnerId,
        },
        include: OWNER_LIST_INCLUDE,
      });
    });

    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'owner.merge',
      entityType: 'owner',
      entityId: id,
      metadata: {
        intoOwnerId,
        reason,
        movedPatients: source.patients.length,
        sourceName: `${source.firstName} ${source.lastName}`,
        targetName: `${target.firstName} ${target.lastName}`,
      },
    });
    return merged;
  }

  /** Yetkisiz şube kontrolü — hasta kayıtları şube kapsamlıdır; sahipler klinik kapsamlı.
   * Bu yardımcı, hasta servislerinin sahip erişimini doğrulaması için ortak kuralı taşır. */
  assertClinicScope(clinicId: string, ownerClinicId: string): void {
    if (clinicId !== ownerClinicId) throw new ForbiddenException('Bu kayda erişim yetkiniz yok');
  }
}
