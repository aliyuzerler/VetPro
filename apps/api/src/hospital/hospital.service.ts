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
import { StockService } from '../inventory/stock.service';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import {
  findKennelConflict,
  isActiveStayStatus,
  validateObservation,
} from './hospital.domain';
import type {
  AdmitStayDto,
  AdministerMedicationDto,
  CreateKennelDto,
  CreateObservationDto,
  DischargeStayDto,
  ListStaysQueryDto,
  TransferStayDto,
  UpdateKennelDto,
} from './hospital.dto';

export const HOSPITAL_ERROR_CODES = {
  KENNEL_NOT_FOUND: 'KENNEL_NOT_FOUND',
  KENNEL_INACTIVE: 'KENNEL_INACTIVE',
  KENNEL_CONFLICT: 'KENNEL_CONFLICT',
  STAY_NOT_FOUND: 'HOSPITAL_STAY_NOT_FOUND',
  STAY_NOT_ACTIVE: 'HOSPITAL_STAY_NOT_ACTIVE',
  PATIENT_NOT_FOUND: 'HOSPITAL_PATIENT_NOT_FOUND',
  OWNER_NOT_FOUND: 'HOSPITAL_OWNER_NOT_FOUND',
  VET_NOT_FOUND: 'HOSPITAL_VETERINARIAN_NOT_FOUND',
  ENCOUNTER_NOT_FOUND: 'HOSPITAL_ENCOUNTER_NOT_FOUND',
  OBSERVATION_INVALID: 'HOSPITAL_OBSERVATION_INVALID',
  PRODUCT_NOT_FOUND: 'HOSPITAL_PRODUCT_NOT_FOUND',
  WAREHOUSE_NOT_FOUND: 'HOSPITAL_WAREHOUSE_NOT_FOUND',
  CONSUMPTION_FORBIDDEN: 'HOSPITAL_CONSUMPTION_FORBIDDEN',
  BRANCH_SCOPE: 'BRANCH_SCOPE',
} as const;

const STAY_INCLUDE = {
  patient: { select: { id: true, name: true, code: true } },
  owner: { select: { id: true, firstName: true, lastName: true } },
  veterinarian: { select: { id: true, firstName: true, lastName: true } },
  kennel: { select: { id: true, code: true, name: true, size: true } },
  encounter: { select: { id: true, status: true, startedAt: true } },
} satisfies Prisma.HospitalStayInclude;

/**
 * Yatış servisi — Faz 11.
 *
 * Kurallar:
 * - Kabul/transfer öncesi hedef kennelde aktif yatış çakışması kontrol edilir;
 *   çakışma 409 KENNEL_CONFLICT döner (kabul kriteri).
 * - Günlük tedavi sarfı (MedicationAdministration) stoğu Faz 08 ortak
 *   transaction servisi StockService.postConsumptionForRef ile düşer
 *   (refType=HospitalMedication) — modül kendi stok mantığını YAZMAZ.
 *   Stok düşümlü yazım ek olarak inventory.consume izni ister.
 * - Taburculuk özet zorunlu; taburculuk pencereyi kapatır (kennel boşalır).
 */
