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
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import {
  allChecklistItemsDone,
  buildDefaultChecklist,
  canTransitionSurgery,
  checklistItemSummary,
  type ChecklistItem,
  type SurgeryChecklistKind,
} from './surgery.domain';
import type {
  CancelSurgeryDto,
  CreateSurgeryCaseDto,
  ListSurgeriesQueryDto,
  ToggleChecklistItemDto,
  UpdateSurgeryCaseDto,
  UpsertAnesthesiaDto,
} from './surgeries.dto';

export const SURGERY_ERROR_CODES = {
  CASE_NOT_FOUND: 'SURGERY_CASE_NOT_FOUND',
  INVALID_TRANSITION: 'SURGERY_INVALID_TRANSITION',
  CHECKLIST_INCOMPLETE: 'SURGERY_CHECKLIST_INCOMPLETE',
  PATIENT_NOT_FOUND: 'SURGERY_PATIENT_NOT_FOUND',
  OWNER_NOT_FOUND: 'SURGERY_OWNER_NOT_FOUND',
  VET_NOT_FOUND: 'SURGERY_VETERINARIAN_NOT_FOUND',
  ROOM_NOT_FOUND: 'SURGERY_ROOM_NOT_FOUND',
  ENCOUNTER_NOT_FOUND: 'SURGERY_ENCOUNTER_NOT_FOUND',
  ITEM_INDEX: 'SURGERY_CHECKLIST_ITEM_INDEX',
  BRANCH_SCOPE: 'BRANCH_SCOPE',
} as const;

const CASE_INCLUDE = {
  patient: { select: { id: true, name: true, code: true } },
  owner: { select: { id: true, firstName: true, lastName: true } },
  veterinarian: { select: { id: true, firstName: true, lastName: true } },
  room: { select: { id: true, name: true, kind: true } },
  encounter: { select: { id: true, status: true, startedAt: true } },
  anesthesia: true,
  checklists: { orderBy: { kind: 'asc' as const } },
} satisfies Prisma.SurgeryCaseInclude;

/**
 * Cerrahi servisi — Faz 11.
 *
 * Kurallar:
 * - Oluşturulan her olgu encounter/patient/vet bağlantılıdır (kabul kriteri):
 *   patient+owner+veterinarian zorunlu, encounter opsiyonel ama varsa doğrulanır.
 * - planned→prepped geçişinde varsayılan pre/post kontrol listeleri üretilir.
 * - prepped→in_surgery yalnız 'pre' listesindeki tüm maddeler işaretliyken
 *   açılır (CHECKLIST_INCOMPLETE); anestezi kaydı uyarı niteliğinde beklenir.
 * - in_surgery→recovery→completed gerçek başlangıç/bitiş zamanlarını yazar.
 */
