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
  canTransitionLabOrder,
  evaluateResult,
  sampleLabelCode,
} from './lab.domain';
import type {
  CancelLabOrderDto,
  CollectSampleDto,
  CreateLabOrderDto,
  CreateLabResultDto,
  CreateLabTestDto,
  ListCriticalResultsQueryDto,
  ListLabOrdersQueryDto,
  RejectSampleDto,
  UpdateLabTestDto,
} from './lab.dto';

export const LAB_ERROR_CODES = {
  ORDER_NOT_FOUND: 'LAB_ORDER_NOT_FOUND',
  TEST_NOT_FOUND: 'LAB_TEST_NOT_FOUND',
  TEST_INACTIVE: 'LAB_TEST_INACTIVE',
  TEST_CONFLICT: 'LAB_TEST_CONFLICT',
  INVALID_TRANSITION: 'LAB_ORDER_INVALID_TRANSITION',
  SAMPLE_NOT_FOUND: 'LAB_SAMPLE_NOT_FOUND',
  SAMPLE_EXISTS: 'LAB_SAMPLE_EXISTS',
  RESULT_EXISTS: 'LAB_RESULT_EXISTS',
  RESULT_VALUE_REQUIRED: 'LAB_RESULT_VALUE_REQUIRED',
  PATIENT_NOT_FOUND: 'LAB_PATIENT_NOT_FOUND',
  VET_NOT_FOUND: 'LAB_VETERINARIAN_NOT_FOUND',
  BRANCH_SCOPE: 'BRANCH_SCOPE',
} as const;

const ORDER_INCLUDE = {
  patient: { select: { id: true, name: true, code: true } },
  test: { select: { id: true, code: true, name: true, unit: true, sampleType: true } },
  veterinarian: { select: { id: true, firstName: true, lastName: true } },
  requestedBy: { select: { id: true, firstName: true, lastName: true } },
  samples: true,
  results: true,
} satisfies Prisma.LabOrderInclude;

/**
 * Lab servisi — Faz 11.
 *
 * Kurallar:
 * - Sipariş yaşam döngüsü lab.domain'deki geçiş tablosuyla sınırlıdır;
 *   geçersiz geçiş 409 INVALID_TRANSITION döner.
 * - Sonuç yalnız 'in_progress' durumunda girilir; girim siparişi 'completed'
 *   yapar ve kritiklik kayım anında katalog eşiklerinden hesaplanır.
 * - Kritik sonuç uyarısı: 'open' kritik sonuçlar lab.manage izniyle listelenir;
 *   onaylama (acknowledge) ek olarak clinical.sign izni ister — resepsiyon
 *   uyarıyı görür ama kapatamaz (yetkili klinisyen kapatır).
 * - Tüm okumalar şube kapsamıyla (BranchScopeGuard + request.branchId) sınırlı.
 */
