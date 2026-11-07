import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StockService } from '../inventory/stock.service';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import {
  VACCINE_ERROR_CODES,
  addDays,
  classifyDue,
  computeScheduleEntry,
  startOfDay,
  vaccineLotIssue,
} from './vaccines.domain';
import type {
  CreateVaccineEventDto,
  CreateVaccineProtocolDto,
  CreateVaccineReminderDto,
  ListRemindersQueryDto,
  ListVaccineEventsQueryDto,
  SendVaccineReminderDto,
  UpdateVaccineProtocolDto,
} from './vaccines.dto';

/**
 * Aşı servisi — Faz 10.
 *
 * Kurallar:
 * - Aşı kaydı lot + son kullanma tarihini kayıt anında partiden dondurur;
 *   süresi geçmiş (409 LOT_EXPIRED) veya karantinalı (409 LOT_BLOCKED)
 *   partiden aşı uygulanamaz. Uygulama stoğu aynı transaction'da düşer.
 * - Takvim girdileri yalnızca kliniğin protokollerinden türetilir; sabit
 *   evrensel takvim yoktur.
 * - Aynı aşı kaydı için aynı türde ikinci hatırlatma benzersiz kısıtla
 *   engellenir; gönderim ikinci kez istenirse 409 döner.
 */
@Injectable()
export class VaccinesService {
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

  // ── Protokoller (kabul kriteri 5) ──────────────────────────────────────────

  async listProtocols(auth: AuthContext, includeInactive = false) {
    const items = await this.prisma.vaccineProtocol.findMany({
      where: { clinicId: auth.clinicId, ...(includeInactive ? {} : { active: true }) },
      orderBy: { name: 'asc' },
      include: {
        product: { select: { id: true, code: true, name: true } },
        species: { select: { id: true, key: true, name: true } },
      },
    });
    return { items };
  }