@Injectable()
export class SurgeriesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
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
          code: SURGERY_ERROR_CODES.BRANCH_SCOPE,
          message: 'Şube kapsamı dışı istek',
        });
      }
      return;
    }
    if (auth.allBranches) return;
    if (!auth.branchIds.includes(branchId)) {
      throw new ForbiddenException({
        code: SURGERY_ERROR_CODES.BRANCH_SCOPE,
        message: 'Şube erişiminiz yok',
      });
    }
  }

  async listCases(auth: AuthContext, query: ListSurgeriesQueryDto, request: AuthRequest) {
    const branchFilter = request.branchId
      ? { branchId: request.branchId }
      : { branchId: { in: auth.allBranches ? undefined : auth.branchIds } };
    const cases = await this.prisma.surgeryCase.findMany({
      where: {
        clinicId: auth.clinicId,
        ...branchFilter,
        ...(query.status ? { status: query.status } : {}),
        ...(query.patientId ? { patientId: query.patientId } : {}),
      },
      include: CASE_INCLUDE,
      orderBy: { plannedStart: 'desc' },
      take: query.take ?? 50,
    });
    return { items: cases.map((item) => this.serializeCase(item)) };
  }

  async getCase(auth: AuthContext, caseId: string, request: AuthRequest) {
    const surgeryCase = await this.prisma.surgeryCase.findFirst({
      where: { id: caseId, clinicId: auth.clinicId },
      include: CASE_INCLUDE,
    });
    if (!surgeryCase) {
      throw new NotFoundException({
        code: SURGERY_ERROR_CODES.CASE_NOT_FOUND,
        message: 'Cerrahi olgu bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, surgeryCase.branchId);
    return this.serializeCase(surgeryCase);
  }

  async createCase(auth: AuthContext, dto: CreateSurgeryCaseDto, request: AuthRequest) {
    if (!request.branchId) {
      throw new BadRequestException({
        code: 'BRANCH_REQUIRED',
        message: 'Aktif şube seçili olmalı',
      });
    }
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId: auth.clinicId, archivedAt: null },
    });
    if (!patient) {
      throw new NotFoundException({
        code: SURGERY_ERROR_CODES.PATIENT_NOT_FOUND,
        message: 'Hasta bulunamadı',
      });
    }
    if (patient.ownerId !== dto.ownerId) {
      throw new BadRequestException({
        code: SURGERY_ERROR_CODES.OWNER_NOT_FOUND,
        message: 'Sahip, hastanın kayıtlı sahibiyle uyuşmuyor',
      });
    }
    const vet = await this.prisma.staff.findFirst({
      where: { id: dto.veterinarianId, clinicId: auth.clinicId, active: true },
    });
    if (!vet) {
      throw new NotFoundException({
        code: SURGERY_ERROR_CODES.VET_NOT_FOUND,
        message: 'Veteriner bulunamadı',
      });
    }
    if (dto.roomId) {
      const room = await this.prisma.room.findFirst({
        where: { id: dto.roomId, branchId: request.branchId, active: true },
      });
      if (!room) {
        throw new NotFoundException({
          code: SURGERY_ERROR_CODES.ROOM_NOT_FOUND,
          message: 'Operasyon odası bulunamadı',
        });
      }
    }
    if (dto.encounterId) {
      const encounter = await this.prisma.encounter.findFirst({
        where: { id: dto.encounterId, clinicId: auth.clinicId },
      });
      if (!encounter) {
        throw new NotFoundException({
          code: SURGERY_ERROR_CODES.ENCOUNTER_NOT_FOUND,
          message: 'Muayene kaydı bulunamadı',
        });
      }
    }
    const created = await this.prisma.surgeryCase.create({
      data: {
        clinicId: auth.clinicId,
        branchId: request.branchId,
        patientId: patient.id,
        ownerId: dto.ownerId,
        encounterId: dto.encounterId ?? null,
        veterinarianId: vet.id,
        roomId: dto.roomId ?? null,
        procedure: dto.procedure,
        diagnosis: dto.diagnosis ?? null,
        plannedStart: new Date(dto.plannedStart),
        plannedDurationMin: dto.plannedDurationMin ?? 60,
        notes: dto.notes ?? null,
      },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: request.branchId,
      action: 'SURGERY_CASE_CREATED',
      entityType: 'SurgeryCase',
      entityId: created.id,
      metadata: { procedure: created.procedure },
    });
    return this.serializeCase(
      await this.prisma.surgeryCase.findUniqueOrThrow({
        where: { id: created.id },
        include: CASE_INCLUDE,
      }),
    );
  }

  async updateCase(
    auth: AuthContext,
    caseId: string,
    dto: UpdateSurgeryCaseDto,
    request: AuthRequest,
  ) {
    const surgeryCase = await this.prisma.surgeryCase.findFirst({
      where: { id: caseId, clinicId: auth.clinicId },
    });
    if (!surgeryCase) {
      throw new NotFoundException({
        code: SURGERY_ERROR_CODES.CASE_NOT_FOUND,
        message: 'Cerrahi olgu bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, surgeryCase.branchId);
    if (!['planned', 'prepped'].includes(surgeryCase.status)) {
      throw new ConflictException({
        code: SURGERY_ERROR_CODES.INVALID_TRANSITION,
        message: `${surgeryCase.status} durumundaki olgu düzenlenemez`,
      });
    }
    if (dto.roomId) {
      const room = await this.prisma.room.findFirst({
        where: { id: dto.roomId, branchId: surgeryCase.branchId, active: true },
      });
      if (!room) {
        throw new NotFoundException({
          code: SURGERY_ERROR_CODES.ROOM_NOT_FOUND,
          message: 'Operasyon odası bulunamadı',
        });
      }
    }
    if (dto.veterinarianId) {
      const vet = await this.prisma.staff.findFirst({
        where: { id: dto.veterinarianId, clinicId: auth.clinicId, active: true },
      });
      if (!vet) {
        throw new NotFoundException({
          code: SURGERY_ERROR_CODES.VET_NOT_FOUND,
          message: 'Veteriner bulunamadı',
        });
      }
    }
    await this.prisma.surgeryCase.update({
      where: { id: surgeryCase.id },
      data: {
        procedure: dto.procedure ?? undefined,
        plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : undefined,
        plannedDurationMin: dto.plannedDurationMin ?? undefined,
        veterinarianId: dto.veterinarianId ?? undefined,
        roomId: dto.roomId ?? undefined,
        diagnosis: dto.diagnosis ?? undefined,
        notes: dto.notes ?? undefined,
      },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: surgeryCase.branchId,
      action: 'SURGERY_CASE_UPDATED',
      entityType: 'SurgeryCase',
      entityId: surgeryCase.id,
    });
    return this.serializeCase(
      await this.prisma.surgeryCase.findUniqueOrThrow({
        where: { id: surgeryCase.id },
        include: CASE_INCLUDE,
      }),
    );
  }

  /** planned → prepped: varsayılan pre/post listeleri üretilir. */
  async prepCase(auth: AuthContext, caseId: string, request: AuthRequest) {
    const surgeryCase = await this.prisma.surgeryCase.findFirst({
      where: { id: caseId, clinicId: auth.clinicId },
    });
    if (!surgeryCase) {
      throw new NotFoundException({
        code: SURGERY_ERROR_CODES.CASE_NOT_FOUND,
        message: 'Cerrahi olgu bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, surgeryCase.branchId);
    if (!canTransitionSurgery(surgeryCase.status, 'prepped')) {
      throw new ConflictException({
        code: SURGERY_ERROR_CODES.INVALID_TRANSITION,
        message: `${surgeryCase.status} durumundan hazırlığa geçilemez`,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      for (const kind of ['pre', 'post'] as const) {
        await tx.surgeryChecklist.upsert({
          where: { surgeryCaseId_kind: { surgeryCaseId: surgeryCase.id, kind } },
          update: {},
          create: {
            clinicId: auth.clinicId,
            surgeryCaseId: surgeryCase.id,
            kind,
            items: buildDefaultChecklist(kind) as unknown as Prisma.InputJsonValue,
          },
        });
      }
      await tx.surgeryCase.update({
        where: { id: surgeryCase.id },
        data: { status: 'prepped' },
      });
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: surgeryCase.branchId,
      action: 'SURGERY_CASE_PREPPED',
      entityType: 'SurgeryCase',
      entityId: surgeryCase.id,
    });
    return this.serializeCase(
      await this.prisma.surgeryCase.findUniqueOrThrow({
        where: { id: surgeryCase.id },
        include: CASE_INCLUDE,
      }),
    );
  }

  /** prepped → in_surgery: 'pre' listesi tamamlanmış olmalı. */
  async startSurgery(auth: AuthContext, caseId: string, request: AuthRequest) {
    const surgeryCase = await this.prisma.surgeryCase.findFirst({
      where: { id: caseId, clinicId: auth.clinicId },
      include: { checklists: true },
    });
    if (!surgeryCase) {
      throw new NotFoundException({
        code: SURGERY_ERROR_CODES.CASE_NOT_FOUND,
        message: 'Cerrahi olgu bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, surgeryCase.branchId);
    if (!canTransitionSurgery(surgeryCase.status, 'in_surgery')) {
      throw new ConflictException({
        code: SURGERY_ERROR_CODES.INVALID_TRANSITION,
        message: `${surgeryCase.status} durumundan ameliyat başlatılamaz`,
      });
    }
    const preList = surgeryCase.checklists.find((c) => c.kind === 'pre');
    if (!preList || !allChecklistItemsDone(preList.items)) {
      throw new ConflictException({
        code: SURGERY_ERROR_CODES.CHECKLIST_INCOMPLETE,
        message: 'Ameliyat öncesi kontrol listesindeki tüm maddeler işaretlenmelidir',
      });
    }
    await this.prisma.surgeryCase.update({
      where: { id: surgeryCase.id },
      data: { status: 'in_surgery', actualStart: new Date() },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: surgeryCase.branchId,
      action: 'SURGERY_STARTED',
      entityType: 'SurgeryCase',
      entityId: surgeryCase.id,
    });
    return this.serializeCase(
      await this.prisma.surgeryCase.findUniqueOrThrow({
        where: { id: surgeryCase.id },
        include: CASE_INCLUDE,
      }),
    );
  }

  async recovery(auth: AuthContext, caseId: string, request: AuthRequest) {
    const surgeryCase = await this.prisma.surgeryCase.findFirst({
      where: { id: caseId, clinicId: auth.clinicId },
    });
    if (!surgeryCase) {
      throw new NotFoundException({
        code: SURGERY_ERROR_CODES.CASE_NOT_FOUND,
        message: 'Cerrahi olgu bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, surgeryCase.branchId);
    if (!canTransitionSurgery(surgeryCase.status, 'recovery')) {
      throw new ConflictException({
        code: SURGERY_ERROR_CODES.INVALID_TRANSITION,
        message: `${surgeryCase.status} durumundan iyileşmeye geçilemez`,
      });
    }
    await this.prisma.surgeryCase.update({
      where: { id: surgeryCase.id },
      data: { status: 'recovery' },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: surgeryCase.branchId,
      action: 'SURGERY_RECOVERY',
      entityType: 'SurgeryCase',
      entityId: surgeryCase.id,
    });
    return this.serializeCase(
      await this.prisma.surgeryCase.findUniqueOrThrow({
        where: { id: surgeryCase.id },
        include: CASE_INCLUDE,
      }),
    );
  }

  /** recovery → completed: post liste kontrolü uyarı niteliğinde, kilitlemez. */
  async completeCase(auth: AuthContext, caseId: string, request: AuthRequest) {
    const surgeryCase = await this.prisma.surgeryCase.findFirst({
      where: { id: caseId, clinicId: auth.clinicId },
      include: { checklists: true },
    });
    if (!surgeryCase) {
      throw new NotFoundException({
        code: SURGERY_ERROR_CODES.CASE_NOT_FOUND,
        message: 'Cerrahi olgu bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, surgeryCase.branchId);
    if (!canTransitionSurgery(surgeryCase.status, 'completed')) {
      throw new ConflictException({
        code: SURGERY_ERROR_CODES.INVALID_TRANSITION,
        message: `${surgeryCase.status} durumundan tamamlanamaz`,
      });
    }
    const postList = surgeryCase.checklists.find((c) => c.kind === 'post');
    await this.prisma.surgeryCase.update({
      where: { id: surgeryCase.id },
      data: { status: 'completed', actualEnd: new Date() },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: surgeryCase.branchId,
      action: 'SURGERY_COMPLETED',
      entityType: 'SurgeryCase',
      entityId: surgeryCase.id,
      metadata: { postChecklist: postList ? checklistItemSummary(postList.items) : null },
    });
    return this.serializeCase(
      await this.prisma.surgeryCase.findUniqueOrThrow({
        where: { id: surgeryCase.id },
        include: CASE_INCLUDE,
      }),
    );
  }

  async cancelCase(auth: AuthContext, caseId: string, dto: CancelSurgeryDto, request: AuthRequest) {
    const surgeryCase = await this.prisma.surgeryCase.findFirst({
      where: { id: caseId, clinicId: auth.clinicId },
    });
    if (!surgeryCase) {
      throw new NotFoundException({
        code: SURGERY_ERROR_CODES.CASE_NOT_FOUND,
        message: 'Cerrahi olgu bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, surgeryCase.branchId);
    if (!canTransitionSurgery(surgeryCase.status, 'cancelled')) {
      throw new ConflictException({
        code: SURGERY_ERROR_CODES.INVALID_TRANSITION,
        message: `${surgeryCase.status} durumundaki olgu iptal edilemez`,
      });
    }
    await this.prisma.surgeryCase.update({
      where: { id: surgeryCase.id },
      data: { status: 'cancelled', cancelReason: dto.reason },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: surgeryCase.branchId,
      action: 'SURGERY_CASE_CANCELLED',
      entityType: 'SurgeryCase',
      entityId: surgeryCase.id,
      metadata: { reason: dto.reason },
    });
    return this.serializeCase(
      await this.prisma.surgeryCase.findUniqueOrThrow({
        where: { id: surgeryCase.id },
        include: CASE_INCLUDE,
      }),
    );
  }

  /** Anestezi çizelgesi — olgu başına tek kayıt (upsert). */
  async upsertAnesthesia(
    auth: AuthContext,
    caseId: string,
    dto: UpsertAnesthesiaDto,
    request: AuthRequest,
  ) {
    const surgeryCase = await this.prisma.surgeryCase.findFirst({
      where: { id: caseId, clinicId: auth.clinicId },
    });
    if (!surgeryCase) {
      throw new NotFoundException({
        code: SURGERY_ERROR_CODES.CASE_NOT_FOUND,
        message: 'Cerrahi olgu bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, surgeryCase.branchId);
    if (dto.anesthetistId) {
      const staff = await this.prisma.staff.findFirst({
        where: { id: dto.anesthetistId, clinicId: auth.clinicId, active: true },
      });
      if (!staff) {
        throw new NotFoundException({
          code: SURGERY_ERROR_CODES.VET_NOT_FOUND,
          message: 'Anestezi sorumlusu bulunamadı',
        });
      }
    }
    await this.prisma.anesthesiaRecord.upsert({
      where: { surgeryCaseId: surgeryCase.id },
      update: {
        asaClass: dto.asaClass ?? undefined,
        premedication: dto.premedication ?? undefined,
        inductionAgent: dto.inductionAgent ?? undefined,
        maintenanceAgent: dto.maintenanceAgent ?? undefined,
        monitoringNotes: dto.monitoringNotes ?? undefined,
        anesthetistId: dto.anesthetistId ?? undefined,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
        endedAt: dto.endedAt ? new Date(dto.endedAt) : undefined,
      },
      create: {
        clinicId: auth.clinicId,
        surgeryCaseId: surgeryCase.id,
        asaClass: dto.asaClass ?? null,
        premedication: dto.premedication ?? null,
        inductionAgent: dto.inductionAgent ?? null,
        maintenanceAgent: dto.maintenanceAgent ?? null,
        monitoringNotes: dto.monitoringNotes ?? null,
        anesthetistId: dto.anesthetistId ?? null,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : null,
        endedAt: dto.endedAt ? new Date(dto.endedAt) : null,
      },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: surgeryCase.branchId,
      action: 'SURGERY_ANESTHESIA_UPDATED',
      entityType: 'SurgeryCase',
      entityId: surgeryCase.id,
    });
    return this.serializeCase(
      await this.prisma.surgeryCase.findUniqueOrThrow({
        where: { id: surgeryCase.id },
        include: CASE_INCLUDE,
      }),
    );
  }

  /** Kontrol listesi maddesini işaretle/işareti kaldır. */
  async toggleChecklistItem(
    auth: AuthContext,
    caseId: string,
    kind: string,
    dto: ToggleChecklistItemDto,
    request: AuthRequest,
  ) {
    if (kind !== 'pre' && kind !== 'post') {
      throw new BadRequestException({
        code: 'CHECKLIST_KIND',
        message: "Liste türü 'pre' veya 'post' olmalı",
      });
    }
    const surgeryCase = await this.prisma.surgeryCase.findFirst({
      where: { id: caseId, clinicId: auth.clinicId },
      include: { checklists: true },
    });
    if (!surgeryCase) {
      throw new NotFoundException({
        code: SURGERY_ERROR_CODES.CASE_NOT_FOUND,
        message: 'Cerrahi olgu bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, surgeryCase.branchId);
    const list = surgeryCase.checklists.find((c) => c.kind === kind);
    if (!list) {
      throw new NotFoundException({
        code: 'CHECKLIST_NOT_FOUND',
        message: 'Kontrol listesi henüz üretilmedi (önce hazırlığa geçin)',
      });
    }
    const items = (list.items as unknown) as ChecklistItem[];
    if (dto.index < 0 || dto.index >= items.length) {
      throw new BadRequestException({
        code: SURGERY_ERROR_CODES.ITEM_INDEX,
        message: 'Madde dizini aralık dışı',
      });
    }
    const current = items[dto.index] ?? { label: `Madde ${dto.index + 1}`, done: false };
    items[dto.index] = {
      ...current,
      done: dto.done,
      doneAt: dto.done ? new Date().toISOString() : null,
      doneById: dto.done ? auth.staffId : null,
    };
    await this.prisma.surgeryChecklist.update({
      where: { id: list.id },
      data: { items: items as unknown as Prisma.InputJsonValue },
    });
    return this.serializeCase(
      await this.prisma.surgeryCase.findUniqueOrThrow({
        where: { id: surgeryCase.id },
        include: CASE_INCLUDE,
      }),
    );
  }

  private serializeCase(input: Prisma.SurgeryCaseGetPayload<{ include: typeof CASE_INCLUDE }>) {
    return {
      id: input.id,
      branchId: input.branchId,
      status: input.status,
      procedure: input.procedure,
      diagnosis: input.diagnosis,
      patient: input.patient,
      owner: input.owner,
      veterinarian: input.veterinarian,
      room: input.room,
      encounterId: input.encounterId,
      encounter: input.encounter,
      plannedStart: input.plannedStart.toISOString(),
      plannedDurationMin: input.plannedDurationMin,
      actualStart: input.actualStart?.toISOString() ?? null,
      actualEnd: input.actualEnd?.toISOString() ?? null,
      cancelReason: input.cancelReason,
      notes: input.notes,
      anesthesia: input.anesthesia
        ? {
            asaClass: input.anesthesia.asaClass,
            premedication: input.anesthesia.premedication,
            inductionAgent: input.anesthesia.inductionAgent,
            maintenanceAgent: input.anesthesia.maintenanceAgent,
            monitoringNotes: input.anesthesia.monitoringNotes,
            anesthetistId: input.anesthesia.anesthetistId,
            startedAt: input.anesthesia.startedAt?.toISOString() ?? null,
            endedAt: input.anesthesia.endedAt?.toISOString() ?? null,
          }
        : null,
      checklists: input.checklists.map((list) => ({
        kind: list.kind,
        ...checklistItemSummary(list.items),
        items: (list.items as unknown) as ChecklistItem[],
      })),
    };
  }
}
