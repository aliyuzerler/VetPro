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
import { ServicesService } from '../services/services.service';
import { computeLineTotal, isEditable, acceptsAddendum } from './encounters.domain';
import type { AuthContext } from '../common/auth/auth-context';
import type { AuthRequest } from '../common/auth/auth-context';
import type {
  AddDiagnosisDto,
  AddVitalDto,
  CreateAddendumDto,
  CreateAttachmentDto,
  CreateEncounterDto,
  CreateServiceRecordDto,
  ServiceRecordLineInput,
  UpdateEncounterDto,
} from './encounters.dto';

/** Stabil hata kodları — istemci imza kilit akışını bu kodlarla ayırt eder. */
export const ENCOUNTER_ERROR_CODES = {
  SIGNED: 'ENCOUNTER_SIGNED',
  NOT_SIGNED: 'ENCOUNTER_NOT_SIGNED',
  INVALID_TRANSITION: 'ENCOUNTER_INVALID_TRANSITION',
  MISSING_PRICE: 'SERVICE_PRICE_MISSING',
  ASSET_MISMATCH: 'ASSET_PATIENT_MISMATCH',
} as const;

const ENCOUNTER_DETAIL_INCLUDE = {
  patient: {
    select: {
      id: true,
      name: true,
      code: true,
      gender: true,
      birthDate: true,
      branchId: true,
      ownerId: true,
      species: { select: { name: true } },
      breed: { select: { name: true } },
      alerts: {
        where: { active: true },
        select: { id: true, kind: true, label: true, severity: true },
        orderBy: { createdAt: 'desc' as const },
      },
    },
  },
  owner: { select: { id: true, firstName: true, lastName: true } },
  veterinarian: { select: { id: true, firstName: true, lastName: true, title: true } },
  signedBy: { select: { id: true, firstName: true, lastName: true } },
  appointment: { select: { id: true, scheduledStart: true, status: true } },
  branch: { select: { id: true, name: true, code: true } },
  vitals: {
    orderBy: { measuredAt: 'desc' as const },
    select: {
      id: true,
      kind: true,
      value: true,
      unit: true,
      measuredAt: true,
      note: true,
      createdBy: { select: { firstName: true, lastName: true } },
    },
  },
  diagnoses: {
    orderBy: { createdAt: 'asc' as const },
    select: { id: true, code: true, name: true, kind: true, note: true, createdAt: true },
  },
  attachments: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      label: true,
      createdAt: true,
      asset: {
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true, kind: true },
      },
    },
  },
  addendums: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, firstName: true, lastName: true, title: true } },
    },
  },
  serviceRecords: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      status: true,
      performedBy: { select: { firstName: true, lastName: true } },
      finalizedAt: true,
      createdAt: true,
      lines: {
        select: {
          id: true,
          qty: true,
          unitPrice: true,
          discount: true,
          tax: true,
          lineTotal: true,
          service: { select: { id: true, code: true, name: true, category: true } },
        },
      },
    },
  },
} satisfies Prisma.EncounterInclude;

export type EncounterDetail = Prisma.EncounterGetPayload<{
  include: typeof ENCOUNTER_DETAIL_INCLUDE;
}>;

const ENCOUNTER_LIST_SELECT = {
  id: true,
  clinicId: true,
  branchId: true,
  patientId: true,
  ownerId: true,
  status: true,
  chiefComplaint: true,
  startedAt: true,
  signedAt: true,
  version: true,
  veterinarian: { select: { id: true, firstName: true, lastName: true } },
  patient: { select: { id: true, name: true, code: true } },
  branch: { select: { id: true, name: true, code: true } },
  _count: { select: { vitals: true, diagnoses: true, addendums: true, serviceRecords: true } },
} satisfies Prisma.EncounterSelect;

/**
 * Muayene kaydı servisi — Faz 06 çekirdek. Kabul kriterleri servis seviyesinde:
 * 1. SOAP alanları kaydedilip yeniden açılır (PATCH + GET aynı alanları döndürür).
 * 2. Aynı vital bulgunun geçmiş ölçümleri korunur (her kayıt yeni satır).
 * 3. Yetkisiz kişi imzalayamaz (clinical.sign izni controller'da zorunlu).
 * 4. Signed encounter PATCH/DELETE'te ENCOUNTER_SIGNED (409) döner.
 * 5. Addendum orijinal encounter'a referanslıdır ve denetim üretir.
 * 6. Hizmet fiyatları geçerlilik + şube override ile çözülür (ServicesService).
 */
