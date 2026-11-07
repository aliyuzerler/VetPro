import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { normalizeMicrochip } from '../common/normalize';
import { findPatientDuplicates } from '../common/duplicates';
import type { AuthContext } from '../common/auth/auth-context';
import type {
  ArchivePatientDto,
  CreateAlertDto,
  CreatePatientDto,
  CreateWeightDto,
  MergePatientDto,
  UpdatePatientDto,
} from './patients.dto';

const PATIENT_LIST_INCLUDE = {
  species: { select: { id: true, name: true } },
  breed: { select: { id: true, name: true } },
  owner: { select: { id: true, firstName: true, lastName: true } },
  alerts: { where: { active: true } },
  _count: { select: { files: true } },
} satisfies Prisma.PatientInclude;

const PATIENT_DETAIL_INCLUDE = {
  ...PATIENT_LIST_INCLUDE,
  branch: { select: { id: true, name: true, code: true } },
  mergedIntoPatient: { select: { id: true, name: true, code: true } },
  weights: { orderBy: { measuredAt: 'desc' }, take: 50 },
  // Detayda TÜM uyarılar döner (çözülenler "Yeniden aç" ile geri gelir);
  // listede yalnız aktif uyarı rozetleri gösterilir.
  alerts: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.PatientInclude;

export type PatientWithRelations = Prisma.PatientGetPayload<{
  include: typeof PATIENT_LIST_INCLUDE;
}>;
export type PatientDetail = Prisma.PatientGetPayload<{ include: typeof PATIENT_DETAIL_INCLUDE }>;

/** Zaman çizelgesi olay tipleri — Faz 06 muayene olayları bu iskelete eklenecek. */
export type TimelineEvent = {
  id: string;
  type:
    | 'weight'
    | 'alert'
    | 'alert-resolved'
    | 'file'
    | 'created'
    | 'archived'
    | 'merge'
    | 'patient.update';
  title: string;
  description?: string | null;
  at: string;
  byStaff?: string | null;
};

/**
 * Hasta (hayvan) yönetimi — ŞUBE KAPSAMLI (kabul kriteri): kayıt şubesine erişimi
 * olmayan personel listelerde görmez, doğrudan erişimde 403 alır. Silme yok:
 * arşiv + açık merge. Arama: ad, hasta kodu, mikroçip (normalize), sahip adı/telefonu.
 */
@Injectable()
export class PatientsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Şube filtresi: istek şubesi belirtilmişse o şube; allBranches ise klinik geneli;
   * değilse personelin erişilebilir şubeleri. */
  private branchFilter(auth: AuthContext, branchId: string | undefined) {
    if (branchId) return { branchId };
    if (auth.allBranches) return {};
    return { branchId: { in: auth.branchIds } };
  }

  /** Kayda erişim yetkisi: şube kapsam kontrolü (detay/alt kaynaklar için). */
  private async assertPatientAccess(
    auth: AuthContext,
    patient: { branchId: string; clinicId: string },
  ) {
    if (patient.clinicId !== auth.clinicId) throw new NotFoundException('Hasta bulunamadı');
    if (!auth.allBranches && !auth.branchIds.includes(patient.branchId)) {
      throw new ForbiddenException('Bu şube için yetkiniz yok');
    }
  }

  private async getPatientOr404(clinicId: string, id: string): Promise<PatientDetail> {
    const patient = await this.prisma.patient.findFirst({
      where: { id, clinicId },
      include: PATIENT_DETAIL_INCLUDE,
    });
    if (!patient) throw new NotFoundException('Hasta bulunamadı');
    return patient;
  }

  /** Hasta listesi — serbest arama: ad, kod, mikroçip, sahip adı, sahip telefonu (normalize). */
  async list(
    auth: AuthContext,
    query: {
      search?: string;
      branchId?: string;
      speciesId?: string;
      includeArchived?: boolean;
      take?: number;
    },
  ) {
    const search = query.search?.trim() ?? '';
    const lower = search.toLocaleLowerCase('tr-TR');
    const digits = search.replace(/\D/g, '');
    const microchip = normalizeMicrochip(search);
    const words = lower.split(/\s+/).filter((word) => word.length >= 2);

    const where: Prisma.PatientWhereInput = {
      clinicId: auth.clinicId,
      ...this.branchFilter(auth, query.branchId),
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.speciesId ? { speciesId: query.speciesId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: lower, mode: 'insensitive' } },
              { code: { contains: search.toUpperCase(), mode: 'insensitive' } },
              ...(microchip.length >= 9 ? [{ microchip: microchip }] : []),
              // Sahip ad-soyad: her kelime ad VEYA soyadda geçebilir (sıra bağımsız).
              ...(words.length > 0
                ? [
                    {
                      AND: words.map((word) => ({
                        OR: [
                          {
                            owner: { firstName: { contains: word, mode: 'insensitive' as const } },
                          },
                          { owner: { lastName: { contains: word, mode: 'insensitive' as const } } },
                        ],
                      })),
                    },
                  ]
                : []),
              ...(digits.length >= 7
                ? [
                    {
                      owner: {
                        contacts: { some: { kind: 'phone', normalized: { contains: digits } } },
                      },
                    },
                  ]
                : []),
            ],
          }
        : {}),
    };

    return this.prisma.patient.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(query.take ?? 50, 1), 100),
      include: PATIENT_LIST_INCLUDE,
    });
  }

  async findOne(auth: AuthContext, id: string) {
    const patient = await this.getPatientOr404(auth.clinicId, id);
    await this.assertPatientAccess(auth, patient);
    return patient;
  }

  /** Mükerrer hasta kontrolü — mikroçip veya aynı sahipte aynı ad (uyarı amaçlı). */
  async duplicates(
    auth: AuthContext,
    input: {
      ownerId?: string;
      name?: string;
      microchip?: string;
      speciesId?: string;
      branchId?: string;
    },
  ) {
    if (!input.microchip && !(input.ownerId && input.name)) {
      throw new BadRequestException('Mikroçip veya sahip+ad gerekli');
    }
    const patients = await this.prisma.patient.findMany({
      where: {
        clinicId: auth.clinicId,
        archivedAt: null,
        ...this.branchFilter(auth, input.branchId),
      },
      select: { id: true, name: true, ownerId: true, microchip: true, speciesId: true },
      take: 500,
    });
    return findPatientDuplicates(input, patients);
  }

  /** Sıradaki insan-okur hasta kodu: HP-0001, HP-0002... Klinik içinde tekil. */
  private async nextPatientCode(clinicId: string): Promise<string> {
    // Idempotent ve yarış-dirençli: klinik içindeki en büyük kodu al, +1.
    const last = await this.prisma.patient.findFirst({
      where: { clinicId, code: { startsWith: 'HP-' } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const lastSeq = last ? Number.parseInt(last.code.slice(3), 10) : 0;
    if (Number.isNaN(lastSeq)) throw new BadRequestException('Hasta kod serisi bozuk');
    return `HP-${String(lastSeq + 1).padStart(4, '0')}`;
  }

  /** Sahip altında yeni hasta — çoklu hasta ilişkilendirme (kabul kriteri). */
  async createForOwner(
    auth: AuthContext,
    ownerId: string,
    dto: CreatePatientDto,
    branchId?: string,
  ) {
    const owner = await this.prisma.owner.findFirst({
      where: { id: ownerId, clinicId: auth.clinicId, archivedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!owner) throw new NotFoundException('Sahip bulunamadı');

    // Şube kapsamı: aktif şube veya DTO'daki şube; personel erişimine tabi.
    let resolvedBranchId =
      branchId ??
      auth.activeBranchId ??
      (auth.branchIds.length === 1 ? auth.branchIds[0] : undefined);
    if (!resolvedBranchId)
      throw new BadRequestException('Şube belirtilmeli (X-Branch-Id veya branchId)');
    if (!auth.allBranches && !auth.branchIds.includes(resolvedBranchId)) {
      throw new ForbiddenException('Bu şube için yetkiniz yok');
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: resolvedBranchId, clinicId: auth.clinicId },
      select: { id: true },
    });
    if (!branch) throw new BadRequestException('Şube bu kliniğe ait değil');

    // Tür doğrulaması
    const species = await this.prisma.species.findFirst({
      where: { id: dto.speciesId, active: true },
      select: { id: true, name: true },
    });
    if (!species) throw new BadRequestException('Tür bulunamadı');
    if (dto.breedId) {
      const breed = await this.prisma.breed.findFirst({
        where: { id: dto.breedId, speciesId: dto.speciesId, active: true },
        select: { id: true },
      });
      if (!breed) throw new BadRequestException('Irk bu türe ait değil');
    }

    const microchip = dto.microchip ? normalizeMicrochip(dto.microchip) : null;
    if (microchip) {
      const existing = await this.prisma.patient.findFirst({
        where: { clinicId: auth.clinicId, microchip },
        select: { id: true, code: true, name: true },
      });
      if (existing) {
        throw new ConflictException(
          `Bu mikroçip zaten kayıtlı: ${existing.name} (${existing.code})`,
        );
      }
    }

    const patient = await this.prisma.$transaction(async (tx) => {
      const code = await this.nextPatientCode(auth.clinicId);
      const created = await tx.patient.create({
        data: {
          clinicId: auth.clinicId,
          branchId: resolvedBranchId!,
          ownerId,
          speciesId: dto.speciesId,
          breedId: dto.breedId ?? null,
          code,
          name: dto.name.trim(),
          microchip,
          gender: dto.gender ?? 'unknown',
          birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
          neutered: dto.neutered ?? false,
          color: dto.color ?? null,
          alerts: dto.alerts?.length
            ? {
                create: dto.alerts.map((alert) => ({
                  kind: alert.kind,
                  label: alert.label.trim(),
                  severity: alert.severity ?? 'medium',
                  createdByStaffId: auth.staffId,
                })),
              }
            : undefined,
          weights: dto.initialWeightKg
            ? {
                create: {
                  weightKg: dto.initialWeightKg,
                  measuredAt: new Date(),
                  createdByStaffId: auth.staffId,
                },
              }
            : undefined,
        },
        include: PATIENT_LIST_INCLUDE,
      });
      return created;
    });

    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: resolvedBranchId,
      action: 'patient.create',
      entityType: 'patient',
      entityId: patient.id,
      metadata: {
        code: patient.code,
        name: patient.name,
        owner: `${owner.firstName} ${owner.lastName}`,
        microchip,
        initialAlerts: dto.alerts?.length ?? 0,
      },
    });
    return patient;
  }

  async update(auth: AuthContext, id: string, dto: UpdatePatientDto) {
    const before = await this.getPatientOr404(auth.clinicId, id);
    await this.assertPatientAccess(auth, before);
    if (before.archivedAt) throw new ConflictException('Arşivlenmiş hasta düzenlenemez');

    let microchip: string | null | undefined;
    if (dto.microchip !== undefined) {
      microchip = dto.microchip ? normalizeMicrochip(dto.microchip) : null;
      if (microchip) {
        const existing = await this.prisma.patient.findFirst({
          where: { clinicId: auth.clinicId, microchip, id: { not: id } },
          select: { code: true, name: true },
        });
        if (existing) {
          throw new ConflictException(
            `Bu mikroçip zaten kayıtlı: ${existing.name} (${existing.code})`,
          );
        }
      }
    }

    const patient = await this.prisma.patient.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.breedId !== undefined ? { breedId: dto.breedId } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.birthDate !== undefined
          ? { birthDate: dto.birthDate ? new Date(dto.birthDate) : null }
          : {}),
        ...(microchip !== undefined ? { microchip } : {}),
        ...(dto.neutered !== undefined ? { neutered: dto.neutered } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.bloodType !== undefined ? { bloodType: dto.bloodType } : {}),
      },
      include: PATIENT_LIST_INCLUDE,
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: before.branchId,
      action: 'patient.update',
      entityType: 'patient',
      entityId: id,
      metadata: {
        code: before.code,
        before: { name: before.name, microchip: before.microchip, gender: before.gender },
        after: { name: patient.name, microchip: patient.microchip, gender: patient.gender },
      },
    });
    return patient;
  }

  /** Arşivleme — silme yerine (kabul kriteri); reason zorunlu. */
  async archive(auth: AuthContext, id: string, reason: string) {
    const patient = await this.getPatientOr404(auth.clinicId, id);
    await this.assertPatientAccess(auth, patient);
    if (patient.archivedAt) throw new ConflictException('Hasta zaten arşivlenmiş');
    const archived = await this.prisma.patient.update({
      where: { id },
      data: { archivedAt: new Date(), archivedReason: reason },
      include: PATIENT_LIST_INCLUDE,
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: patient.branchId,
      action: 'patient.archive',
      entityType: 'patient',
      entityId: id,
      metadata: { code: patient.code, name: patient.name, reason },
    });
    return archived;
  }

  async unarchive(auth: AuthContext, id: string) {
    const patient = await this.getPatientOr404(auth.clinicId, id);
    await this.assertPatientAccess(auth, patient);
    if (!patient.archivedAt) throw new ConflictException('Hasta arşivlenmemiş');
    if (patient.mergedIntoPatientId)
      throw new ConflictException('Birleştirilmiş kayıt arşivden çıkarılamaz');
    const restored = await this.prisma.patient.update({
      where: { id },
      data: { archivedAt: null, archivedReason: null },
      include: PATIENT_LIST_INCLUDE,
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: patient.branchId,
      action: 'patient.unarchive',
      entityType: 'patient',
      entityId: id,
      metadata: { code: patient.code, name: patient.name },
    });
    return restored;
  }

  /** Açık hasta merge: uyarılar/kilolar/dosyalar hedefe taşınır, kaynak arşivlenir. */
  async merge(auth: AuthContext, id: string, intoPatientId: string, reason: string) {
    if (id === intoPatientId) throw new BadRequestException('Kaynak ve hedef hasta aynı olamaz');
    const [source, target] = await Promise.all([
      this.getPatientOr404(auth.clinicId, id),
      this.getPatientOr404(auth.clinicId, intoPatientId),
    ]);
    await this.assertPatientAccess(auth, source);
    await this.assertPatientAccess(auth, target);
    if (source.archivedAt) throw new ConflictException('Arşivlenmiş hasta birleştirilemez');
    if (target.archivedAt) throw new ConflictException('Hedef hasta arşivlenmiş olamaz');

    const merged = await this.prisma.$transaction(async (tx) => {
      await tx.patientAlert.updateMany({
        where: { patientId: id },
        data: { patientId: intoPatientId },
      });
      await tx.weightObservation.updateMany({
        where: { patientId: id },
        data: { patientId: intoPatientId },
      });
      await tx.fileAsset.updateMany({
        where: { patientId: id },
        data: { patientId: intoPatientId },
      });
      return tx.patient.update({
        where: { id },
        data: {
          archivedAt: new Date(),
          archivedReason: `Merge: ${reason}`,
          mergedIntoPatientId: intoPatientId,
        },
        include: PATIENT_LIST_INCLUDE,
      });
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: source.branchId,
      action: 'patient.merge',
      entityType: 'patient',
      entityId: id,
      metadata: {
        intoPatientId,
        reason,
        source: { code: source.code, name: source.name },
        target: { code: target.code, name: target.name },
      },
    });
    return merged;
  }

  // ---- Uyarılar (alerji/kronik) -------------------------------------------------

  async createAlert(auth: AuthContext, patientId: string, dto: CreateAlertDto) {
    const patient = await this.getPatientOr404(auth.clinicId, patientId);
    await this.assertPatientAccess(auth, patient);
    if (patient.archivedAt) throw new ConflictException('Arşivlenmiş hastaya uyarı eklenemez');
    const alert = await this.prisma.patientAlert.create({
      data: {
        patientId,
        kind: dto.kind,
        label: dto.label.trim(),
        severity: dto.severity ?? 'medium',
        createdByStaffId: auth.staffId,
      },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: patient.branchId,
      action: 'patient.alert.create',
      entityType: 'patient',
      entityId: patientId,
      metadata: {
        code: patient.code,
        kind: alert.kind,
        label: alert.label,
        severity: alert.severity,
      },
    });
    return alert;
  }

  /** Uyarıyı çöz (active=false) veya yeniden aç. */
  async resolveAlert(auth: AuthContext, patientId: string, alertId: string, active: boolean) {
    const patient = await this.getPatientOr404(auth.clinicId, patientId);
    await this.assertPatientAccess(auth, patient);
    const alert = await this.prisma.patientAlert.findFirst({
      where: { id: alertId, patientId },
    });
    if (!alert) throw new NotFoundException('Uyarı bulunamadı');
    const updated = await this.prisma.patientAlert.update({
      where: { id: alertId },
      data: { active, resolvedAt: active ? null : new Date() },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: patient.branchId,
      action: active ? 'patient.alert.reopen' : 'patient.alert.resolve',
      entityType: 'patient',
      entityId: patientId,
      metadata: { code: patient.code, label: alert.label },
    });
    return updated;
  }

  // ---- Kilo gözlemleri ------------------------------------------------------------

  async createWeight(auth: AuthContext, patientId: string, dto: CreateWeightDto) {
    const patient = await this.getPatientOr404(auth.clinicId, patientId);
    await this.assertPatientAccess(auth, patient);
    if (patient.archivedAt) throw new ConflictException('Arşivlenmiş hastaya kilo eklenemez');
    const weight = await this.prisma.weightObservation.create({
      data: {
        patientId,
        weightKg: dto.weightKg,
        measuredAt: dto.measuredAt ? new Date(dto.measuredAt) : new Date(),
        note: dto.note ?? null,
        createdByStaffId: auth.staffId,
      },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: patient.branchId,
      action: 'patient.weight.create',
      entityType: 'patient',
      entityId: patientId,
      metadata: { code: patient.code, weightKg: dto.weightKg },
    });
    return weight;
  }

  // ---- Zaman çizelgesi (iskelet) ---------------------------------------------------

  /** Hasta zaman çizelgesi — Faz 04 iskeleti: kilo, uyarı, dosya ve denetim olayları.
   * Faz 06'da muayene/SOAP olayları aynı tiplere eklenecek. */
  async timeline(auth: AuthContext, patientId: string): Promise<TimelineEvent[]> {
    const patient = await this.getPatientOr404(auth.clinicId, patientId);
    await this.assertPatientAccess(auth, patient);

    const [weights, alerts, files, auditEvents] = await Promise.all([
      this.prisma.weightObservation.findMany({
        where: { patientId },
        orderBy: { measuredAt: 'desc' },
        take: 20,
      }),
      this.prisma.patientAlert.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.fileAsset.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.auditEvent.findMany({
        where: { clinicId: auth.clinicId, entityType: 'patient', entityId: patientId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    const events: TimelineEvent[] = [
      ...weights.map((w) => ({
        id: `weight-${w.id}`,
        type: 'weight' as const,
        title: `Kilo kaydı: ${Number(w.weightKg)} kg`,
        description: w.note,
        at: w.measuredAt.toISOString(),
        byStaff: w.createdByStaffId,
      })),
      ...alerts.map((a) => ({
        id: `alert-${a.id}`,
        type: a.active ? ('alert' as const) : ('alert-resolved' as const),
        title: a.active ? `Uyarı eklendi: ${a.label}` : `Uyarı çözüldü: ${a.label}`,
        description: `${a.kind} · ${a.severity}`,
        at: (a.resolvedAt ?? a.createdAt).toISOString(),
        byStaff: a.createdByStaffId,
      })),
      ...files.map((f) => ({
        id: `file-${f.id}`,
        type: 'file' as const,
        title: `Dosya yüklendi: ${f.fileName}`,
        description: `${(f.sizeBytes / 1024).toFixed(1)} KB · ${f.mimeType}`,
        at: f.createdAt.toISOString(),
        byStaff: f.uploadedByStaffId,
      })),
      ...auditEvents
        .filter((e) => e.action.startsWith('patient.') && e.action !== 'patient.weight.create')
        .map((e) => ({
          id: `audit-${e.id}`,
          type: e.action as TimelineEvent['type'],
          title: PATIENT_ACTION_TITLES[e.action] ?? e.action,
          description: null,
          at: e.createdAt.toISOString(),
          byStaff: e.staffId,
        })),
    ];
    events.sort((a, b) => b.at.localeCompare(a.at));
    return events;
  }
}

const PATIENT_ACTION_TITLES: Record<string, string> = {
  'patient.create': 'Hasta kaydı oluşturuldu',
  'patient.update': 'Hasta bilgileri güncellendi',
  'patient.archive': 'Hasta arşivlendi',
  'patient.unarchive': 'Hasta arşivden çıkarıldı',
  'patient.merge': 'Hasta birleştirildi',
  'patient.alert.create': 'Hasta uyarısı eklendi',
  'patient.alert.resolve': 'Hasta uyarısı çözüldü',
  'patient.alert.reopen': 'Hasta uyarısı yeniden açıldı',
};