@Injectable()
export class LabService {
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
          code: LAB_ERROR_CODES.BRANCH_SCOPE,
          message: 'Şube kapsamı dışı istek',
        });
      }
      return;
    }
    if (auth.allBranches) return;
    if (!auth.branchIds.includes(branchId)) {
      throw new ForbiddenException({
        code: LAB_ERROR_CODES.BRANCH_SCOPE,
        message: 'Şube erişiminiz yok',
      });
    }
  }

  private toNumber(value: Prisma.Decimal | number | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    return typeof value === 'number' ? value : value.toNumber();
  }

  // ------------------------------------------------------------------ katalog

  async listTests(auth: AuthContext, includeInactive = false) {
    const tests = await this.prisma.labCatalog.findMany({
      where: { clinicId: auth.clinicId, ...(includeInactive ? {} : { active: true }) },
      orderBy: { code: 'asc' },
    });
    return tests.map((test) => ({
      id: test.id,
      code: test.code,
      name: test.name,
      sampleType: test.sampleType,
      unit: test.unit,
      speciesId: test.speciesId,
      refLow: this.toNumber(test.refLow),
      refHigh: this.toNumber(test.refHigh),
      criticalLow: this.toNumber(test.criticalLow),
      criticalHigh: this.toNumber(test.criticalHigh),
      turnaroundHours: test.turnaroundHours,
      active: test.active,
    }));
  }

  async createTest(auth: AuthContext, dto: CreateLabTestDto, request: AuthRequest) {
    const exists = await this.prisma.labCatalog.findFirst({
      where: { clinicId: auth.clinicId, code: dto.code },
    });
    if (exists) {
      throw new ConflictException({
        code: LAB_ERROR_CODES.TEST_CONFLICT,
        message: `Test kodu ${dto.code} zaten kayıtlı`,
      });
    }
    const test = await this.prisma.labCatalog.create({
      data: {
        clinicId: auth.clinicId,
        code: dto.code,
        name: dto.name,
        sampleType: dto.sampleType,
        unit: dto.unit ?? null,
        speciesId: dto.speciesId ?? null,
        refLow: dto.refLow ?? null,
        refHigh: dto.refHigh ?? null,
        criticalLow: dto.criticalLow ?? null,
        criticalHigh: dto.criticalHigh ?? null,
        turnaroundHours: dto.turnaroundHours ?? 24,
      },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: request.branchId ?? null,
      action: 'LAB_TEST_CREATED',
      entityType: 'LabCatalog',
      entityId: test.id,
      metadata: { code: test.code },
    });
    return { id: test.id, code: test.code };
  }

  async updateTest(
    auth: AuthContext,
    testId: string,
    dto: UpdateLabTestDto,
    request: AuthRequest,
  ) {
    const test = await this.prisma.labCatalog.findFirst({
      where: { id: testId, clinicId: auth.clinicId },
    });
    if (!test) {
      throw new NotFoundException({
        code: LAB_ERROR_CODES.TEST_NOT_FOUND,
        message: 'Test bulunamadı',
      });
    }
    const updated = await this.prisma.labCatalog.update({
      where: { id: test.id },
      data: {
        name: dto.name ?? undefined,
        sampleType: dto.sampleType ?? undefined,
        unit: dto.unit ?? undefined,
        speciesId: dto.speciesId ?? undefined,
        refLow: dto.refLow ?? undefined,
        refHigh: dto.refHigh ?? undefined,
        criticalLow: dto.criticalLow ?? undefined,
        criticalHigh: dto.criticalHigh ?? undefined,
        turnaroundHours: dto.turnaroundHours ?? undefined,
        active: dto.active ?? undefined,
      },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: request.branchId ?? null,
      action: 'LAB_TEST_UPDATED',
      entityType: 'LabCatalog',
      entityId: test.id,
    });
    return { id: updated.id, active: updated.active };
  }

  // ------------------------------------------------------------------ sipariş

  async listOrders(auth: AuthContext, query: ListLabOrdersQueryDto, request: AuthRequest) {
    const branchFilter = request.branchId
      ? { branchId: request.branchId }
      : { branchId: { in: auth.allBranches ? undefined : auth.branchIds } };
    const orders = await this.prisma.labOrder.findMany({
      where: {
        clinicId: auth.clinicId,
        ...branchFilter,
        ...(query.status ? { status: query.status } : {}),
        ...(query.patientId ? { patientId: query.patientId } : {}),
        ...(query.encounterId ? { encounterId: query.encounterId } : {}),
      },
      include: ORDER_INCLUDE,
      orderBy: { orderedAt: 'desc' },
      take: query.take ?? 50,
    });
    return {
      items: orders.map((order) => this.serializeOrder(order)),
    };
  }

  async getOrder(auth: AuthContext, orderId: string, request: AuthRequest) {
    const order = await this.prisma.labOrder.findFirst({
      where: { id: orderId, clinicId: auth.clinicId },
      include: ORDER_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException({
        code: LAB_ERROR_CODES.ORDER_NOT_FOUND,
        message: 'Lab siparişi bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, order.branchId);
    return this.serializeOrder(order);
  }

  async createOrder(auth: AuthContext, dto: CreateLabOrderDto, request: AuthRequest) {
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
        code: LAB_ERROR_CODES.PATIENT_NOT_FOUND,
        message: 'Hasta bulunamadı',
      });
    }
    const test = await this.prisma.labCatalog.findFirst({
      where: { id: dto.testId, clinicId: auth.clinicId, active: true },
    });
    if (!test) {
      throw new NotFoundException({
        code: LAB_ERROR_CODES.TEST_NOT_FOUND,
        message: 'Test katalogda bulunamadı veya pasif',
      });
    }
    const vet = await this.prisma.staff.findFirst({
      where: { id: dto.veterinarianId, clinicId: auth.clinicId, active: true },
    });
    if (!vet) {
      throw new NotFoundException({
        code: LAB_ERROR_CODES.VET_NOT_FOUND,
        message: 'Veteriner bulunamadı',
      });
    }
    if (dto.encounterId) {
      const encounter = await this.prisma.encounter.findFirst({
        where: { id: dto.encounterId, clinicId: auth.clinicId },
      });
      if (!encounter) {
        throw new NotFoundException({
          code: 'ENCOUNTER_NOT_FOUND',
          message: 'Muayene kaydı bulunamadı',
        });
      }
    }
    const order = await this.prisma.labOrder.create({
      data: {
        clinicId: auth.clinicId,
        branchId: request.branchId,
        patientId: patient.id,
        encounterId: dto.encounterId ?? null,
        testId: test.id,
        priority: dto.priority ?? 'routine',
        veterinarianId: vet.id,
        requestedById: auth.staffId,
        notes: dto.notes ?? null,
      },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: request.branchId,
      action: 'LAB_ORDER_CREATED',
      entityType: 'LabOrder',
      entityId: order.id,
      metadata: { testCode: test.code, priority: order.priority },
    });
    return this.serializeOrder(
      await this.prisma.labOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: ORDER_INCLUDE,
      }),
    );
  }

  /** Numune toplama: ordered → sample_collected + Sample kaydı. */
  async collectSample(
    auth: AuthContext,
    orderId: string,
    dto: CollectSampleDto,
    request: AuthRequest,
  ) {
    const order = await this.prisma.labOrder.findFirst({
      where: { id: orderId, clinicId: auth.clinicId },
    });
    if (!order) {
      throw new NotFoundException({
        code: LAB_ERROR_CODES.ORDER_NOT_FOUND,
        message: 'Lab siparişi bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, order.branchId);
    if (!canTransitionLabOrder(order.status, 'sample_collected')) {
      throw new ConflictException({
        code: LAB_ERROR_CODES.INVALID_TRANSITION,
        message: `${order.status} durumundan numune toplama yapılamaz`,
      });
    }
    const exists = await this.prisma.sample.findUnique({
      where: { orderId: order.id },
    });
    if (exists) {
      throw new ConflictException({
        code: LAB_ERROR_CODES.SAMPLE_EXISTS,
        message: 'Bu sipariş için numune zaten kayıtlı',
      });
    }
    const test = await this.prisma.labCatalog.findUnique({ where: { id: order.testId } });
    const collectedAt = dto.collectedAt ? new Date(dto.collectedAt) : new Date();
    const label = sampleLabelCode(collectedAt, `${order.id}${Date.now().toString(36)}`);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.sample.create({
        data: {
          clinicId: auth.clinicId,
          orderId: order.id,
          sampleType: dto.sampleType ?? test?.sampleType ?? 'kan',
          labelCode: label,
          collectedAt,
          collectedById: auth.staffId,
        },
      });
      return tx.labOrder.update({
        where: { id: order.id },
        data: { status: 'sample_collected' },
        include: ORDER_INCLUDE,
      });
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: order.branchId,
      action: 'LAB_SAMPLE_COLLECTED',
      entityType: 'LabOrder',
      entityId: order.id,
      metadata: { labelCode: label },
    });
    return this.serializeOrder(updated);
  }

  /** Numune reddi — sample durumu 'rejected'; sipariş durumu değişmez. */
  async rejectSample(auth: AuthContext, orderId: string, dto: RejectSampleDto, request: AuthRequest) {
    const order = await this.prisma.labOrder.findFirst({
      where: { id: orderId, clinicId: auth.clinicId },
      include: { samples: true },
    });
    if (!order) {
      throw new NotFoundException({
        code: LAB_ERROR_CODES.ORDER_NOT_FOUND,
        message: 'Lab siparişi bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, order.branchId);
    const sample = order.samples[0];
    if (!sample) {
      throw new NotFoundException({
        code: LAB_ERROR_CODES.SAMPLE_NOT_FOUND,
        message: 'Numune kaydı yok',
      });
    }
    if (sample.status === 'rejected') {
      throw new ConflictException({
        code: 'SAMPLE_ALREADY_REJECTED',
        message: 'Numune zaten reddedilmiş',
      });
    }
    await this.prisma.sample.update({
      where: { id: sample.id },
      data: { status: 'rejected', rejectionReason: dto.reason },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: order.branchId,
      action: 'LAB_SAMPLE_REJECTED',
      entityType: 'LabOrder',
      entityId: order.id,
      metadata: { reason: dto.reason },
    });
    return this.serializeOrder(
      await this.prisma.labOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: ORDER_INCLUDE,
      }),
    );
  }

  /** Analiz başlatma: sample_collected → in_progress. */
  async startAnalysis(auth: AuthContext, orderId: string, request: AuthRequest) {
    const order = await this.prisma.labOrder.findFirst({
      where: { id: orderId, clinicId: auth.clinicId },
    });
    if (!order) {
      throw new NotFoundException({
        code: LAB_ERROR_CODES.ORDER_NOT_FOUND,
        message: 'Lab siparişi bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, order.branchId);
    if (!canTransitionLabOrder(order.status, 'in_progress')) {
      throw new ConflictException({
        code: LAB_ERROR_CODES.INVALID_TRANSITION,
        message: `${order.status} durumundan analiz başlatılamaz`,
      });
    }
    const updated = await this.prisma.labOrder.update({
      where: { id: order.id },
      data: { status: 'in_progress' },
      include: ORDER_INCLUDE,
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: order.branchId,
      action: 'LAB_ANALYSIS_STARTED',
      entityType: 'LabOrder',
      entityId: order.id,
    });
    return this.serializeOrder(updated);
  }

  /**
   * Sonuç girişi: in_progress → completed + LabResult.
   * Kritiklik katalog eşiklerinden hesaplanır ve kayda dondurulur.
   */
  async addResult(auth: AuthContext, orderId: string, dto: CreateLabResultDto, request: AuthRequest) {
    const order = await this.prisma.labOrder.findFirst({
      where: { id: orderId, clinicId: auth.clinicId },
    });
    if (!order) {
      throw new NotFoundException({
        code: LAB_ERROR_CODES.ORDER_NOT_FOUND,
        message: 'Lab siparişi bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, order.branchId);
    if (!canTransitionLabOrder(order.status, 'completed')) {
      throw new ConflictException({
        code: LAB_ERROR_CODES.INVALID_TRANSITION,
        message: `Sonuç yalnız in_progress durumunda girilebilir (mevcut: ${order.status})`,
      });
    }
    const resultExists = await this.prisma.labResult.findUnique({ where: { orderId: order.id } });
    if (resultExists) {
      throw new ConflictException({
        code: LAB_ERROR_CODES.RESULT_EXISTS,
        message: 'Bu sipariş için sonuç zaten girilmiş',
      });
    }
    const test = await this.prisma.labCatalog.findUnique({ where: { id: order.testId } });
    if (!test) {
      throw new NotFoundException({
        code: LAB_ERROR_CODES.TEST_NOT_FOUND,
        message: 'Test bulunamadı',
      });
    }
    let evaluated;
    try {
      evaluated = evaluateResult({
        value: dto.value ?? null,
        valueText: dto.valueText ?? null,
        refLow: this.toNumber(test.refLow),
        refHigh: this.toNumber(test.refHigh),
        criticalLow: this.toNumber(test.criticalLow),
        criticalHigh: this.toNumber(test.criticalHigh),
      });
    } catch {
      throw new BadRequestException({
        code: LAB_ERROR_CODES.RESULT_VALUE_REQUIRED,
        message: 'Sayısal sonuç veya metin sonuç girilmeli',
      });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.labResult.create({
        data: {
          clinicId: auth.clinicId,
          orderId: order.id,
          testId: test.id,
          value: dto.value ?? null,
          valueText: dto.valueText ?? null,
          unit: test.unit,
          refLow: test.refLow,
          refHigh: test.refHigh,
          flag: evaluated.flag,
          isCritical: evaluated.isCritical,
          notes: dto.notes ?? null,
          resultedById: auth.staffId,
        },
      });
      return tx.labOrder.update({
        where: { id: order.id },
        data: { status: 'completed', completedAt: new Date() },
        include: ORDER_INCLUDE,
      });
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: order.branchId,
      action: evaluated.isCritical ? 'LAB_CRITICAL_RESULT' : 'LAB_RESULT_ADDED',
      entityType: 'LabOrder',
      entityId: order.id,
      metadata: { flag: evaluated.flag, isCritical: evaluated.isCritical },
    });
    return this.serializeOrder(updated);
  }

  /**
   * Kabul kriteri: Kritik sonuç yetkili klinisyen ekranında uyarı üretmeli.
   * 'open' = isCritical ve henüz onaylanmamış; şube kapsamlı sıralı liste.
   */
  async listCriticalResults(
    auth: AuthContext,
    query: ListCriticalResultsQueryDto,
    request: AuthRequest,
  ) {
    const branchFilter = request.branchId
      ? { branchId: request.branchId }
      : { branchId: { in: auth.allBranches ? undefined : auth.branchIds } };
    const acknowledgedFilter =
      query.window === 'open'
        ? { acknowledgedAt: null }
        : query.window === 'acknowledged'
          ? { NOT: { acknowledgedAt: null } }
          : {};
    const results = await this.prisma.labResult.findMany({
      where: {
        clinicId: auth.clinicId,
        isCritical: true,
        ...acknowledgedFilter,
        order: branchFilter,
      },
      include: {
        test: { select: { code: true, name: true, unit: true } },
        order: {
          select: {
            id: true,
            branchId: true,
            orderedAt: true,
            patient: { select: { id: true, name: true, code: true } },
            veterinarian: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { resultedAt: 'desc' },
      take: query.take ?? 50,
    });
    return {
      items: results.map((result) => ({
        id: result.id,
        orderId: result.orderId,
        testCode: result.test.code,
        testName: result.test.name,
        patient: result.order.patient,
        veterinarian: result.order.veterinarian,
        branchId: result.order.branchId,
        flag: result.flag,
        value: this.toNumber(result.value),
        valueText: result.valueText,
        unit: result.unit,
        criticalLow: this.toNumber(result.refLow),
        criticalHigh: this.toNumber(result.refHigh),
        resultedAt: result.resultedAt.toISOString(),
        acknowledgedAt: result.acknowledgedAt?.toISOString() ?? null,
      })),
    };
  }

  /** Kritik sonucu onaylama — lab.manage + clinical.sign (yetkili klinisyen). */
  async acknowledgeResult(auth: AuthContext, resultId: string, request: AuthRequest) {
    const result = await this.prisma.labResult.findFirst({
      where: { id: resultId, clinicId: auth.clinicId, isCritical: true },
      include: { order: true },
    });
    if (!result) {
      throw new NotFoundException({
        code: 'LAB_RESULT_NOT_FOUND',
        message: 'Kritik sonuç bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, result.order.branchId);
    if (result.acknowledgedAt) {
      throw new ConflictException({
        code: 'RESULT_ALREADY_ACKNOWLEDGED',
        message: 'Kritik sonuç zaten onaylanmış',
      });
    }
    await this.prisma.labResult.update({
      where: { id: result.id },
      data: { acknowledgedAt: new Date(), acknowledgedById: auth.staffId },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: result.order.branchId,
      action: 'LAB_CRITICAL_ACKNOWLEDGED',
      entityType: 'LabResult',
      entityId: result.id,
    });
    return { id: result.id, acknowledgedAt: new Date().toISOString() };
  }

  async cancelOrder(auth: AuthContext, orderId: string, dto: CancelLabOrderDto, request: AuthRequest) {
    const order = await this.prisma.labOrder.findFirst({
      where: { id: orderId, clinicId: auth.clinicId },
    });
    if (!order) {
      throw new NotFoundException({
        code: LAB_ERROR_CODES.ORDER_NOT_FOUND,
        message: 'Lab siparişi bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, order.branchId);
    if (!canTransitionLabOrder(order.status, 'cancelled')) {
      throw new ConflictException({
        code: LAB_ERROR_CODES.INVALID_TRANSITION,
        message: `${order.status} durumundan sipariş iptal edilemez`,
      });
    }
    await this.prisma.labOrder.update({
      where: { id: order.id },
      data: { status: 'cancelled', cancelledById: auth.staffId, cancelReason: dto.reason },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: order.branchId,
      action: 'LAB_ORDER_CANCELLED',
      entityType: 'LabOrder',
      entityId: order.id,
      metadata: { reason: dto.reason },
    });
    return this.serializeOrder(
      await this.prisma.labOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: ORDER_INCLUDE,
      }),
    );
  }

  private serializeOrder(order: Prisma.LabOrderGetPayload<{ include: typeof ORDER_INCLUDE }>) {
    return {
      id: order.id,
      branchId: order.branchId,
      status: order.status,
      priority: order.priority,
      patient: order.patient,
      encounterId: order.encounterId,
      test: order.test,
      veterinarian: order.veterinarian,
      requestedBy: order.requestedBy,
      notes: order.notes,
      cancelReason: order.cancelReason,
      orderedAt: order.orderedAt.toISOString(),
      completedAt: order.completedAt?.toISOString() ?? null,
      sample: order.samples[0]
        ? {
            id: order.samples[0].id,
            labelCode: order.samples[0].labelCode,
            status: order.samples[0].status,
            sampleType: order.samples[0].sampleType,
            collectedAt: order.samples[0].collectedAt.toISOString(),
            rejectionReason: order.samples[0].rejectionReason,
          }
        : null,
      result: order.results[0]
        ? {
            id: order.results[0].id,
            value: this.toNumber(order.results[0].value),
            valueText: order.results[0].valueText,
            unit: order.results[0].unit,
            refLow: this.toNumber(order.results[0].refLow),
            refHigh: this.toNumber(order.results[0].refHigh),
            flag: order.results[0].flag,
            isCritical: order.results[0].isCritical,
            acknowledgedAt: order.results[0].acknowledgedAt?.toISOString() ?? null,
            notes: order.results[0].notes,
            resultedAt: order.results[0].resultedAt.toISOString(),
          }
        : null,
    };
  }
}