@Injectable()
export class HospitalService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StockService) private readonly stock: StockService,
  ) {}

  private async recordAudit(input: {
    clinicId: string;
    staffId?: string | null;
    branchId?: string | null;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.audit.record(input, this.prisma);
  }

  private requireBranchAccess(auth: AuthContext, request: AuthRequest, branchId: string): void {
    if (request.branchId) {
      if (request.branchId !== branchId) {
        throw new ForbiddenException({
          code: HOSPITAL_ERROR_CODES.BRANCH_SCOPE,
          message: 'Şube kapsamı dışı istek',
        });
      }
      return;
    }
    if (auth.allBranches) return;
    if (!auth.branchIds.includes(branchId)) {
      throw new ForbiddenException({
        code: HOSPITAL_ERROR_CODES.BRANCH_SCOPE,
        message: 'Şube erişiminiz yok',
      });
    }
  }

  private toNumber(value: Prisma.Decimal | number | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    return typeof value === 'number' ? value : value.toNumber();
  }

  // ------------------------------------------------------------------ kennel

  async listKennels(auth: AuthContext, request: AuthRequest) {
    const branchFilter = request.branchId
      ? { branchId: request.branchId }
      : { branchId: auth.allBranches ? {} : { in: auth.branchIds } };
    const kennels = await this.prisma.kennel.findMany({
      where: { clinicId: auth.clinicId, ...branchFilter },
      include: {
        stays: { where: { status: { in: ['admitted', 'transferred'] } } },
      },
      orderBy: [{ branchId: 'asc' }, { code: 'asc' }],
    });
    return {
      items: kennels.map((kennel) => ({
        id: kennel.id,
        branchId: kennel.branchId,
        code: kennel.code,
        name: kennel.name,
        size: kennel.size,
        active: kennel.active,
        notes: kennel.notes,
        occupancy: kennel.stays.map((stay) => ({
          stayId: stay.id,
          patientName: null,
          admittedAt: stay.admittedAt.toISOString(),
        })),
      })),
    };
  }

  async createKennel(auth: AuthContext, dto: CreateKennelDto, request: AuthRequest) {
    if (!request.branchId) {
      throw new BadRequestException({
        code: 'BRANCH_REQUIRED',
        message: 'Aktif şube seçili olmalı',
      });
    }
    const exists = await this.prisma.kennel.findUnique({
      where: { branchId_code: { branchId: request.branchId, code: dto.code } },
    });
    if (exists) {
      throw new ConflictException({
        code: 'KENNEL_CONFLICT',
        message: `Kennel kodu ${dto.code} bu şubede zaten kayıtlı`,
      });
    }
    const kennel = await this.prisma.kennel.create({
      data: {
        clinicId: auth.clinicId,
        branchId: request.branchId,
        code: dto.code,
        name: dto.name,
        size: dto.size ?? 'medium',
        notes: dto.notes ?? null,
      },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: request.branchId,
      action: 'KENNEL_CREATED',
      entityType: 'Kennel',
      entityId: kennel.id,
    });
    return { id: kennel.id, code: kennel.code };
  }

  async updateKennel(
    auth: AuthContext,
    kennelId: string,
    dto: UpdateKennelDto,
    request: AuthRequest,
  ) {
    const kennel = await this.prisma.kennel.findFirst({
      where: { id: kennelId, clinicId: auth.clinicId },
    });
    if (!kennel) {
      throw new NotFoundException({
        code: HOSPITAL_ERROR_CODES.KENNEL_NOT_FOUND,
        message: 'Kennel bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, kennel.branchId);
    const activeStays = await this.prisma.hospitalStay.count({
      where: { kennelId: kennel.id, status: { in: ['admitted', 'transferred'] } },
    });
    if (dto.active === false && activeStays > 0) {
      throw new ConflictException({
        code: 'KENNEL_OCCUPIED',
        message: 'İçinde aktif yatış bulunan kennel pasifleştirilemez',
      });
    }
    await this.prisma.kennel.update({
      where: { id: kennel.id },
      data: {
        name: dto.name ?? undefined,
        size: dto.size ?? undefined,
        notes: dto.notes ?? undefined,
        active: dto.active ?? undefined,
      },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: kennel.branchId,
      action: 'KENNEL_UPDATED',
      entityType: 'Kennel',
      entityId: kennel.id,
    });
    return { id: kennel.id, active: dto.active ?? kennel.active };
  }

  // -------------------------------------------------------------------- yatış

  /** Yatış panosu: aktif yatışlar + kennel doluluk özeti. */
  async panel(auth: AuthContext, request: AuthRequest) {
    const branchFilter = request.branchId
      ? { branchId: request.branchId }
      : { branchId: { in: auth.allBranches ? undefined : auth.branchIds } };
    const [stays, kennels] = await Promise.all([
      this.prisma.hospitalStay.findMany({
        where: {
          clinicId: auth.clinicId,
          status: { in: ['admitted', 'transferred'] },
          ...branchFilter,
        },
        include: {
          patient: { select: { id: true, name: true, code: true } },
          owner: { select: { id: true, firstName: true, lastName: true } },
          veterinarian: { select: { id: true, firstName: true, lastName: true } },
          kennel: { select: { id: true, code: true, name: true, size: true } },
          encounter: { select: { id: true, status: true, startedAt: true } },
          observations: { orderBy: { observedAt: 'desc' }, take: 1 },
          medications: { orderBy: { administeredAt: 'desc' }, take: 1 },
        },
        orderBy: { admittedAt: 'desc' },
        take: 100,
      }),
      this.prisma.kennel.count({
        where: { clinicId: auth.clinicId, active: true, ...branchFilter },
      }),
    ]);
    const patientIds = stays.map((s) => s.patientId);
    const patients = patientIds.length
      ? await this.prisma.patient.findMany({
          where: { id: { in: patientIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
    const patientById = new Map(patients.map((p) => [p.id, p]));
    return {
      totalActiveKennels: kennels,
      occupiedKennels: stays.length,
      items: stays.map((stay) => ({
        ...this.serializeStay(stay),
        lastObservation: stay.observations[0]
          ? {
              kind: stay.observations[0].kind,
              tempC: this.toNumber(stay.observations[0].tempC),
              heartRate: stay.observations[0].heartRate,
              observedAt: stay.observations[0].observedAt.toISOString(),
            }
          : null,
        lastMedication: stay.medications[0]
          ? {
              productId: stay.medications[0].productId,
              qty: this.toNumber(stay.medications[0].qty),
              administeredAt: stay.medications[0].administeredAt.toISOString(),
            }
          : null,
        patientName: patientById.get(stay.patientId)?.name ?? null,
      })),
    };
  }

  async listStays(auth: AuthContext, query: ListStaysQueryDto, request: AuthRequest) {
    const branchFilter = request.branchId
      ? { branchId: request.branchId }
      : { branchId: { in: auth.allBranches ? undefined : auth.branchIds } };
    const statusFilter =
      query.window === 'active'
        ? { status: { in: ['admitted', 'transferred'] } }
        : query.window && query.window !== 'active'
          ? { status: query.window }
          : {};
    const stays = await this.prisma.hospitalStay.findMany({
      where: {
        clinicId: auth.clinicId,
        ...branchFilter,
        ...statusFilter,
        ...(query.patientId ? { patientId: query.patientId } : {}),
      },
      include: STAY_INCLUDE,
      orderBy: { admittedAt: 'desc' },
      take: query.take ?? 50,
    });
    return { items: stays.map((stay) => this.serializeStay(stay)) };
  }

  async getStay(auth: AuthContext, stayId: string, request: AuthRequest) {
    const stay = await this.prisma.hospitalStay.findFirst({
      where: { id: stayId, clinicId: auth.clinicId },
      include: {
        patient: { select: { id: true, name: true, code: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
        veterinarian: { select: { id: true, firstName: true, lastName: true } },
        kennel: { select: { id: true, code: true, name: true, size: true } },
        encounter: { select: { id: true, status: true, startedAt: true } },
        observations: {
          orderBy: { observedAt: 'desc' },
          include: { observedBy: { select: { firstName: true, lastName: true } } },
        },
        medications: {
          orderBy: { administeredAt: 'desc' },
          include: {
            product: { select: { code: true, name: true, baseUnit: { select: { key: true, name: true } } } },
            administeredBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!stay) {
      throw new NotFoundException({
        code: HOSPITAL_ERROR_CODES.STAY_NOT_FOUND,
        message: 'Yatış kaydı bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, stay.branchId);
    return {
      ...this.serializeStay(stay),
      observations: stay.observations.map((o) => ({
        id: o.id,
        kind: o.kind,
        tempC: this.toNumber(o.tempC),
        weightKg: this.toNumber(o.weightKg),
        heartRate: o.heartRate,
        respRate: o.respRate,
        appetite: o.appetite,
        behavior: o.behavior,
        notes: o.notes,
        observedAt: o.observedAt.toISOString(),
        observedBy: `${o.observedBy.firstName} ${o.observedBy.lastName}`,
      })),
      medications: stay.medications.map((m) => ({
        id: m.id,
        product: m.product,
        qty: this.toNumber(m.qty),
        dose: m.dose,
        route: m.route,
        notes: m.notes,
        hasStockMovement: m.stockMovementId !== null,
        administeredAt: m.administeredAt.toISOString(),
        administeredBy: `${m.administeredBy.firstName} ${m.administeredBy.lastName}`,
      })),
    };
  }

  /** Yatış kabulü — hedef kennel aktif ve çakışmasız olmalı. */
  async admit(auth: AuthContext, dto: AdmitStayDto, request: AuthRequest) {
    if (!request.branchId) {
      throw new BadRequestException({
        code: 'BRANCH_REQUIRED',
        message: 'Aktif şube seçili olmalı',
      });
    }
    const kennel = await this.prisma.kennel.findFirst({
      where: { id: dto.kennelId, clinicId: auth.clinicId },
    });
    if (!kennel) {
      throw new NotFoundException({
        code: HOSPITAL_ERROR_CODES.KENNEL_NOT_FOUND,
        message: 'Kennel bulunamadı',
      });
    }
    if (kennel.branchId !== request.branchId) {
      throw new ForbiddenException({
        code: HOSPITAL_ERROR_CODES.BRANCH_SCOPE,
        message: 'Kennel başka şubede',
      });
    }
    if (!kennel.active) {
      throw new ConflictException({
        code: HOSPITAL_ERROR_CODES.KENNEL_INACTIVE,
        message: 'Kennel pasif durumda',
      });
    }
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId: auth.clinicId, archivedAt: null },
    });
    if (!patient) {
      throw new NotFoundException({
        code: HOSPITAL_ERROR_CODES.PATIENT_NOT_FOUND,
        message: 'Hasta bulunamadı',
      });
    }
    if (patient.ownerId !== dto.ownerId) {
      throw new BadRequestException({
        code: HOSPITAL_ERROR_CODES.OWNER_NOT_FOUND,
        message: 'Sahip, hastanın kayıtlı sahibiyle uyuşmuyor',
      });
    }
    const vet = await this.prisma.staff.findFirst({
      where: { id: dto.veterinarianId, clinicId: auth.clinicId, active: true },
    });
    if (!vet) {
      throw new NotFoundException({
        code: HOSPITAL_ERROR_CODES.VET_NOT_FOUND,
        message: 'Veteriner bulunamadı',
      });
    }
    if (dto.encounterId) {
      const encounter = await this.prisma.encounter.findFirst({
        where: { id: dto.encounterId, clinicId: auth.clinicId },
      });
      if (!encounter) {
        throw new NotFoundException({
          code: HOSPITAL_ERROR_CODES.ENCOUNTER_NOT_FOUND,
          message: 'Muayene kaydı bulunamadı',
        });
      }
    }
    const admittedAt = dto.admittedAt ? new Date(dto.admittedAt) : new Date();
    // Kabul kriteri: kennel çakışması kontrol edilmeli
    const activeStays = await this.prisma.hospitalStay.findMany({
      where: { clinicId: auth.clinicId, status: { in: ['admitted', 'transferred'] } },
      select: { id: true, kennelId: true, admittedAt: true, dischargedAt: true },
    });
    const conflict = findKennelConflict({ kennelId: kennel.id, admittedAt, dischargedAt: null }, activeStays);
    if (conflict) {
      throw new ConflictException({
        code: HOSPITAL_ERROR_CODES.KENNEL_CONFLICT,
        message: `Kennel ${kennel.code} bu aralıkta dolu — aktif yatış ${conflict.id} ile çakışıyor`,
      });
    }
    const stay = await this.prisma.hospitalStay.create({
      data: {
        clinicId: auth.clinicId,
        branchId: request.branchId,
        patientId: patient.id,
        ownerId: dto.ownerId,
        encounterId: dto.encounterId ?? null,
        kennelId: kennel.id,
        veterinarianId: vet.id,
        status: 'admitted',
        admissionReason: dto.admissionReason,
        admittedAt,
        expectedDischargeAt: dto.expectedDischargeAt ? new Date(dto.expectedDischargeAt) : null,
        createdById: auth.staffId,
      },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: request.branchId,
      action: 'HOSPITAL_STAY_ADMITTED',
      entityType: 'HospitalStay',
      entityId: stay.id,
      metadata: { kennelCode: kennel.code },
    });
    return this.serializeStay(
      await this.prisma.hospitalStay.findUniqueOrThrow({
        where: { id: stay.id },
        include: STAY_INCLUDE,
      }),
    );
  }

  /** Transfer — yeni kennel çakışma kontrolü yapılır; pencere başı şimdi. */
  async transfer(auth: AuthContext, stayId: string, dto: TransferStayDto, request: AuthRequest) {
    const stay = await this.prisma.hospitalStay.findFirst({
      where: { id: stayId, clinicId: auth.clinicId },
    });
    if (!stay) {
      throw new NotFoundException({
        code: HOSPITAL_ERROR_CODES.STAY_NOT_FOUND,
        message: 'Yatış kaydı bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, stay.branchId);
    if (!isActiveStayStatus(stay.status)) {
      throw new ConflictException({
        code: HOSPITAL_ERROR_CODES.STAY_NOT_ACTIVE,
        message: 'Taburcu yatış transfer edilemez',
      });
    }
    const kennel = await this.prisma.kennel.findFirst({
      where: { id: dto.kennelId, clinicId: auth.clinicId },
    });
    if (!kennel) {
      throw new NotFoundException({
        code: HOSPITAL_ERROR_CODES.KENNEL_NOT_FOUND,
        message: 'Kennel bulunamadı',
      });
    }
    if (kennel.branchId !== stay.branchId) {
      throw new ForbiddenException({
        code: HOSPITAL_ERROR_CODES.BRANCH_SCOPE,
        message: 'Kennel başka şubede',
      });
    }
    if (!kennel.active) {
      throw new ConflictException({
        code: HOSPITAL_ERROR_CODES.KENNEL_INACTIVE,
        message: 'Kennel pasif durumda',
      });
    }
    const now = new Date();
    const activeStays = await this.prisma.hospitalStay.findMany({
      where: { clinicId: auth.clinicId, status: { in: ['admitted', 'transferred'] } },
      select: { id: true, kennelId: true, admittedAt: true, dischargedAt: true },
    });
    const conflict = findKennelConflict(
      { kennelId: kennel.id, admittedAt: now, dischargedAt: null },
      activeStays,
      stay.id,
    );
    if (conflict) {
      throw new ConflictException({
        code: HOSPITAL_ERROR_CODES.KENNEL_CONFLICT,
        message: `Kennel ${kennel.code} şu an dolu — aktif yatış ${conflict.id} ile çakışıyor`,
      });
    }
    await this.prisma.hospitalStay.update({
      where: { id: stay.id },
      data: { kennelId: kennel.id, status: 'transferred', transferredAt: now },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: stay.branchId,
      action: 'HOSPITAL_STAY_TRANSFERRED',
      entityType: 'HospitalStay',
      entityId: stay.id,
      metadata: { toKennel: kennel.code },
    });
    return this.serializeStay(
      await this.prisma.hospitalStay.findUniqueOrThrow({
        where: { id: stay.id },
        include: STAY_INCLUDE,
      }),
    );
  }

  /** Taburculuk — özet zorunlu; pencere kapanır. */
  async discharge(auth: AuthContext, stayId: string, dto: DischargeStayDto, request: AuthRequest) {
    const stay = await this.prisma.hospitalStay.findFirst({
      where: { id: stayId, clinicId: auth.clinicId },
    });
    if (!stay) {
      throw new NotFoundException({
        code: HOSPITAL_ERROR_CODES.STAY_NOT_FOUND,
        message: 'Yatış kaydı bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, stay.branchId);
    if (!isActiveStayStatus(stay.status)) {
      throw new ConflictException({
        code: HOSPITAL_ERROR_CODES.STAY_NOT_ACTIVE,
        message: 'Yatış zaten taburcu',
      });
    }
    await this.prisma.hospitalStay.update({
      where: { id: stay.id },
      data: { status: 'discharged', dischargedAt: new Date(), dischargeSummary: dto.summary },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: stay.branchId,
      action: 'HOSPITAL_STAY_DISCHARGED',
      entityType: 'HospitalStay',
      entityId: stay.id,
    });
    return this.serializeStay(
      await this.prisma.hospitalStay.findUniqueOrThrow({
        where: { id: stay.id },
        include: STAY_INCLUDE,
      }),
    );
  }

  // ------------------------------------------------------------------ gözlem

  async listObservations(auth: AuthContext, stayId: string, request: AuthRequest) {
    const stay = await this.prisma.hospitalStay.findFirst({
      where: { id: stayId, clinicId: auth.clinicId },
    });
    if (!stay) {
      throw new NotFoundException({
        code: HOSPITAL_ERROR_CODES.STAY_NOT_FOUND,
        message: 'Yatış kaydı bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, stay.branchId);
    const observations = await this.prisma.hospitalObservation.findMany({
      where: { stayId: stay.id },
      include: { observedBy: { select: { firstName: true, lastName: true } } },
      orderBy: { observedAt: 'desc' },
      take: 200,
    });
    return {
      items: observations.map((o) => ({
        id: o.id,
        kind: o.kind,
        tempC: this.toNumber(o.tempC),
        weightKg: this.toNumber(o.weightKg),
        heartRate: o.heartRate,
        respRate: o.respRate,
        appetite: o.appetite,
        behavior: o.behavior,
        notes: o.notes,
        observedAt: o.observedAt.toISOString(),
        observedBy: `${o.observedBy.firstName} ${o.observedBy.lastName}`,
      })),
    };
  }

  async addObservation(
    auth: AuthContext,
    stayId: string,
    dto: CreateObservationDto,
    request: AuthRequest,
  ) {
    const stay = await this.prisma.hospitalStay.findFirst({
      where: { id: stayId, clinicId: auth.clinicId },
    });
    if (!stay) {
      throw new NotFoundException({
        code: HOSPITAL_ERROR_CODES.STAY_NOT_FOUND,
        message: 'Yatış kaydı bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, stay.branchId);
    if (!isActiveStayStatus(stay.status)) {
      throw new ConflictException({
        code: HOSPITAL_ERROR_CODES.STAY_NOT_ACTIVE,
        message: 'Taburcu yatışa gözlem yazılamaz',
      });
    }
    const kind = dto.kind ?? 'vital';
    const valid = validateObservation(kind, {
      tempC: dto.tempC ?? null,
      weightKg: dto.weightKg ?? null,
      heartRate: dto.heartRate ?? null,
      respRate: dto.respRate ?? null,
      notes: dto.notes ?? null,
    });
    if (!valid) {
      throw new BadRequestException({
        code: HOSPITAL_ERROR_CODES.OBSERVATION_INVALID,
        message: 'En az bir ölçüm veya not girilmeli',
      });
    }
    const observation = await this.prisma.hospitalObservation.create({
      data: {
        clinicId: auth.clinicId,
        stayId: stay.id,
        kind,
        tempC: dto.tempC ?? null,
        weightKg: dto.weightKg ?? null,
        heartRate: dto.heartRate ?? null,
        respRate: dto.respRate ?? null,
        appetite: dto.appetite ?? null,
        behavior: dto.behavior ?? null,
        notes: dto.notes ?? null,
        observedAt: dto.observedAt ? new Date(dto.observedAt) : new Date(),
        observedById: auth.staffId,
      },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: stay.branchId,
      action: 'HOSPITAL_OBSERVATION_ADDED',
      entityType: 'HospitalStay',
      entityId: stay.id,
      metadata: { observationId: observation.id, kind },
    });
    return { id: observation.id };
  }

  // ------------------------------------------------- tedavi sarfı (Faz 08 svc)

  /**
   * Kabul kriteri: yatış tedavi sarfı ortak service-stock transaction servisini
   * kullanmalı. Bu metot tek transaction içinde MedicationAdministration
   * kaydını açar ve stoğu StockService.postConsumptionForRef ile düşer
   * (FEFO otomatik veya açık parti; bloklu/geçmiş parti 409).
   */
  async administerMedication(
    auth: AuthContext,
    stayId: string,
    dto: AdministerMedicationDto,
    request: AuthRequest,
  ) {
    const stay = await this.prisma.hospitalStay.findFirst({
      where: { id: stayId, clinicId: auth.clinicId },
    });
    if (!stay) {
      throw new NotFoundException({
        code: HOSPITAL_ERROR_CODES.STAY_NOT_FOUND,
        message: 'Yatış kaydı bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, stay.branchId);
    if (!isActiveStayStatus(stay.status)) {
      throw new ConflictException({
        code: HOSPITAL_ERROR_CODES.STAY_NOT_ACTIVE,
        message: 'Taburcu yatışa ilaç uygulaması yazılamaz',
      });
    }
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, clinicId: auth.clinicId, active: true },
    });
    if (!product) {
      throw new NotFoundException({
        code: HOSPITAL_ERROR_CODES.PRODUCT_NOT_FOUND,
        message: 'Ürün bulunamadı',
      });
    }
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, branchId: stay.branchId, active: true },
    });
    if (!warehouse) {
      throw new NotFoundException({
        code: HOSPITAL_ERROR_CODES.WAREHOUSE_NOT_FOUND,
        message: 'Depo bu şubede bulunamadı',
      });
    }
    const administeredAt = dto.administeredAt ? new Date(dto.administeredAt) : new Date();
    // Idempotency REPLAY: aynı anahtarla daha önce sarf yazıldıysa mevcut kayıt döner
    // (Faz 08/09/10 idempotency sözleşmesiyle tutarlı).
    if (dto.idempotencyKey) {
      const existing = await this.prisma.stockMovement.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        select: { id: true, refType: true, refId: true },
      });
      if (existing && existing.refType === 'HospitalMedication' && existing.refId) {
        const raced = await this.prisma.medicationAdministration.findUnique({
          where: { id: existing.refId },
        });
        if (raced && raced.stayId === stay.id) {
          return {
            id: raced.id,
            productId: raced.productId,
            stockMovementId: raced.stockMovementId,
            administeredAt: raced.administeredAt.toISOString(),
            replay: true,
          };
        }
      }
    }
    const result = await this.prisma
      .$transaction(async (tx) => {
        const administration = await tx.medicationAdministration.create({
          data: {
            clinicId: auth.clinicId,
            branchId: stay.branchId,
            stayId: stay.id,
            patientId: stay.patientId,
            productId: product.id,
            warehouseId: warehouse.id,
            qty: dto.qty,
            lotId: dto.lotId ?? null,
            dose: dto.dose ?? null,
            route: dto.route ?? null,
            administeredAt,
            administeredById: auth.staffId,
            notes: dto.notes ?? null,
          },
        });
        // Faz 08 ortak stok transaction servisi — modül kendi stok mantığını yazmaz.
        const movement = await this.stock.postConsumptionForRef(tx, {
          clinicId: auth.clinicId,
          branchId: stay.branchId,
          warehouseId: warehouse.id,
          productId: product.id,
          qty: dto.qty,
          lotId: dto.lotId ?? null,
          refType: 'HospitalMedication',
          refId: administration.id,
          staffId: auth.staffId,
          idempotencyKey: dto.idempotencyKey ?? null,
          note: dto.notes ?? `Yatış sarfı (${stay.id.slice(0, 8)})`,
        });
        return tx.medicationAdministration.update({
          where: { id: administration.id },
          data: { stockMovementId: movement.movementId },
        });
      })
      .catch(async (error: unknown) => {
        // Eşzamanlı aynı anahtar: defter kısıtından P2002 düşer → mevcut kayıtla REPLAY
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          dto.idempotencyKey
        ) {
          const racedMovement = await this.prisma.stockMovement.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            select: { refId: true },
          });
          if (racedMovement?.refId) {
            const raced = await this.prisma.medicationAdministration.findUnique({
              where: { id: racedMovement.refId },
            });
            if (raced && raced.stayId === stay.id) {
              return {
                id: raced.id,
                productId: raced.productId,
                stockMovementId: raced.stockMovementId,
                administeredAt: raced.administeredAt,
              };
            }
          }
        }
        throw error;
      });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: stay.branchId,
      action: 'HOSPITAL_MEDICATION_ADMINISTERED',
      entityType: 'HospitalStay',
      entityId: stay.id,
      metadata: {
        administrationId: result.id,
        productId: product.id,
        qty: dto.qty,
        movementId: result.stockMovementId,
      },
    });
    return {
      id: result.id,
      productId: result.productId,
      stockMovementId: result.stockMovementId,
      administeredAt: result.administeredAt.toISOString(),
    };
  }

  async listMedications(auth: AuthContext, stayId: string, request: AuthRequest) {
    const stay = await this.prisma.hospitalStay.findFirst({
      where: { id: stayId, clinicId: auth.clinicId },
    });
    if (!stay) {
      throw new NotFoundException({
        code: HOSPITAL_ERROR_CODES.STAY_NOT_FOUND,
        message: 'Yatış kaydı bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, stay.branchId);
    const medications = await this.prisma.medicationAdministration.findMany({
      where: { stayId: stay.id },
      include: {
        product: { select: { code: true, name: true, baseUnit: { select: { key: true, name: true } } } },
        administeredBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { administeredAt: 'desc' },
      take: 200,
    });
    return {
      items: medications.map((m) => ({
        id: m.id,
        product: m.product,
        qty: this.toNumber(m.qty),
        lotId: m.lotId,
        dose: m.dose,
        route: m.route,
        notes: m.notes,
        hasStockMovement: m.stockMovementId !== null,
        administeredAt: m.administeredAt.toISOString(),
        administeredBy: `${m.administeredBy.firstName} ${m.administeredBy.lastName}`,
      })),
    };
  }

  private serializeStay(stay: Prisma.HospitalStayGetPayload<{ include: typeof STAY_INCLUDE }>) {
    return {
      id: stay.id,
      branchId: stay.branchId,
      status: stay.status,
      patient: stay.patient,
      owner: stay.owner,
      veterinarian: stay.veterinarian,
      kennel: stay.kennel,
      encounterId: stay.encounterId,
      admissionReason: stay.admissionReason,
      admittedAt: stay.admittedAt.toISOString(),
      transferredAt: stay.transferredAt?.toISOString() ?? null,
      expectedDischargeAt: stay.expectedDischargeAt?.toISOString() ?? null,
      dischargedAt: stay.dischargedAt?.toISOString() ?? null,
      dischargeSummary: stay.dischargeSummary,
    };
  }
}