@Injectable()
export class EncountersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ServicesService) private readonly services: ServicesService,
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
    await this.audit.record(
      input,
      this.prisma,
    );
  }

  /** Şube filtresi: guard çözümü varsa o şube; allBranches ise klinik geneli. */
  private branchFilter(auth: AuthContext, request: AuthRequest): Prisma.EncounterWhereInput['branchId'] {
    if (request.branchId) return request.branchId;
    if (auth.allBranches) return undefined;
    return { in: auth.branchIds };
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

  private async getEncounterOr404(
    clinicId: string,
    encounterId: string,
    includeFull = true,
  ): Promise<Prisma.EncounterGetPayload<{ include: typeof ENCOUNTER_DETAIL_INCLUDE }>> {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, clinicId },
      ...(includeFull ? { include: ENCOUNTER_DETAIL_INCLUDE } : {}),
    });
    if (!encounter) {
      throw new NotFoundException({ code: 'ENCOUNTER_NOT_FOUND', message: 'Muayene kaydı bulunamadı' });
    }
    return encounter as Prisma.EncounterGetPayload<{ include: typeof ENCOUNTER_DETAIL_INCLUDE }>;
  }

  /** Kaydı branch scope'a karşı doğrular (detay erişimi ve mutation öncesi). */
  private assertEncounterScope(
    auth: AuthContext,
    request: AuthRequest,
    encounter: { branchId: string },
  ): void {
    this.requireBranchAccess(auth, request, encounter.branchId);
  }

  /** İmzalı kaydı düzenleme denemesini tek noktadan engeller (kabul kriteri 4). */
  private assertEditable(status: string): void {
    if (!isEditable(status)) {
      throw new ConflictException({
        code: ENCOUNTER_ERROR_CODES.SIGNED,
        message: 'İmzalı muayene kaydı değiştirilemez — düzeltme için addendum ekleyin',
      });
    }
  }

  async list(auth: AuthContext, request: AuthRequest, query: {
    patientId?: string;
    branchId?: string;
    status?: string;
    veterinarianId?: string;
  }) {
    const where: Prisma.EncounterWhereInput = {
      clinicId: auth.clinicId,
      branchId: this.branchFilter(auth, request),
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.veterinarianId ? { veterinarianId: query.veterinarianId } : {}),
    };
    const items = await this.prisma.encounter.findMany({
      where,
      select: ENCOUNTER_LIST_SELECT,
      orderBy: { startedAt: 'desc' as const },
      take: 100,
    });
    return { items };
  }

  async detail(auth: AuthContext, request: AuthRequest, encounterId: string): Promise<EncounterDetail> {
    const encounter = await this.getEncounterOr404(auth.clinicId, encounterId);
    this.assertEncounterScope(auth, request, encounter);
    return encounter;
  }

  async create(auth: AuthContext, dto: CreateEncounterDto, request: AuthRequest) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId: auth.clinicId, archivedAt: null },
      select: { id: true, branchId: true, ownerId: true, name: true },
    });
    if (!patient) {
      throw new NotFoundException({ code: 'PATIENT_NOT_FOUND', message: 'Hasta bulunamadı' });
    }
    this.requireBranchAccess(auth, request, patient.branchId);

    const veterinarian = await this.prisma.staff.findFirst({
      where: { id: dto.veterinarianId, clinicId: auth.clinicId, active: true },
      select: { id: true },
    });
    if (!veterinarian) {
      throw new BadRequestException({
        code: 'VETERINARIAN_NOT_FOUND',
        message: 'Atanan hekim bulunamadı',
      });
    }

    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findFirst({
        where: {
          id: dto.appointmentId,
          clinicId: auth.clinicId,
          branchId: patient.branchId,
          patientId: patient.id,
        },
        select: { id: true },
      });
      if (!appointment) {
        throw new BadRequestException({
          code: 'APPOINTMENT_MISMATCH',
          message: 'Randevu bu hasta/şube ile eşleşmiyor',
        });
      }
    }

    const encounter = await this.prisma.encounter.create({
      data: {
        clinicId: auth.clinicId,
        branchId: patient.branchId,
        patientId: patient.id,
        ownerId: patient.ownerId,
        veterinarianId: veterinarian.id,
        appointmentId: dto.appointmentId ?? null,
        chiefComplaint: dto.chiefComplaint ?? null,
        subjective: dto.subjective ?? null,
        objective: dto.objective ?? null,
        assessment: dto.assessment ?? null,
        plan: dto.plan ?? null,
        notes: dto.notes ?? null,
        status: 'draft',
        createdById: auth.staffId,
      },
      include: ENCOUNTER_DETAIL_INCLUDE,
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: encounter.branchId,
        action: 'ENCOUNTER_CREATED',
        entityType: 'Encounter',
        entityId: encounter.id,
        metadata: { patientId: patient.id, veterinarianId: veterinarian.id },
      },
      request,
    );
    return encounter;
  }

  /** SOAP alanları kaydet (kabul kriteri 1). Yalnız editable durumda. */
  async update(auth: AuthContext, encounterId: string, dto: UpdateEncounterDto, request: AuthRequest) {
    const encounter = await this.getEncounterOr404(auth.clinicId, encounterId, false);
    this.assertEncounterScope(auth, request, encounter);
    this.assertEditable(encounter.status);

    const updated = await this.prisma.encounter.update({
      where: { id: encounter.id },
      data: {
        ...(dto.chiefComplaint !== undefined ? { chiefComplaint: dto.chiefComplaint } : {}),
        ...(dto.subjective !== undefined ? { subjective: dto.subjective } : {}),
        ...(dto.objective !== undefined ? { objective: dto.objective } : {}),
        ...(dto.assessment !== undefined ? { assessment: dto.assessment } : {}),
        ...(dto.plan !== undefined ? { plan: dto.plan } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.veterinarianId ? { veterinarianId: dto.veterinarianId } : {}),
        ...(dto.status === 'in_progress' && encounter.status === 'draft'
          ? { status: 'in_progress' }
          : {}),
        version: { increment: 1 },
      },
      include: ENCOUNTER_DETAIL_INCLUDE,
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: updated.branchId,
        action: 'ENCOUNTER_UPDATED',
        entityType: 'Encounter',
        entityId: updated.id,
        metadata: { fields: Object.keys(dto), version: updated.version },
      },
      request,
    );
    return updated;
  }

  /** İmza — yalnızca clinical.sign izni (controller) ve editable durum. */
  async sign(auth: AuthContext, encounterId: string, request: AuthRequest) {
    const encounter = await this.getEncounterOr404(auth.clinicId, encounterId, false);
    this.assertEncounterScope(auth, request, encounter);
    this.assertEditable(encounter.status);

    const updated = await this.prisma.encounter.update({
      where: { id: encounter.id },
      data: {
        status: 'signed',
        signedAt: new Date(),
        signedById: auth.staffId,
        version: { increment: 1 },
      },
      include: ENCOUNTER_DETAIL_INCLUDE,
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: updated.branchId,
        action: 'ENCOUNTER_SIGNED',
        entityType: 'Encounter',
        entityId: updated.id,
        metadata: { version: updated.version },
      },
      request,
    );
    return updated;
  }

  async close(auth: AuthContext, encounterId: string, request: AuthRequest) {
    const encounter = await this.getEncounterOr404(auth.clinicId, encounterId, false);
    this.assertEncounterScope(auth, request, encounter);
    if (encounter.status !== 'signed') {
      throw new ConflictException({
        code: ENCOUNTER_ERROR_CODES.INVALID_TRANSITION,
        message: 'Kapatma yalnızca imzalı kayıt için mümkündür',
      });
    }
    const updated = await this.prisma.encounter.update({
      where: { id: encounter.id },
      data: { status: 'closed', closedAt: new Date() },
      include: ENCOUNTER_DETAIL_INCLUDE,
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: updated.branchId,
        action: 'ENCOUNTER_CLOSED',
        entityType: 'Encounter',
        entityId: updated.id,
      },
      request,
    );
    return updated;
  }

  async void(auth: AuthContext, encounterId: string, reason: string, request: AuthRequest) {
    const encounter = await this.getEncounterOr404(auth.clinicId, encounterId, false);
    this.assertEncounterScope(auth, request, encounter);
    this.assertEditable(encounter.status);
    const updated = await this.prisma.encounter.update({
      where: { id: encounter.id },
      data: { status: 'voided', voidedAt: new Date(), notes: reason },
      include: ENCOUNTER_DETAIL_INCLUDE,
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: updated.branchId,
        action: 'ENCOUNTER_VOIDED',
        entityType: 'Encounter',
        entityId: updated.id,
        metadata: { reason },
      },
      request,
    );
    return updated;
  }

  /** Fiziksel silme yalnızca draft'ta (taslakta geçmiş denetim değeri yok). */
  async remove(auth: AuthContext, encounterId: string, request: AuthRequest) {
    const encounter = await this.getEncounterOr404(auth.clinicId, encounterId, false);
    this.assertEncounterScope(auth, request, encounter);
    if (encounter.status !== 'draft') {
      throw new ConflictException({
        code: ENCOUNTER_ERROR_CODES.SIGNED,
        message: 'Taslak dışındaki muayene kayıtları silinemez (void kullanın)',
      });
    }
    await this.prisma.encounter.delete({ where: { id: encounter.id } });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: encounter.branchId,
        action: 'ENCOUNTER_DELETED',
        entityType: 'Encounter',
        entityId: encounter.id,
      },
      request,
    );
    return { deleted: true };
  }

  // ---- Vital bulgular ------------------------------------------------------

  /** Vital ekle — her kayıt yeni satırdır, geçmiş korunur (kabul kriteri 2). */
  async addVital(auth: AuthContext, encounterId: string, dto: AddVitalDto, request: AuthRequest) {
    const encounter = await this.getEncounterOr404(auth.clinicId, encounterId, false);
    this.assertEncounterScope(auth, request, encounter);
    this.assertEditable(encounter.status);
    const vital = await this.prisma.vitalObservation.create({
      data: {
        patientId: encounter.patientId,
        encounterId: encounter.id,
        kind: dto.kind,
        value: new Prisma.Decimal(dto.value.toFixed(3)),
        unit: dto.unit,
        measuredAt: new Date(dto.measuredAt),
        note: dto.note ?? null,
        createdByStaffId: auth.staffId,
      },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: encounter.branchId,
        action: 'VITAL_RECORDED',
        entityType: 'VitalObservation',
        entityId: vital.id,
        metadata: { encounterId: encounter.id, kind: dto.kind, value: dto.value, unit: dto.unit },
      },
      request,
    );
    return vital;
  }

  /** Hasta vital geçmişi — aynı kind için tüm ölçümler (kabul kriteri 2). */
  async patientVitals(auth: AuthContext, request: AuthRequest, patientId: string, kind?: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId: auth.clinicId },
      select: { branchId: true },
    });
    if (!patient) {
      throw new NotFoundException({ code: 'PATIENT_NOT_FOUND', message: 'Hasta bulunamadı' });
    }
    this.requireBranchAccess(auth, request, patient.branchId);
    const items = await this.prisma.vitalObservation.findMany({
      where: { patientId, ...(kind ? { kind } : {}) },
      orderBy: { measuredAt: 'desc' as const },
      take: 200,
    });
    return { items };
  }

  // ---- Tanılar ---------------------------------------------------------------

  async addDiagnosis(auth: AuthContext, encounterId: string, dto: AddDiagnosisDto, request: AuthRequest) {
    const encounter = await this.getEncounterOr404(auth.clinicId, encounterId, false);
    this.assertEncounterScope(auth, request, encounter);
    this.assertEditable(encounter.status);
    const diagnosis = await this.prisma.diagnosis.create({
      data: {
        encounterId: encounter.id,
        code: dto.code ?? null,
        name: dto.name,
        kind: dto.kind ?? 'primary',
        note: dto.note ?? null,
      },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: encounter.branchId,
        action: 'DIAGNOSIS_ADDED',
        entityType: 'Diagnosis',
        entityId: diagnosis.id,
        metadata: { encounterId: encounter.id, name: dto.name, kind: diagnosis.kind },
      },
      request,
    );
    return diagnosis;
  }

  async removeDiagnosis(auth: AuthContext, encounterId: string, diagnosisId: string, request: AuthRequest) {
    const encounter = await this.getEncounterOr404(auth.clinicId, encounterId, false);
    this.assertEncounterScope(auth, request, encounter);
    this.assertEditable(encounter.status);
    const diagnosis = await this.prisma.diagnosis.findFirst({
      where: { id: diagnosisId, encounterId: encounter.id },
    });
    if (!diagnosis) {
      throw new NotFoundException({ code: 'DIAGNOSIS_NOT_FOUND', message: 'Tanı bulunamadı' });
    }
    await this.prisma.diagnosis.delete({ where: { id: diagnosis.id } });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: encounter.branchId,
        action: 'DIAGNOSIS_REMOVED',
        entityType: 'Diagnosis',
        entityId: diagnosis.id,
      },
      request,
    );
    return { deleted: true };
  }

  // ---- Ekler -----------------------------------------------------------------

  async addAttachment(auth: AuthContext, encounterId: string, dto: CreateAttachmentDto, request: AuthRequest) {
    const encounter = await this.getEncounterOr404(auth.clinicId, encounterId, false);
    this.assertEncounterScope(auth, request, encounter);
    this.assertEditable(encounter.status);
    const asset = await this.prisma.fileAsset.findFirst({
      where: { id: dto.assetId, clinicId: auth.clinicId },
      select: { id: true, patientId: true },
    });
    if (!asset) {
      throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: 'Dosya bulunamadı' });
    }
    if (asset.patientId !== encounter.patientId) {
      throw new BadRequestException({
        code: ENCOUNTER_ERROR_CODES.ASSET_MISMATCH,
        message: 'Dosya bu hastaya ait değil',
      });
    }
    const attachment = await this.prisma.clinicalAttachment.create({
      data: { encounterId: encounter.id, assetId: asset.id, label: dto.label ?? null },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: encounter.branchId,
        action: 'ENCOUNTER_ATTACHMENT_ADDED',
        entityType: 'ClinicalAttachment',
        entityId: attachment.id,
        metadata: { encounterId: encounter.id, assetId: asset.id },
      },
      request,
    );
    return attachment;
  }

  async removeAttachment(
    auth: AuthContext,
    encounterId: string,
    attachmentId: string,
    request: AuthRequest,
  ) {
    const encounter = await this.getEncounterOr404(auth.clinicId, encounterId, false);
    this.assertEncounterScope(auth, request, encounter);
    this.assertEditable(encounter.status);
    const attachment = await this.prisma.clinicalAttachment.findFirst({
      where: { id: attachmentId, encounterId: encounter.id },
    });
    if (!attachment) {
      throw new NotFoundException({ code: 'ATTACHMENT_NOT_FOUND', message: 'Ek bulunamadı' });
    }
    await this.prisma.clinicalAttachment.delete({ where: { id: attachment.id } });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: encounter.branchId,
        action: 'ENCOUNTER_ATTACHMENT_REMOVED',
        entityType: 'ClinicalAttachment',
        entityId: attachment.id,
      },
      request,
    );
    return { deleted: true };
  }

  // ---- Addendum --------------------------------------------------------------

  /** Addendum yalnız imzalı kayda; orijinal encounter referansı zorunlu alan. */
  async addAddendum(auth: AuthContext, encounterId: string, dto: CreateAddendumDto, request: AuthRequest) {
    const encounter = await this.getEncounterOr404(auth.clinicId, encounterId, false);
    this.assertEncounterScope(auth, request, encounter);
    if (!acceptsAddendum(encounter.status)) {
      throw new ConflictException({
        code: ENCOUNTER_ERROR_CODES.NOT_SIGNED,
        message: 'Addendum yalnızca imzalı kayıtlara eklenebilir',
      });
    }
    const addendum = await this.prisma.clinicalAddendum.create({
      data: {
        encounterId: encounter.id,
        authorStaffId: auth.staffId,
        body: dto.body,
      },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: encounter.branchId,
        action: 'ADDENDUM_CREATED',
        entityType: 'ClinicalAddendum',
        entityId: addendum.id,
        // Kabul kriteri 5: addendum orijinal kaydı referanslar — denetim metadata'sında da taşınır
        metadata: { encounterId: encounter.id, encounterVersion: encounter.version },
      },
      request,
    );
    return addendum;
  }

  // ---- Hizmet kayıtları ------------------------------------------------------

  private buildRecordLines(
    lines: ServiceRecordLineInput[],
    resolved: Map<string, { amount: number; priceId: string; source: string }>,
  ): Prisma.ServiceRecordLineCreateNestedManyWithoutServiceRecordInput['create'] {
    return lines.map((line) => {
      const price = resolved.get(line.serviceId);
      if (!price) {
        // Fiyat yoksa satır kurulmaz — katalog fiyatı eksik hizmet kayda giremez
        throw new ConflictException({
          code: ENCOUNTER_ERROR_CODES.MISSING_PRICE,
          message: 'Bir veya daha fazla hizmet için geçerli fiyat bulunamadı',
        });
      }
      return {
        serviceId: line.serviceId,
        qty: new Prisma.Decimal(line.qty.toFixed(3)),
        unitPrice: new Prisma.Decimal(price.amount.toFixed(2)),
        discount: new Prisma.Decimal((line.discount ?? 0).toFixed(2)),
        tax: new Prisma.Decimal((line.tax ?? 0).toFixed(2)),
        lineTotal: new Prisma.Decimal(
          computeLineTotal(line.qty, price.amount, line.discount ?? 0, line.tax ?? 0),
        ),
      };
    });
  }

  async createServiceRecord(
    auth: AuthContext,
    encounterId: string,
    dto: CreateServiceRecordDto,
    request: AuthRequest,
  ) {
    const encounter = await this.getEncounterOr404(auth.clinicId, encounterId, false);
    this.assertEncounterScope(auth, request, encounter);
    this.assertEditable(encounter.status);

    const serviceIds = [...new Set(dto.lines.map((l) => l.serviceId))];
    const resolved = await this.services.resolvePricesForRecord(
      auth.clinicId,
      encounter.branchId,
      serviceIds,
      new Date(),
    );
    // Eksik fiyatlı hizmetleri hatada açıkça listeleyin (kullanıcı kataloğu düzeltsin)
    const missing = serviceIds.filter((id) => !resolved.has(id));
    if (missing.length > 0) {
      throw new ConflictException({
        code: ENCOUNTER_ERROR_CODES.MISSING_PRICE,
        message: 'Geçerli fiyat bulunamayan hizmetler var',
        missingServiceIds: missing,
      });
    }

    const record = await this.prisma.serviceRecord.create({
      data: {
        clinicId: auth.clinicId,
        encounterId: encounter.id,
        branchId: encounter.branchId,
        status: 'draft',
        createdById: auth.staffId,
        lines: { create: this.buildRecordLines(dto.lines, resolved) as never },
      },
      include: {
        lines: {
          select: {
            id: true,
            qty: true,
            unitPrice: true,
            discount: true,
            tax: true,
            lineTotal: true,
            service: { select: { id: true, code: true, name: true, category: true } },
          },
        },
      },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: encounter.branchId,
        action: 'SERVICE_RECORD_CREATED',
        entityType: 'ServiceRecord',
        entityId: record.id,
        metadata: { encounterId: encounter.id, lineCount: dto.lines.length },
      },
      request,
    );
    return record;
  }

  async replaceServiceRecordLines(
    auth: AuthContext,
    encounterId: string,
    recordId: string,
    dto: CreateServiceRecordDto,
    request: AuthRequest,
  ) {
    const encounter = await this.getEncounterOr404(auth.clinicId, encounterId, false);
    this.assertEncounterScope(auth, request, encounter);
    this.assertEditable(encounter.status);
    const record = await this.prisma.serviceRecord.findFirst({
      where: { id: recordId, encounterId: encounter.id },
      select: { id: true, status: true },
    });
    if (!record) {
      throw new NotFoundException({ code: 'SERVICE_RECORD_NOT_FOUND', message: 'Hizmet kaydı bulunamadı' });
    }
    if (record.status !== 'draft') {
      throw new ConflictException({
        code: 'SERVICE_RECORD_FINALIZED',
        message: 'Kesinleşmiş hizmet kaydı değiştirilemez',
      });
    }
    const serviceIds = [...new Set(dto.lines.map((l) => l.serviceId))];
    const resolved = await this.services.resolvePricesForRecord(
      auth.clinicId,
      encounter.branchId,
      serviceIds,
      new Date(),
    );
    const missing = serviceIds.filter((id) => !resolved.has(id));
    if (missing.length > 0) {
      throw new ConflictException({
        code: ENCOUNTER_ERROR_CODES.MISSING_PRICE,
        message: 'Geçerli fiyat bulunamayan hizmetler var',
        missingServiceIds: missing,
      });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.serviceRecordLine.deleteMany({ where: { serviceRecordId: record.id } });
      return tx.serviceRecord.update({
        where: { id: record.id },
        data: { lines: { create: this.buildRecordLines(dto.lines, resolved) as never } },
        include: {
          lines: {
            select: {
              id: true,
              qty: true,
              unitPrice: true,
              discount: true,
              tax: true,
              lineTotal: true,
              service: { select: { id: true, code: true, name: true, category: true } },
            },
          },
        },
      });
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: encounter.branchId,
        action: 'SERVICE_RECORD_UPDATED',
        entityType: 'ServiceRecord',
        entityId: record.id,
        metadata: { encounterId: encounter.id, lineCount: dto.lines.length },
      },
      request,
    );
    return updated;
  }

  /**
   * Hizmet kaydını kesinleştir — Faz 06'da yalnız durum değişir; gerçek stok
   * post'u ve ücretlendirme Faz 08 atomik işlemiyle bağlanır (build prompt: stok
   * post işlemi bu fazda bağlanmaz).
   */
  async finalizeServiceRecord(
    auth: AuthContext,
    encounterId: string,
    recordId: string,
    request: AuthRequest,
  ) {
    const encounter = await this.getEncounterOr404(auth.clinicId, encounterId, false);
    this.assertEncounterScope(auth, request, encounter);
    const record = await this.prisma.serviceRecord.findFirst({
      where: { id: recordId, encounterId: encounter.id },
      select: { id: true, status: true },
    });
    if (!record) {
      throw new NotFoundException({ code: 'SERVICE_RECORD_NOT_FOUND', message: 'Hizmet kaydı bulunamadı' });
    }
    if (record.status !== 'draft') {
      throw new ConflictException({
        code: 'SERVICE_RECORD_FINALIZED',
        message: 'Hizmet kaydı zaten kesinleşmiş',
      });
    }
    const updated = await this.prisma.serviceRecord.update({
      where: { id: record.id },
      data: {
        status: 'finalized',
        performedByStaffId: auth.staffId,
        finalizedAt: new Date(),
      },
      include: {
        lines: {
          select: {
            id: true,
            qty: true,
            unitPrice: true,
            discount: true,
            tax: true,
            lineTotal: true,
            service: { select: { id: true, code: true, name: true, category: true } },
          },
        },
      },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: encounter.branchId,
        action: 'SERVICE_RECORD_FINALIZED',
        entityType: 'ServiceRecord',
        entityId: updated.id,
        metadata: {
          encounterId: encounter.id,
          note: 'Faz 06: stok/finans post yok — Faz 08 atomik işlemde bağlanır',
        },
      },
      request,
    );
    return updated;
  }

  async removeServiceRecord(
    auth: AuthContext,
    encounterId: string,
    recordId: string,
    request: AuthRequest,
  ) {
    const encounter = await this.getEncounterOr404(auth.clinicId, encounterId, false);
    this.assertEncounterScope(auth, request, encounter);
    this.assertEditable(encounter.status);
    const record = await this.prisma.serviceRecord.findFirst({
      where: { id: recordId, encounterId: encounter.id },
      select: { id: true, status: true },
    });
    if (!record) {
      throw new NotFoundException({ code: 'SERVICE_RECORD_NOT_FOUND', message: 'Hizmet kaydı bulunamadı' });
    }
    if (record.status !== 'draft') {
      throw new ConflictException({
        code: 'SERVICE_RECORD_FINALIZED',
        message: 'Kesinleşmiş hizmet kaydı silinemez',
      });
    }
    await this.prisma.serviceRecord.delete({ where: { id: record.id } });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: encounter.branchId,
        action: 'SERVICE_RECORD_DELETED',
        entityType: 'ServiceRecord',
        entityId: record.id,
      },
      request,
    );
    return { deleted: true };
  }
}
