import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StockService } from '../inventory/stock.service';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import {
  PRESCRIPTION_ERROR_CODES,
  canSignPrescription,
  computeDoseSuggestion,
  nextPrescriptionCode,
} from './prescriptions.domain';
import type {
  AddPrescriptionLineDto,
  AdministerDto,
  ApproveDoseDto,
  CreatePrescriptionDto,
  DispenseLineDto,
  DoseHelperDto,
  ListAdministrationsQueryDto,
  ListPrescriptionsQueryDto,
  SignPrescriptionDto,
  VoidPrescriptionDto,
} from './prescriptions.dto';

const prescriptionInclude = {
  patient: { select: { id: true, name: true, code: true } },
  veterinarian: { select: { id: true, firstName: true, lastName: true } },
  signedBy: { select: { id: true, firstName: true, lastName: true } },
  encounter: { select: { id: true, status: true, startedAt: true } },
  lines: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      product: { select: { id: true, code: true, name: true, baseUnit: { select: { name: true } } } },
      doseApprovedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.PrescriptionInclude;

/**
 * Reçete servisi — Faz 10.
 *
 * Kurallar:
 * - Reçete yalnızca prescription.sign izniyle imzalanır (izin denetimi
 *   PermissionsGuard'ta; servis imza kapısını uygular).
 * - Doz önerisi içeren satırlar için açık veteriner onayı zorunludur;
 *   onaysız satır imzalamayı 409 DOSE_NOT_APPROVED ile bloklar.
 * - İmzalı reçete değişmez: satır ekleme/çıkarma/void reddedilir.
 * - Dağıtım (dispense) yalnızca imzalı reçetede, ürün bağıntılı satırda ve
   *   stok defterine consumption hareketi yazılarak yapılır — event ve defter
 *   tek DB transaction'ındadır; idempotencyKey tekrar denemelerde tekilleştirir.
 */
@Injectable()
export class PrescriptionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StockService) private readonly stock: StockService,
  ) {}

  private async recordAudit(
    input: {
      clinicId: string;
      staffId?: string | null;
      branchId?: string | null;
      action: string;
      entityType?: string;
      entityId?: string;
      metadata?: Record<string, unknown>;
    },
    request?: AuthRequest,
  ): Promise<void> {
    await this.audit.record(input, this.prisma);
  }

  private requireBranchAccess(auth: AuthContext, request: AuthRequest, branchId: string): void {
    if (request.branchId) {
      if (request.branchId !== branchId) {
        throw new ForbiddenException({ code: 'BRANCH_SCOPE', message: 'Şube kapsamı dışı istek' });
      }
      return;
    }
    if (auth.allBranches) return;
    if (!auth.branchIds.includes(branchId)) {
      throw new ForbiddenException({ code: 'BRANCH_SCOPE', message: 'Şube erişiminiz yok' });
    }
  }

  private async requirePrescription(clinicId: string, id: string) {
    const prescription = await this.prisma.prescription.findFirst({
      where: { id, clinicId },
      include: prescriptionInclude,
    });
    if (!prescription) {
      throw new NotFoundException({
        code: PRESCRIPTION_ERROR_CODES.NOT_FOUND,
        message: 'Reçete bulunamadı',
      });
    }
    return prescription;
  }

  private buildLineData(
    prescription: { clinicId: string },
    line: AddPrescriptionLineDto,
  ) {
    const doseHelper =
      line.doseCalcWeightKg != null && line.doseCalcMgPerKg != null
        ? computeDoseSuggestion({
            weightKg: line.doseCalcWeightKg,
            mgPerKg: line.doseCalcMgPerKg,
          })
        : null;
    return {
      drugName: line.drugName,
      form: line.form,
      doseAmount: line.doseAmount != null ? new Prisma.Decimal(line.doseAmount) : null,
      doseUnit: line.doseUnit ?? null,
      route: line.route,
      frequency: line.frequency,
      durationDays: line.durationDays ?? null,
      quantity: new Prisma.Decimal(line.quantity),
      quantityUnit: line.quantityUnit,
      instructions: line.instructions ?? null,
      productId: line.productId ?? null,
      doseCalcWeightKg:
        line.doseCalcWeightKg != null ? new Prisma.Decimal(line.doseCalcWeightKg) : null,
      doseCalcMgPerKg:
        line.doseCalcMgPerKg != null ? new Prisma.Decimal(line.doseCalcMgPerKg) : null,
      doseCalcFormula: doseHelper?.formula ?? null,
      doseCalcSuggested: doseHelper ? new Prisma.Decimal(doseHelper.singleDose) : null,
      doseCalcUnit: doseHelper?.doseUnit ?? null,
      // doseApproved yalnızca sign yetkisiyle imzada/işlemde true olur; create
      // sırasında gelen işaret yok sayılır (onay ayrı uçtan, izinle verilir).
      doseApproved: false,
    };
  }

  // ── Oluşturma ve satır düzenleme ───────────────────────────────────────────

  async create(auth: AuthContext, dto: CreatePrescriptionDto, request: AuthRequest) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId: auth.clinicId },
      select: { id: true, branchId: true, ownerId: true, name: true },
    });
    if (!patient) {
      throw new NotFoundException({ code: 'PATIENT_NOT_FOUND', message: 'Hasta bulunamadı' });
    }
    this.requireBranchAccess(auth, request, patient.branchId);
    if (dto.encounterId) {
      const encounter = await this.prisma.encounter.findFirst({
        where: { id: dto.encounterId, clinicId: auth.clinicId },
        select: { id: true, patientId: true, branchId: true },
      });
      if (!encounter || encounter.patientId !== patient.id) {
        throw new BadRequestException({
          code: PRESCRIPTION_ERROR_CODES.PATIENT_MISMATCH,
          message: 'Muayene hasta ile eşleşmiyor',
        });
      }
      this.requireBranchAccess(auth, request, encounter.branchId);
    }
    let veterinarianId = dto.veterinarianId ?? auth.staffId;
    if (dto.veterinarianId) {
      const vet = await this.prisma.staff.findFirst({
        where: { id: dto.veterinarianId, clinicId: auth.clinicId },
        select: { id: true },
      });
      if (!vet) {
        throw new BadRequestException({
          code: 'STAFF_NOT_FOUND',
          message: 'Reçete yazan veteriner bulunamadı',
        });
      }
    } else {
      veterinarianId = auth.staffId;
    }
    const created = await this.prisma.prescription.create({
      data: {
        clinicId: auth.clinicId,
        branchId: patient.branchId,
        patientId: patient.id,
        encounterId: dto.encounterId ?? null,
        veterinarianId,
        status: 'draft',
        notes: dto.notes ?? null,
        officialRef: dto.officialRef ?? null,
        createdById: auth.staffId,
        lines: dto.lines?.length
          ? { create: dto.lines.map((line) => this.buildLineData({ clinicId: auth.clinicId }, line)) }
          : undefined,
      },
      include: prescriptionInclude,
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: created.branchId,
        action: 'PRESCRIPTION_CREATED',
        entityType: 'Prescription',
        entityId: created.id,
        metadata: {
          patientId: patient.id,
          veterinarianId,
          lineCount: dto.lines?.length ?? 0,
        },
      },
      request,
    );
    return created;
  }

  async addLine(
    auth: AuthContext,
    prescriptionId: string,
    dto: AddPrescriptionLineDto,
    request: AuthRequest,
  ) {
    const prescription = await this.requirePrescription(auth.clinicId, prescriptionId);
    this.requireBranchAccess(auth, request, prescription.branchId);
    if (prescription.status !== 'draft') {
      throw new ConflictException({
        code: PRESCRIPTION_ERROR_CODES.SIGNED,
        message: 'İmzalı reçeteye satır eklenemez',
      });
    }
    if (dto.productId) {
      const product = await this.prisma.product.findFirst({
        where: { id: dto.productId, clinicId: auth.clinicId },
        select: { id: true },
      });
      if (!product) {
        throw new BadRequestException({ code: 'PRODUCT_NOT_FOUND', message: 'Ürün bulunamadı' });
      }
    }
    const line = await this.prisma.prescriptionLine.create({
      data: {
        prescriptionId: prescription.id,
        ...this.buildLineData(prescription, dto),
      },
      include: {
        product: { select: { id: true, code: true, name: true } },
      },
    });
    await this.prisma.prescription.update({
      where: { id: prescription.id },
      data: { version: { increment: 1 } },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: prescription.branchId,
        action: 'PRESCRIPTION_LINE_ADDED',
        entityType: 'PrescriptionLine',
        entityId: line.id,
        metadata: { prescriptionId: prescription.id, drugName: dto.drugName },
      },
      request,
    );
    return line;
  }

  async removeLine(
    auth: AuthContext,
    prescriptionId: string,
    lineId: string,
    request: AuthRequest,
  ) {
    const prescription = await this.requirePrescription(auth.clinicId, prescriptionId);
    this.requireBranchAccess(auth, request, prescription.branchId);
    if (prescription.status !== 'draft') {
      throw new ConflictException({
        code: PRESCRIPTION_ERROR_CODES.SIGNED,
        message: 'İmzalı reçeteden satır çıkarılamaz',
      });
    }
    const line = await this.prisma.prescriptionLine.findFirst({
      where: { id: lineId, prescriptionId: prescription.id },
      select: { id: true },
    });
    if (!line) {
      throw new NotFoundException({
        code: PRESCRIPTION_ERROR_CODES.LINE_NOT_FOUND,
        message: 'Reçete satırı bulunamadı',
      });
    }
    await this.prisma.prescriptionLine.delete({ where: { id: line.id } });
    await this.prisma.prescription.update({
      where: { id: prescription.id },
      data: { version: { increment: 1 } },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: prescription.branchId,
        action: 'PRESCRIPTION_LINE_REMOVED',
        entityType: 'PrescriptionLine',
        entityId: line.id,
        metadata: { prescriptionId: prescription.id },
      },
      request,
    );
    return { removed: true };
  }

  // ── Doz onayı ve imza (kabul kriterleri 1 ve 2) ────────────────────────────

  /**
   * Doz yardımcısı önerisinin satıra kesinleştirilmesi — yalnızca
   * prescription.sign izniyle çağrılabilir (denetim PermissionsGuard'ta).
   */
  async approveDose(
    auth: AuthContext,
    prescriptionId: string,
    lineId: string,
    dto: ApproveDoseDto,
    request: AuthRequest,
  ) {
    const prescription = await this.requirePrescription(auth.clinicId, prescriptionId);
    this.requireBranchAccess(auth, request, prescription.branchId);
    if (prescription.status !== 'draft') {
      throw new ConflictException({
        code: PRESCRIPTION_ERROR_CODES.SIGNED,
        message: 'İmzalı reçetede doz onayı verilemez',
      });
    }
    const line = prescription.lines.find((candidate) => candidate.id === lineId);
    if (!line) {
      throw new NotFoundException({
        code: PRESCRIPTION_ERROR_CODES.LINE_NOT_FOUND,
        message: 'Reçete satırı bulunamadı',
      });
    }
    if (line.doseCalcSuggested == null) {
      throw new BadRequestException({
        code: 'DOSE_HELPER_NOT_USED',
        message: 'Bu satırda doz yardımcısı önerisi yok — onay gereksiz',
      });
    }
    const updated = await this.prisma.prescriptionLine.update({
      where: { id: line.id },
      data: {
        doseApproved: true,
        doseApprovedByStaffId: auth.staffId,
        doseApprovedAt: new Date(),
      },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: prescription.branchId,
        action: 'PRESCRIPTION_DOSE_APPROVED',
        entityType: 'PrescriptionLine',
        entityId: line.id,
        metadata: {
          prescriptionId: prescription.id,
          formula: line.doseCalcFormula,
          suggested: line.doseCalcSuggested.toNumber(),
          note: dto.note ?? null,
        },
      },
      request,
    );
    return updated;
  }

  async sign(auth: AuthContext, prescriptionId: string, dto: SignPrescriptionDto, request: AuthRequest) {
    const prescription = await this.requirePrescription(auth.clinicId, prescriptionId);
    this.requireBranchAccess(auth, request, prescription.branchId);
    if (prescription.status === 'signed') {
      throw new ConflictException({
        code: PRESCRIPTION_ERROR_CODES.SIGNED,
        message: 'Reçete zaten imzalı',
      });
    }
    if (prescription.status === 'voided') {
      throw new ConflictException({
        code: PRESCRIPTION_ERROR_CODES.VOIDED,
        message: 'İptal edilmiş reçete imzalanamaz',
      });
    }
    if (prescription.lines.length === 0) {
      throw new ConflictException({
        code: PRESCRIPTION_ERROR_CODES.EMPTY,
        message: 'Boş reçete imzalanamaz — en az bir satır gerekli',
      });
    }
    // Kabul kriteri 2: doz önerisi taşıyan satır onaysızsa imza bloklanır.
    const gate = canSignPrescription(
      prescription.lines.map((line) => ({
        id: line.id,
        doseCalcSuggested: line.doseCalcSuggested ? line.doseCalcSuggested.toNumber() : null,
        doseApproved: line.doseApproved,
      })),
    );
    if (!gate.ok) {
      throw new ConflictException({
        code: PRESCRIPTION_ERROR_CODES.DOSE_NOT_APPROVED,
        message: 'Doz önerisi veteriner onayı olmadan kesinleşmez — önce onay verin',
        unapprovedLineIds: gate.unapprovedLineIds,
      });
    }
    // Klinik içinde tekil reçete numarası: son kodun ardılı (çakışmada ilerlet).
    const last = await this.prisma.prescription.findFirst({
      where: { clinicId: auth.clinicId, code: { not: null } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    let code = nextPrescriptionCode(last?.code ?? null);
    const signed = await this.prisma.$transaction(async (tx) => {
      for (;;) {
        try {
          return await tx.prescription.update({
            where: { id: prescription.id },
            data: {
              status: 'signed',
              signedAt: new Date(),
              signedById: auth.staffId,
              veterinarianId: prescription.veterinarianId,
              code,
              officialRef: dto.officialRef ?? prescription.officialRef,
            },
            include: prescriptionInclude,
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            code = nextPrescriptionCode(code);
            continue;
          }
          throw error;
        }
      }
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: prescription.branchId,
        action: 'PRESCRIPTION_SIGNED',
        entityType: 'Prescription',
        entityId: prescription.id,
        metadata: { code, patientId: prescription.patientId, lineCount: prescription.lines.length },
      },
      request,
    );
    return signed;
  }

  async void(auth: AuthContext, prescriptionId: string, dto: VoidPrescriptionDto, request: AuthRequest) {
    const prescription = await this.requirePrescription(auth.clinicId, prescriptionId);
    this.requireBranchAccess(auth, request, prescription.branchId);
    if (prescription.status === 'signed') {
      throw new ConflictException({
        code: PRESCRIPTION_ERROR_CODES.SIGNED,
        message: 'İmzalı reçete iptal edilemez — resmi belge değişmez',
      });
    }
    if (prescription.status === 'voided') {
      throw new ConflictException({
        code: PRESCRIPTION_ERROR_CODES.VOIDED,
        message: 'Reçete zaten iptal edilmiş',
      });
    }
    const voided = await this.prisma.prescription.update({
      where: { id: prescription.id },
      data: { status: 'voided', voidedAt: new Date(), voidedReason: dto.reason },
      include: prescriptionInclude,
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: prescription.branchId,
        action: 'PRESCRIPTION_VOIDED',
        entityType: 'Prescription',
        entityId: prescription.id,
        metadata: { reason: dto.reason },
      },
      request,
    );
    return voided;
  }

  // ── Dağıtım ve uygulama (kabul kriteri 3) ──────────────────────────────────

  /**
   * Reçete satırı için depodan ilaç sevk eder: DispenseEvent + stok defteri
   * consumption hareketi tek transaction'da. Yalnızca imzalı reçetede ve ürün
   * bağıntılı satırda çalışır (serbest metin ilaç stoktan düşemez).
   */
  async dispense(auth: AuthContext, prescriptionId: string, dto: DispenseLineDto, request: AuthRequest) {
    const prescription = await this.requirePrescription(auth.clinicId, prescriptionId);
    this.requireBranchAccess(auth, request, prescription.branchId);
    if (prescription.status !== 'signed') {
      throw new ConflictException({
        code: PRESCRIPTION_ERROR_CODES.SIGNED,
        message: 'Dağıtım yalnızca imzalı reçetede yapılabilir',
      });
    }
    const line = prescription.lines.find((candidate) => candidate.id === dto.lineId);
    if (!line) {
      throw new NotFoundException({
        code: PRESCRIPTION_ERROR_CODES.LINE_NOT_FOUND,
        message: 'Reçete satırı bulunamadı',
      });
    }
    if (!line.productId) {
      throw new BadRequestException({
        code: PRESCRIPTION_ERROR_CODES.LINE_NOT_DISPENSABLE,
        message: 'Katalog dışı (serbest ad) satır stoktan dağıtılamaz',
      });
    }
    const productId: string = line.productId;
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, branchId: prescription.branchId },
      select: { id: true, branchId: true },
    });
    if (!warehouse) {
      throw new BadRequestException({
        code: 'WAREHOUSE_NOT_FOUND',
        message: 'Depo bu şubede bulunamadı',
      });
    }
    if (dto.idempotencyKey) {
      const existing = await this.prisma.dispenseEvent.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing && existing.prescriptionLineId === dto.lineId) {
        return existing; // Mobil tekrar denemesi — yeni kayıt/hareket oluşturmaz
      }
    }
    // Event önce yazılır; defter hareketi refType 'DispenseEvent' + event
    // kimliğiyle aynı transaction içinde post edilir (defter append-only'dir,
    // refId sonradan güncellenemez). Bakiye azaltımı atomik koşulludur.
    try {
      const event = await this.prisma.$transaction(async (tx) => {
        const created = await tx.dispenseEvent.create({
          data: {
            clinicId: auth.clinicId,
            branchId: prescription.branchId,
            prescriptionId: prescription.id,
            prescriptionLineId: line.id,
            productId,
            warehouseId: warehouse.id,
            lotId: dto.lotId ?? null,
            qty: new Prisma.Decimal(dto.qty),
            dispensedByStaffId: auth.staffId,
            note: dto.note ?? null,
            idempotencyKey: dto.idempotencyKey ?? null,
          },
        });
        const posted = await this.stock.postConsumptionForRef(tx, {
          clinicId: auth.clinicId,
          branchId: prescription.branchId,
          warehouseId: warehouse.id,
          productId,
          qty: dto.qty,
          lotId: dto.lotId ?? null,
          refType: 'DispenseEvent',
          refId: created.id,
          staffId: auth.staffId,
          idempotencyKey: dto.idempotencyKey ?? null,
          note: dto.note ?? null,
        });
        const first = posted.allocations.length === 1 ? posted.allocations[0]! : null;
        return tx.dispenseEvent.update({
          where: { id: created.id },
          data: {
            movementId: posted.movementId,
            lotId: first?.lotId ?? null,
            lotCode: first?.lotCode ?? null,
            expiresAt: first?.expiresAt ?? null,
          },
          include: {
            product: { select: { id: true, code: true, name: true } },
            lot: { select: { id: true, lotCode: true, expiresAt: true } },
            dispensedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        });
      });
      await this.recordAudit(
        {
          clinicId: auth.clinicId,
          staffId: auth.staffId,
          branchId: prescription.branchId,
          action: 'PRESCRIPTION_DISPENSED',
          entityType: 'DispenseEvent',
          entityId: event.id,
          metadata: {
            prescriptionId: prescription.id,
            lineId: line.id,
            productId: line.productId,
            qty: dto.qty,
            warehouseId: warehouse.id,
            movementId: event.movementId,
          },
        },
        request,
      );
      return event;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        dto.idempotencyKey
      ) {
        const raced = await this.prisma.dispenseEvent.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (raced && raced.prescriptionLineId === dto.lineId) return raced;
      }
      throw error;
    }
  }

  /** İlaç uygulama kaydı — hastaya fiilen verilen doz (ADMINISTERED). */
  async administer(auth: AuthContext, dto: AdministerDto, request: AuthRequest) {
    const line = await this.prisma.prescriptionLine.findFirst({
      where: { id: dto.lineId },
      include: { prescription: { select: { id: true, clinicId: true, branchId: true, status: true } } },
    });
    if (!line || line.prescription.clinicId !== auth.clinicId) {
      throw new NotFoundException({
        code: PRESCRIPTION_ERROR_CODES.LINE_NOT_FOUND,
        message: 'Reçete satırı bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, line.prescription.branchId);
    if (line.prescription.status !== 'signed') {
      throw new ConflictException({
        code: PRESCRIPTION_ERROR_CODES.SIGNED,
        message: 'Uygulama kaydı yalnızca imzalı reçetede açılabilir',
      });
    }
    if (dto.idempotencyKey) {
      const existing = await this.prisma.administrationEvent.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
    }
    const event = await this.prisma.administrationEvent.create({
      data: {
        clinicId: auth.clinicId,
        branchId: line.prescription.branchId,
        patientId: (await this.prisma.prescription.findUnique({
          where: { id: line.prescriptionId },
          select: { patientId: true },
        }))!.patientId,
        prescriptionLineId: line.id,
        encounterId: dto.encounterId ?? null,
        productId: line.productId,
        drugName: line.drugName,
        doseGiven: new Prisma.Decimal(dto.doseGiven),
        doseUnit: dto.doseUnit ?? line.doseUnit,
        route: dto.route ?? line.route,
        site: dto.site ?? null,
        administeredByStaffId: auth.staffId,
        administeredAt: dto.administeredAt ? new Date(dto.administeredAt) : new Date(),
        note: dto.note ?? null,
        idempotencyKey: dto.idempotencyKey ?? null,
      },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: line.prescription.branchId,
        action: 'ADMINISTRATION_RECORDED',
        entityType: 'AdministrationEvent',
        entityId: event.id,
        metadata: {
          prescriptionId: line.prescription.id,
          lineId: line.id,
          drugName: line.drugName,
          doseGiven: dto.doseGiven,
        },
      },
      request,
    );
    return event;
  }

  // ── Doz yardımcısı (kabul kriteri 2) ───────────────────────────────────────

  /**
   * Doz yardımcısı — yalnızca aritmetik öneri: formül ve birimler görünür
   * döner, hiçbir kalıcılık yoktur ve mg/kg veteriner girişidir (otomatik
   * ilaç/doz önerisi üretimi yapılmaz).
   */
  async doseHelper(dto: DoseHelperDto) {
    return computeDoseSuggestion(dto);
  }

  // ── Okuma uçları ───────────────────────────────────────────────────────────

  async list(auth: AuthContext, query: ListPrescriptionsQueryDto) {
    const branchFilter: Prisma.PrescriptionWhereInput = auth.allBranches
      ? {}
      : { branchId: { in: auth.branchIds } };
    const prescriptions = await this.prisma.prescription.findMany({
      where: {
        clinicId: auth.clinicId,
        ...branchFilter,
        ...(query.status ? { status: query.status } : {}),
        ...(query.patientId ? { patientId: query.patientId } : {}),
      },
      include: {
        ...prescriptionInclude,
        lines: { select: { id: true } },
        _count: { select: { dispenses: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.take ?? 50,
    });
    return { items: prescriptions };
  }

  async detail(auth: AuthContext, id: string, request: AuthRequest) {
    const prescription = await this.requirePrescription(auth.clinicId, id);
    this.requireBranchAccess(auth, request, prescription.branchId);
    const [dispenses, administrations] = await Promise.all([
      this.prisma.dispenseEvent.findMany({
        where: { prescriptionId: id },
        orderBy: { dispensedAt: 'desc' },
        include: {
          product: { select: { id: true, code: true, name: true } },
          dispensedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.administrationEvent.findMany({
        where: { prescriptionLine: { prescriptionId: id } },
        orderBy: { administeredAt: 'desc' },
        include: {
          administeredBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);
    return { ...prescription, dispenses, administrations };
  }

  async listDispenses(auth: AuthContext, prescriptionId: string, request: AuthRequest) {
    const prescription = await this.requirePrescription(auth.clinicId, prescriptionId);
    this.requireBranchAccess(auth, request, prescription.branchId);
    const items = await this.prisma.dispenseEvent.findMany({
      where: { prescriptionId },
      orderBy: { dispensedAt: 'desc' },
      include: {
        product: { select: { id: true, code: true, name: true } },
        dispensedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return { items };
  }

  async listAdministrations(auth: AuthContext, query: ListAdministrationsQueryDto) {
    const branchFilter: Prisma.AdministrationEventWhereInput = auth.allBranches
      ? {}
      : { branchId: { in: auth.branchIds } };
    const items = await this.prisma.administrationEvent.findMany({
      where: {
        clinicId: auth.clinicId,
        ...branchFilter,
        ...(query.patientId ? { patientId: query.patientId } : {}),
        ...(query.prescriptionLineId ? { prescriptionLineId: query.prescriptionLineId } : {}),
      },
      orderBy: { administeredAt: 'desc' },
      take: query.take ?? 50,
      include: {
        administeredBy: { select: { id: true, firstName: true, lastName: true } },
        prescriptionLine: {
          select: { id: true, drugName: true, prescription: { select: { id: true, code: true } } },
        },
      },
    });
    return { items };
  }
}