  async createProtocol(auth: AuthContext, dto: CreateVaccineProtocolDto, request: AuthRequest) {
    const duplicate = await this.prisma.vaccineProtocol.findFirst({
      where: { clinicId: auth.clinicId, name: dto.name },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: VACCINE_ERROR_CODES.DUPLICATE_NAME,
        message: 'Bu adla bir aşı protokolü zaten var',
      });
    }
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, clinicId: auth.clinicId, active: true },
      select: { id: true },
    });
    if (!product) {
      throw new BadRequestException({ code: 'PRODUCT_NOT_FOUND', message: 'Ürün bulunamadı' });
    }
    if (dto.speciesId) {
      const species = await this.prisma.species.findUnique({ where: { id: dto.speciesId } });
      if (!species) {
        throw new BadRequestException({ code: 'SPECIES_NOT_FOUND', message: 'Tür bulunamadı' });
      }
    }
    const protocol = await this.prisma.vaccineProtocol.create({
      data: {
        clinicId: auth.clinicId,
        productId: dto.productId,
        speciesId: dto.speciesId ?? null,
        name: dto.name,
        firstDoseAgeDays: dto.firstDoseAgeDays,
        boosterIntervalDays: dto.boosterIntervalDays,
        reminderLeadDays: dto.reminderLeadDays,
        doseLabel: dto.doseLabel ?? null,
        route: dto.route ?? null,
        notes: dto.notes ?? null,
      },
      include: {
        product: { select: { id: true, code: true, name: true } },
        species: { select: { id: true, key: true, name: true } },
      },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        action: 'VACCINE_PROTOCOL_CREATED',
        entityType: 'VaccineProtocol',
        entityId: protocol.id,
        metadata: { name: protocol.name, productId: protocol.productId },
      },
      request,
    );
    return protocol;
  }

  async updateProtocol(
    auth: AuthContext,
    id: string,
    dto: UpdateVaccineProtocolDto,
    request: AuthRequest,
  ) {
    const protocol = await this.prisma.vaccineProtocol.findFirst({
      where: { id, clinicId: auth.clinicId },
    });
    if (!protocol) {
      throw new NotFoundException({
        code: VACCINE_ERROR_CODES.PROTOCOL_NOT_FOUND,
        message: 'Aşı protokolü bulunamadı',
      });
    }
    const updated = await this.prisma.vaccineProtocol.update({
      where: { id: protocol.id },
      data: {
        ...(dto.name != null ? { name: dto.name } : {}),
        ...(dto.firstDoseAgeDays != null ? { firstDoseAgeDays: dto.firstDoseAgeDays } : {}),
        ...(dto.boosterIntervalDays != null ? { boosterIntervalDays: dto.boosterIntervalDays } : {}),
        ...(dto.reminderLeadDays != null ? { reminderLeadDays: dto.reminderLeadDays } : {}),
        ...(dto.doseLabel !== undefined ? { doseLabel: dto.doseLabel ?? null } : {}),
        ...(dto.route !== undefined ? { route: dto.route ?? null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
        ...(dto.active != null ? { active: dto.active } : {}),
      },
      include: {
        product: { select: { id: true, code: true, name: true } },
        species: { select: { id: true, key: true, name: true } },
      },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        action: 'VACCINE_PROTOCOL_UPDATED',
        entityType: 'VaccineProtocol',
        entityId: protocol.id,
        metadata: { changes: { ...dto } },
      },
      request,
    );
    return updated;
  }

  // ── Aşı kaydı (kabul kriteri 4) ────────────────────────────────────────────

  async createEvent(auth: AuthContext, dto: CreateVaccineEventDto, request: AuthRequest) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId: auth.clinicId },
      select: { id: true, branchId: true, speciesId: true },
    });
    if (!patient) {
      throw new NotFoundException({
        code: VACCINE_ERROR_CODES.PATIENT_NOT_FOUND,
        message: 'Hasta bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, patient.branchId);
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, clinicId: auth.clinicId, active: true },
    });
    if (!product) {
      throw new BadRequestException({ code: 'PRODUCT_NOT_FOUND', message: 'Ürün bulunamadı' });
    }
    if (product.trackingType !== 'lot') {
      throw new BadRequestException({
        code: VACCINE_ERROR_CODES.LOT_REQUIRED,
        message: 'Aşı kaydı parti (lot) takipli ürün gerektirir',
      });
    }
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, branchId: patient.branchId },
      select: { id: true },
    });
    if (!warehouse) {
      throw new BadRequestException({
        code: 'WAREHOUSE_NOT_FOUND',
        message: 'Depo hastanın şubesinde bulunamadı',
      });
    }
    const lot = await this.prisma.inventoryLot.findFirst({
      where: { id: dto.lotId, productId: product.id, clinicId: auth.clinicId },
    });
    if (!lot || lot.warehouseId !== warehouse.id) {
      throw new NotFoundException({
        code: VACCINE_ERROR_CODES.LOT_NOT_FOUND,
        message: 'Parti bu depoda bulunamadı',
      });
    }
    const issue = vaccineLotIssue(lot);
    if (issue === 'expired') {
      throw new ConflictException({
        code: VACCINE_ERROR_CODES.LOT_EXPIRED,
        message: `Parti ${lot.lotCode} süresi geçmiş — aşı uygulanamaz`,
      });
    }
    if (issue === 'quarantined') {
      throw new ConflictException({
        code: VACCINE_ERROR_CODES.LOT_BLOCKED,
        message: `Parti ${lot.lotCode} karantinada — aşı uygulanamaz`,
      });
    }
    if (dto.encounterId) {
      const encounter = await this.prisma.encounter.findFirst({
        where: { id: dto.encounterId, clinicId: auth.clinicId },
        select: { id: true, patientId: true },
      });
      if (!encounter || encounter.patientId !== patient.id) {
        throw new BadRequestException({
          code: 'ENCOUNTER_MISMATCH',
          message: 'Muayene hasta ile eşleşmiyor',
        });
      }
    }
    let protocol = null;
    if (dto.protocolId) {
      protocol = await this.prisma.vaccineProtocol.findFirst({
        where: { id: dto.protocolId, clinicId: auth.clinicId },
      });
      if (!protocol) {
        throw new NotFoundException({
          code: VACCINE_ERROR_CODES.PROTOCOL_NOT_FOUND,
          message: 'Aşı protokolü bulunamadı',
        });
      }
    }
    const administeredAt = dto.administeredAt ? new Date(dto.administeredAt) : new Date();
    const nextDueAt = protocol
      ? addDays(administeredAt, protocol.boosterIntervalDays)
      : null;
    if (dto.idempotencyKey) {
      const existing = await this.prisma.vaccineEvent.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
    }
    try {
      const event = await this.prisma.$transaction(async (tx) => {
        const created = await tx.vaccineEvent.create({
          data: {
            clinicId: auth.clinicId,
            branchId: patient.branchId,
            patientId: patient.id,
            protocolId: protocol?.id ?? null,
            productId: product.id,
            warehouseId: warehouse.id,
            lotId: lot.id,
            lotCode: lot.lotCode,
            expiresAt: lot.expiresAt,
            encounterId: dto.encounterId ?? null,
            administeredByStaffId: auth.staffId,
            administeredAt,
            doseLabel: dto.doseLabel ?? protocol?.doseLabel ?? null,
            route: dto.route ?? protocol?.route ?? null,
            site: dto.site ?? null,
            note: dto.note ?? null,
            nextDueAt,
            idempotencyKey: dto.idempotencyKey ?? null,
          },
        });
        const posted = await this.stock.postConsumptionForRef(tx, {
          clinicId: auth.clinicId,
          branchId: patient.branchId,
          warehouseId: warehouse.id,
          productId: product.id,
          qty: dto.qty ?? 1,
          lotId: lot.id,
          refType: 'VaccineEvent',
          refId: created.id,
          staffId: auth.staffId,
          idempotencyKey: dto.idempotencyKey ?? null,
          note: dto.note ?? null,
        });
        return { created, movementId: posted.movementId };
      });
      await this.recordAudit(
        {
          clinicId: auth.clinicId,
          staffId: auth.staffId,
          branchId: patient.branchId,
          action: 'VACCINE_RECORDED',
          entityType: 'VaccineEvent',
          entityId: event.created.id,
          metadata: {
            patientId: patient.id,
            productId: product.id,
            lotCode: lot.lotCode,
            expiresAt: lot.expiresAt,
            protocolId: protocol?.id ?? null,
            nextDueAt,
            movementId: event.movementId,
          },
        },
        request,
      );
      return this.prisma.vaccineEvent.findUnique({
        where: { id: event.created.id },
        include: {
          patient: { select: { id: true, name: true, code: true } },
          product: { select: { id: true, code: true, name: true } },
          lot: { select: { id: true, lotCode: true, expiresAt: true, status: true } },
          protocol: { select: { id: true, name: true, boosterIntervalDays: true } },
          administeredBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        dto.idempotencyKey
      ) {
        const raced = await this.prisma.vaccineEvent.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (raced) return raced;
      }
      throw error;
    }
  }

  async listEvents(auth: AuthContext, query: ListVaccineEventsQueryDto) {
    const branchFilter: Prisma.VaccineEventWhereInput = auth.allBranches
      ? {}
      : { branchId: { in: auth.branchIds } };
    const items = await this.prisma.vaccineEvent.findMany({
      where: {
        clinicId: auth.clinicId,
        ...branchFilter,
        ...(query.patientId ? { patientId: query.patientId } : {}),
        ...(query.productId ? { productId: query.productId } : {}),
      },
      orderBy: { administeredAt: 'desc' },
      take: query.take ?? 50,
      include: {
        patient: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, code: true, name: true } },
        lot: { select: { id: true, lotCode: true, expiresAt: true } },
        protocol: { select: { id: true, name: true } },
        administeredBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return { items };
  }

  // ── Takvim (kabul kriteri 5) ───────────────────────────────────────────────

  /**
   * Hasta aşı takvimi — yalnızca kliniğin aktif protokollerinden türetilir.
   * Tür eşleşmesi: protokol türsüzse tüm hastalar; tür verilmişse hastanın
   * türüyle eşleşen protokoller. Sabit evrensel takvim üretilmez.
   */
  async schedule(auth: AuthContext, patientId: string, request: AuthRequest) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId: auth.clinicId },
      select: { id: true, branchId: true, speciesId: true, birthDate: true, name: true, code: true },
    });
    if (!patient) {
      throw new NotFoundException({
        code: VACCINE_ERROR_CODES.PATIENT_NOT_FOUND,
        message: 'Hasta bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, patient.branchId);
    const protocols = await this.prisma.vaccineProtocol.findMany({
      where: {
        clinicId: auth.clinicId,
        active: true,
        OR: [{ speciesId: null }, ...(patient.speciesId ? [{ speciesId: patient.speciesId }] : [])],
      },
      include: {
        product: { select: { id: true, code: true, name: true } },
        species: { select: { id: true, key: true, name: true } },
      },
    });
    const today = startOfDay(new Date());
    const entries = [];
    for (const protocol of protocols) {
      const lastEvent = await this.prisma.vaccineEvent.findFirst({
        where: { patientId: patient.id, productId: protocol.productId },
        orderBy: { administeredAt: 'desc' },
        select: { id: true, administeredAt: true },
      });
      const computed = computeScheduleEntry({
        birthDate: patient.birthDate,
        firstDoseAgeDays: protocol.firstDoseAgeDays,
        boosterIntervalDays: protocol.boosterIntervalDays,
        lastAdministeredAt: lastEvent?.administeredAt ?? null,
        today,
      });
      if (!computed) continue;
      entries.push({
        protocolId: protocol.id,
        protocolName: protocol.name,
        product: protocol.product,
        doseLabel: protocol.doseLabel,
        dueAt: computed.dueAt.toISOString(),
        basis: computed.basis,
        classification: classifyDue(computed.dueAt, today, protocol.reminderLeadDays),
        lastEventId: lastEvent?.id ?? null,
      });
    }
    entries.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return { patient: { id: patient.id, name: patient.name, code: patient.code }, entries };
  }

  // ── Hatırlatmalar (kabul kriteri 6) ────────────────────────────────────────

  async listReminders(auth: AuthContext, query: ListRemindersQueryDto) {
    const today = startOfDay(new Date());
    const horizonEnd = addDays(today, query.horizonDays ?? 30);
    let dueFilter: Prisma.DateTimeFilter | undefined;
    let statusFilter: string | undefined;
    if (query.window === 'overdue') {
      dueFilter = { lt: today };
      statusFilter = 'scheduled';
    } else if (query.window === 'upcoming') {
      dueFilter = { gte: today, lte: horizonEnd };
      statusFilter = 'scheduled';
    } else if (query.window) {
      statusFilter = query.window;
    }
    const items = await this.prisma.vaccineReminder.findMany({
      where: {
        clinicId: auth.clinicId,
        ...(query.patientId ? { patientId: query.patientId } : {}),
        ...(dueFilter ? { dueAt: dueFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: { dueAt: 'asc' },
      take: query.take ?? 100,
      include: {
        patient: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, code: true, name: true } },
        vaccineEvent: { select: { id: true, lotCode: true, expiresAt: true, administeredAt: true } },
      },
    });
    return { items };
  }

  /** Aşı kaydı için hatırlatma üretir — aynı event+kind ikinci kez yazılamaz. */
  async createReminderForEvent(
    auth: AuthContext,
    eventId: string,
    dto: CreateVaccineReminderDto,
    request: AuthRequest,
  ) {
    const event = await this.prisma.vaccineEvent.findFirst({
      where: { id: eventId, clinicId: auth.clinicId },
      include: { protocol: { select: { id: true, reminderLeadDays: true, boosterIntervalDays: true } } },
    });
    if (!event) {
      throw new NotFoundException({
        code: VACCINE_ERROR_CODES.EVENT_NOT_FOUND,
        message: 'Aşı kaydı bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, event.branchId);
    const kind = dto.kind ?? 'booster_due';
    const duplicate = await this.prisma.vaccineReminder.findFirst({
      where: { vaccineEventId: event.id, kind },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: VACCINE_ERROR_CODES.REMINDER_DUPLICATE,
        message: 'Bu aşı kaydı için hatırlatma zaten var',
      });
    }
    const defaultDue =
      event.nextDueAt != null && event.protocol
        ? addDays(event.nextDueAt, -event.protocol.reminderLeadDays)
        : addDays(event.administeredAt, event.protocol?.boosterIntervalDays ?? 365);
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : defaultDue;
    try {
      const reminder = await this.prisma.vaccineReminder.create({
        data: {
          clinicId: auth.clinicId,
          branchId: event.branchId,
          patientId: event.patientId,
          vaccineEventId: event.id,
          productId: event.productId,
          kind,
          dueAt,
          note: dto.note ?? null,
        },
        include: {
          patient: { select: { id: true, name: true, code: true } },
          product: { select: { id: true, code: true, name: true } },
        },
      });
      await this.recordAudit(
        {
          clinicId: auth.clinicId,
          staffId: auth.staffId,
          branchId: event.branchId,
          action: 'VACCINE_REMINDER_CREATED',
          entityType: 'VaccineReminder',
          entityId: reminder.id,
          metadata: { vaccineEventId: event.id, kind, dueAt: reminder.dueAt },
        },
        request,
      );
      return reminder;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: VACCINE_ERROR_CODES.REMINDER_DUPLICATE,
          message: 'Bu aşı kaydı için hatırlatma zaten var',
        });
      }
      throw error;
    }
  }

  /**
   * Hatırlatma gönderimi — kanal kaydı + denetim yazımı (gerçek bildirim
   * trafiği Faz 12 entegrasyonuna bağlıdır). Aynı hatırlatma ikinci kez
   * gönderilemez: 409 REMINDER_ALREADY_SENT.
   */
  async sendReminder(
    auth: AuthContext,
    reminderId: string,
    dto: SendVaccineReminderDto,
    request: AuthRequest,
  ) {
    const reminder = await this.prisma.vaccineReminder.findFirst({
      where: { id: reminderId, clinicId: auth.clinicId },
    });
    if (!reminder) {
      throw new NotFoundException({
        code: VACCINE_ERROR_CODES.REMINDER_NOT_FOUND,
        message: 'Hatırlatma bulunamadı',
      });
    }
    if (reminder.status === 'sent') {
      throw new ConflictException({
        code: VACCINE_ERROR_CODES.REMINDER_ALREADY_SENT,
        message: 'Hatırlatma zaten gönderildi — yinelenemez',
      });
    }
    const updated = await this.prisma.vaccineReminder.update({
      where: { id: reminder.id },
      data: {
        status: 'sent',
        sentAt: new Date(),
        sentByStaffId: auth.staffId,
        channel: dto.channel ?? 'phone',
      },
      include: {
        patient: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, code: true, name: true } },
      },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: reminder.branchId,
        action: 'VACCINE_REMINDER_SENT',
        entityType: 'VaccineReminder',
        entityId: reminder.id,
        metadata: { patientId: reminder.patientId, kind: reminder.kind, channel: updated.channel },
      },
      request,
    );
    return updated;
  }

  async dismissReminder(auth: AuthContext, reminderId: string, request: AuthRequest) {
    const reminder = await this.prisma.vaccineReminder.findFirst({
      where: { id: reminderId, clinicId: auth.clinicId },
    });
    if (!reminder) {
      throw new NotFoundException({
        code: VACCINE_ERROR_CODES.REMINDER_NOT_FOUND,
        message: 'Hatırlatma bulunamadı',
      });
    }
    if (reminder.status === 'sent') {
      throw new ConflictException({
        code: VACCINE_ERROR_CODES.REMINDER_ALREADY_SENT,
        message: 'Gönderilmiş hatırlatma ertelenemez',
      });
    }
    const updated = await this.prisma.vaccineReminder.update({
      where: { id: reminder.id },
      data: { status: 'dismissed' },
      include: { patient: { select: { id: true, name: true, code: true } } },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: reminder.branchId,
        action: 'VACCINE_REMINDER_DISMISSED',
        entityType: 'VaccineReminder',
        entityId: reminder.id,
        metadata: { patientId: reminder.patientId, kind: reminder.kind },
      },
      request,
    );
    return updated;
  }
}
