import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  ACTIVE_STATUSES,
  assertTransition,
  evaluateSchedulePolicy,
  InvalidTransitionError,
  localDayRange,
  pickConflictingAppointment,
  todayISO,
  type AppointmentStatus,
} from './appointments.domain';
import type { AuthContext } from '../common/auth/auth-context';
import type { AuthRequest } from '../common/auth/auth-context';
import type {
  AppointmentStatusDto,
  CancelAppointmentDto,
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from './appointments.dto';

const APPOINTMENT_INCLUDE = {
  patient: {
    select: {
      id: true,
      name: true,
      code: true,
      branchId: true,
      ownerId: true,
      alerts: {
        where: { active: true },
        select: { kind: true, label: true, severity: true },
        orderBy: { createdAt: 'desc' as const },
      },
    },
  },
  owner: { select: { id: true, firstName: true, lastName: true } },
  type: { select: { id: true, name: true, colorKey: true, durationMin: true } },
  staff: { select: { id: true, firstName: true, lastName: true, title: true } },
  room: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true, code: true } },
} satisfies Prisma.AppointmentInclude;

export type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: typeof APPOINTMENT_INCLUDE;
}>;

/** Stabil hata kodları — web istemcisi override akışını bu kodlarla ayırt eder. */
export const APPOINTMENT_ERROR_CODES = {
  CONFLICT: 'APPOINTMENT_CONFLICT',
  OUTSIDE_WORKING_HOURS: 'APPOINTMENT_OUTSIDE_WORKING_HOURS',
  BLOCKED: 'APPOINTMENT_BLOCKED',
  INVALID_TRANSITION: 'APPOINTMENT_INVALID_TRANSITION',
} as const;

/** Serializable çakışma kontrolü için P2034 (optimistik yazma çatışması) yeniden dener. */
async function withSerializableRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Randevu ve akış panosu servisi — Faz 05.
 *
 * Kabul kriterleri servis seviyesinde uygulanır:
 * 1. Aynı hekim/oda çakışması Serializable transaction içinde engellenir.
 * 2. Çalışma saati dışı randevu politikaya göre 422 ile reddedilir; yalnızca
 *    appointment.override izni olan personel gerekçe ile geçebilir.
 * 3. Durum geçişleri ileri yönlü makineyle sınırlıdır.
 * 4. Check-in 'arrived' durumunu yazar; akış panosu gerçek randevu satırlarından
 *    türetilir (ayrı bir pano tablosu yok).
 * 5. Şube/hekim/oda filtreleri sorgu seviyesinde uygulanır.
 * 6. Saat dilimi hesapları Clinic.timezone (Europe/Istanbul) ile yapılır.
 */
@Injectable()
export class AppointmentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async clinicTimezone(clinicId: string): Promise<string> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { timezone: true },
    });
    return clinic?.timezone ?? 'Europe/Istanbul';
  }

  /** Şube filtresi: guard çözümü varsa o şube; allBranches ise klinik geneli. */
  private branchFilter(auth: AuthContext, request: AuthRequest) {
    if (request.branchId) return { branchId: request.branchId };
    if (auth.allBranches) return {};
    return { branchId: { in: auth.branchIds } };
  }

  private async getAppointmentOr404(
    clinicId: string,
    id: string,
  ): Promise<AppointmentWithRelations> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, clinicId },
      include: APPOINTMENT_INCLUDE,
    });
    if (!appointment) throw new NotFoundException('Randevu bulunamadı');
    return appointment;
  }

  private async assertAppointmentAccess(
    auth: AuthContext,
    appointment: { branchId: string; clinicId: string },
  ): Promise<void> {
    if (appointment.clinicId !== auth.clinicId) {
      throw new NotFoundException('Randevu bulunamadı');
    }
    if (!auth.allBranches && !auth.branchIds.includes(appointment.branchId)) {
      throw new ForbiddenException('Bu şube için yetkiniz yok');
    }
  }

  /**
   * Çalışma saati politikasını değerlendirir; 'outside' durumunda override
   * yoksa 422 (stabil kod), override varsa yetki + zorunlu gerekçe doğrular
   * ve override kaydını döndürür. 'blocked' her koşulda 409'dur.
   */
  private async resolveSchedulePolicy(
    auth: AuthContext,
    input: {
      branchId: string;
      staffId: string;
      start: Date;
      end: Date;
      allowOutsideHours?: boolean;
      overrideReason?: string;
      timeZone: string;
    },
  ): Promise<{ overrideReason: string | null; overriddenByStaffId: string | null }> {
    const blocks = await this.prisma.scheduleBlock.findMany({
      where: {
        clinicId: auth.clinicId,
        branchId: input.branchId,
        active: true,
        OR: [{ staffId: input.staffId }, { staffId: null }],
      },
    });
    const verdict = evaluateSchedulePolicy({
      blocks,
      staffId: input.staffId,
      start: input.start,
      end: input.end,
      timeZone: input.timeZone,
    });

    if (verdict.verdict === 'ok') return { overrideReason: null, overriddenByStaffId: null };

    if (verdict.verdict === 'blocked') {
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          code: APPOINTMENT_ERROR_CODES.BLOCKED,
          message: `Randevu plan engeliyle çakışıyor${verdict.note ? `: ${verdict.note}` : ''}`,
        },
        HttpStatus.CONFLICT,
      );
    }

    // 'outside' — politika reddi veya yetkili override
    if (!input.allowOutsideHours) {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          code: APPOINTMENT_ERROR_CODES.OUTSIDE_WORKING_HOURS,
          message: 'Randevu çalışma saatleri dışında — yetkili onayı gerekir',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (!auth.permissions.includes('appointment.override')) {
      throw new ForbiddenException(
        'Randevu kural istisnası için yetkiniz yok (appointment.override)',
      );
    }
    const reason = input.overrideReason?.trim() ?? '';
    if (reason.length < 3) {
      throw new BadRequestException(
        'Çalışma saati dışı randevu için gerekçe zorunludur (en az 3 karakter)',
      );
    }
    return { overrideReason: reason, overriddenByStaffId: auth.staffId };
  }

  /** Randevu listesi — takvim gün/hafta/ay aralığı + hekim/oda/hasta/durum filtreleri. */
  async list(
    auth: AuthContext,
    request: AuthRequest,
    query: {
      from?: string;
      to?: string;
      staffId?: string;
      roomId?: string;
      patientId?: string;
      includeClosed?: string;
    },
  ) {
    const timeZone = await this.clinicTimezone(auth.clinicId);
    const today = todayISO(timeZone);
    const { start: defaultStart } = localDayRange(today, timeZone);
    const from = query.from ? new Date(query.from) : defaultStart;
    const to = query.to
      ? new Date(query.to)
      : new Date(from.getTime() + 24 * 60 * 60_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('from/to geçerli ISO zaman damgası olmalıdır');
    }
    if (to <= from) {
      throw new BadRequestException('to aralığı from tarihinden sonra olmalıdır');
    }

    const includeClosed = query.includeClosed !== 'false';
    const appointments = await this.prisma.appointment.findMany({
      where: {
        clinicId: auth.clinicId,
        ...this.branchFilter(auth, request),
        scheduledStart: { gte: from, lt: to },
        ...(query.staffId ? { staffId: query.staffId } : {}),
        ...(query.roomId ? { roomId: query.roomId } : {}),
        ...(query.patientId ? { patientId: query.patientId } : {}),
        ...(includeClosed ? {} : { status: { in: [...ACTIVE_STATUSES] } }),
      },
      orderBy: { scheduledStart: 'asc' },
      include: APPOINTMENT_INCLUDE,
    });
    return appointments;
  }

  async detail(auth: AuthContext, id: string): Promise<AppointmentWithRelations> {
    const appointment = await this.getAppointmentOr404(auth.clinicId, id);
    await this.assertAppointmentAccess(auth, appointment);
    return appointment;
  }

  async create(auth: AuthContext, request: AuthRequest, dto: CreateAppointmentDto) {
    const branchId = request.branchId;
    if (!branchId) {
      throw new BadRequestException('Randevu için şube belirtilmelidir');
    }
    const timeZone = await this.clinicTimezone(auth.clinicId);

    const start = new Date(dto.startAt);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException('startAt geçerli bir ISO zaman damgası olmalıdır');
    }
    const type = await this.prisma.appointmentType.findFirst({
      where: { id: dto.appointmentTypeId, clinicId: auth.clinicId, active: true },
    });
    if (!type) throw new NotFoundException('Randevu türü bulunamadı');
    const end = dto.endAt ? new Date(dto.endAt) : new Date(start.getTime() + type.durationMin * 60_000);
    if (Number.isNaN(end.getTime())) {
      throw new BadRequestException('endAt geçerli bir ISO zaman damgası olmalıdır');
    }
    if (end <= start) {
      throw new BadRequestException('Randevu bitişi başlangıçtan sonra olmalıdır');
    }
    if (end.getTime() - start.getTime() > 10 * 60 * 60_000) {
      throw new BadRequestException('Randevu süresi 10 saati aşamaz');
    }

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId: auth.clinicId, archivedAt: null },
      select: { id: true, branchId: true, ownerId: true },
    });
    if (!patient) throw new NotFoundException('Hasta bulunamadı');
    const staff = await this.prisma.staff.findFirst({
      where: { id: dto.staffId, clinicId: auth.clinicId, active: true },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Personel bulunamadı');
    if (dto.roomId) {
      const room = await this.prisma.room.findFirst({
        where: { id: dto.roomId, branchId },
        select: { id: true },
      });
      if (!room) throw new NotFoundException('Oda bu şubede bulunamadı');
    }

    const policy = await this.resolveSchedulePolicy(auth, {
      branchId,
      staffId: dto.staffId,
      start,
      end,
      allowOutsideHours: dto.allowOutsideHours,
      overrideReason: dto.overrideReason,
      timeZone,
    });

    const created = await withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const overlapping = await tx.appointment.findMany({
            where: {
              clinicId: auth.clinicId,
              status: { in: [...ACTIVE_STATUSES] },
              scheduledStart: { lt: end },
              scheduledEnd: { gt: start },
              OR: [{ staffId: dto.staffId }, ...(dto.roomId ? [{ roomId: dto.roomId }] : [])],
            },
            select: { id: true, staffId: true, roomId: true },
          });
          const conflict = pickConflictingAppointment(overlapping, {
            staffId: dto.staffId,
            roomId: dto.roomId,
          });
          if (conflict) {
            throw new HttpException(
              {
                statusCode: HttpStatus.CONFLICT,
                code: APPOINTMENT_ERROR_CODES.CONFLICT,
                message: 'Aynı hekim veya oda için çakışan aktif randevu var',
              },
              HttpStatus.CONFLICT,
            );
          }
          return tx.appointment.create({
            data: {
              clinicId: auth.clinicId,
              branchId,
              patientId: patient.id,
              ownerId: patient.ownerId,
              appointmentTypeId: type.id,
              staffId: staff.id,
              roomId: dto.roomId ?? null,
              scheduledStart: start,
              scheduledEnd: end,
              status: 'scheduled',
              notes: dto.notes?.trim() || null,
              overrideReason: policy.overrideReason,
              overriddenByStaffId: policy.overriddenByStaffId,
              createdById: auth.staffId,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId,
      action: 'appointment.create',
      entityType: 'Appointment',
      entityId: created.id,
      metadata: {
        patientId: patient.id,
        staffId: staff.id,
        scheduledStart: start.toISOString(),
        overrideReason: policy.overrideReason ?? undefined,
      },
    });

    return this.getAppointmentOr404(auth.clinicId, created.id);
  }

  async update(auth: AuthContext, id: string, dto: UpdateAppointmentDto) {
    const existing = await this.getAppointmentOr404(auth.clinicId, id);
    await this.assertAppointmentAccess(auth, existing);
    const timeZone = await this.clinicTimezone(auth.clinicId);

    const start = dto.startAt ? new Date(dto.startAt) : existing.scheduledStart;
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException('startAt geçerli bir ISO zaman damgası olmalıdır');
    }
    let type = existing.type;
    if (dto.appointmentTypeId && dto.appointmentTypeId !== existing.appointmentTypeId) {
      const newType = await this.prisma.appointmentType.findFirst({
        where: { id: dto.appointmentTypeId, clinicId: auth.clinicId, active: true },
      });
      if (!newType) throw new NotFoundException('Randevu türü bulunamadı');
      type = newType;
    }
    const end = dto.endAt ? new Date(dto.endAt) : new Date(start.getTime() + type.durationMin * 60_000);
    if (Number.isNaN(end.getTime())) {
      throw new BadRequestException('endAt geçerli bir ISO zaman damgası olmalıdır');
    }
    if (end <= start) {
      throw new BadRequestException('Randevu bitişi başlangıçtan sonra olmalıdır');
    }

    const staffId = dto.staffId ?? existing.staffId;
    if (dto.staffId && dto.staffId !== existing.staffId) {
      const staff = await this.prisma.staff.findFirst({
        where: { id: dto.staffId, clinicId: auth.clinicId, active: true },
        select: { id: true },
      });
      if (!staff) throw new NotFoundException('Personel bulunamadı');
    }
    const roomId = dto.roomId !== undefined ? dto.roomId : existing.roomId;
    if (dto.roomId) {
      const room = await this.prisma.room.findFirst({
        where: { id: dto.roomId, branchId: existing.branchId },
        select: { id: true },
      });
      if (!room) throw new NotFoundException('Oda bu şubede bulunamadı');
    }

    const policy = await this.resolveSchedulePolicy(auth, {
      branchId: existing.branchId,
      staffId,
      start,
      end,
      allowOutsideHours: dto.allowOutsideHours,
      overrideReason: dto.overrideReason,
      timeZone,
    });

    const updated = await withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const overlapping = await tx.appointment.findMany({
            where: {
              clinicId: auth.clinicId,
              id: { not: existing.id },
              status: { in: [...ACTIVE_STATUSES] },
              scheduledStart: { lt: end },
              scheduledEnd: { gt: start },
              OR: [{ staffId }, ...(roomId ? [{ roomId }] : [])],
            },
            select: { id: true, staffId: true, roomId: true },
          });
          const conflict = pickConflictingAppointment(overlapping, { staffId, roomId });
          if (conflict) {
            throw new HttpException(
              {
                statusCode: HttpStatus.CONFLICT,
                code: APPOINTMENT_ERROR_CODES.CONFLICT,
                message: 'Aynı hekim veya oda için çakışan aktif randevu var',
              },
              HttpStatus.CONFLICT,
            );
          }
          return tx.appointment.update({
            where: { id: existing.id },
            data: {
              appointmentTypeId: type.id,
              staffId,
              roomId,
              scheduledStart: start,
              scheduledEnd: end,
              notes: dto.notes !== undefined ? (dto.notes.trim() || null) : existing.notes,
              overrideReason: policy.overrideReason ?? existing.overrideReason,
              overriddenByStaffId: policy.overriddenByStaffId ?? existing.overriddenByStaffId,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: existing.branchId,
      action: 'appointment.update',
      entityType: 'Appointment',
      entityId: updated.id,
      metadata: {
        scheduledStart: start.toISOString(),
        staffId,
        status: existing.status,
      },
    });

    return this.getAppointmentOr404(auth.clinicId, updated.id);
  }

  /** Durum geçişi — ileri yönlü makine dışı sıralar 409 döner (kabul kriteri 3). */
  async changeStatus(auth: AuthContext, id: string, dto: AppointmentStatusDto) {
    const existing = await this.getAppointmentOr404(auth.clinicId, id);
    await this.assertAppointmentAccess(auth, existing);
    const current = existing.status as AppointmentStatus;
    const target = dto.status as AppointmentStatus;
    if (!['arrived', 'waiting', 'in_consultation', 'completed', 'no_show'].includes(target)) {
      throw new BadRequestException('Geçersiz hedef durum');
    }
    try {
      assertTransition(current, target);
    } catch (error) {
      if (error instanceof InvalidTransitionError) {
        throw new HttpException(
          {
            statusCode: HttpStatus.CONFLICT,
            code: APPOINTMENT_ERROR_CODES.INVALID_TRANSITION,
            message: `Geçersiz durum geçişi: ${current} → ${target}`,
          },
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }

    const now = new Date();
    const stampData: Prisma.AppointmentUpdateInput = { status: target };
    if (target === 'arrived' && !existing.checkedInAt) stampData.checkedInAt = now;
    if (target === 'waiting') stampData.waitingAt = now;
    if (target === 'in_consultation') stampData.inConsultationAt = now;
    if (target === 'completed') stampData.completedAt = now;
    if (target === 'no_show') stampData.closedAt = now;

    const updated = await this.prisma.appointment.update({
      where: { id: existing.id },
      data: stampData,
    });

    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: existing.branchId,
      action: 'appointment.status',
      entityType: 'Appointment',
      entityId: existing.id,
      metadata: { from: current, to: target, note: dto.note ?? null },
    });

    return updated;
  }

  /** Check-in — yalnız scheduled → arrived; akış panosuna yansır (kabul kriteri 4). */
  async checkIn(auth: AuthContext, id: string) {
    const existing = await this.getAppointmentOr404(auth.clinicId, id);
    await this.assertAppointmentAccess(auth, existing);
    const current = existing.status as AppointmentStatus;
    try {
      assertTransition(current, 'arrived');
    } catch (error) {
      if (error instanceof InvalidTransitionError) {
        throw new HttpException(
          {
            statusCode: HttpStatus.CONFLICT,
            code: APPOINTMENT_ERROR_CODES.INVALID_TRANSITION,
            message: `Check-in yalnızca planlanmış randevu için geçerlidir (mevcut: ${current})`,
          },
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }

    const now = new Date();
    const updated = await this.prisma.appointment.update({
      where: { id: existing.id },
      data: { status: 'arrived', checkedInAt: now },
    });

    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: existing.branchId,
      action: 'appointment.checkin',
      entityType: 'Appointment',
      entityId: existing.id,
      metadata: { from: current, to: 'arrived' },
    });

    return updated;
  }

  async cancel(auth: AuthContext, id: string, dto: CancelAppointmentDto) {
    const existing = await this.getAppointmentOr404(auth.clinicId, id);
    await this.assertAppointmentAccess(auth, existing);
    const current = existing.status as AppointmentStatus;
    try {
      assertTransition(current, 'cancelled');
    } catch (error) {
      if (error instanceof InvalidTransitionError) {
        throw new HttpException(
          {
            statusCode: HttpStatus.CONFLICT,
            code: APPOINTMENT_ERROR_CODES.INVALID_TRANSITION,
            message: `Tamamlanmış randevu iptal edilemez (mevcut: ${current})`,
          },
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }

    const updated = await this.prisma.appointment.update({
      where: { id: existing.id },
      data: { status: 'cancelled', cancelledReason: dto.reason.trim(), closedAt: new Date() },
    });

    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: existing.branchId,
      action: 'appointment.cancel',
      entityType: 'Appointment',
      entityId: existing.id,
      metadata: { from: current, reason: dto.reason.trim() },
    });

    return updated;
  }

  /**
   * Akış panosu — hasta kuyruğu gerçek randevu satırlarından türetilir
   * (kabul kriteri 4). Şeritler: arrived / waiting / in_consultation;
   * sayaçlar günün tüm randevu durumlarını kapsar.
   */
  async flowboard(
    auth: AuthContext,
    request: AuthRequest,
    date?: string,
  ): Promise<{
    date: string;
    lanes: {
      arrived: FlowboardEntry[];
      waiting: FlowboardEntry[];
      in_consultation: FlowboardEntry[];
    };
    counts: Record<AppointmentStatus, number>;
  }> {
    const timeZone = await this.clinicTimezone(auth.clinicId);
    const dayISO = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO(timeZone);
    const { start, end } = localDayRange(dayISO, timeZone);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        clinicId: auth.clinicId,
        ...this.branchFilter(auth, request),
        scheduledStart: { gte: start, lt: end },
      },
      orderBy: { scheduledStart: 'asc' },
      include: APPOINTMENT_INCLUDE,
    });

    const now = Date.now();
    const toEntry = (appointment: AppointmentWithRelations): FlowboardEntry => {
      const waitingSince =
        appointment.waitingAt ?? appointment.checkedInAt ?? appointment.scheduledStart;
      const consultSince = appointment.inConsultationAt ?? waitingSince;
      return {
        appointmentId: appointment.id,
        status: appointment.status,
        scheduledStart: appointment.scheduledStart.toISOString(),
        scheduledEnd: appointment.scheduledEnd.toISOString(),
        waitingMinutes:
          appointment.status === 'in_consultation'
            ? Math.max(0, Math.floor((now - consultSince.getTime()) / 60_000))
            : Math.max(0, Math.floor((now - waitingSince.getTime()) / 60_000)),
        notes: appointment.notes,
        patient: {
          id: appointment.patient.id,
          name: appointment.patient.name,
          code: appointment.patient.code,
          alerts: appointment.patient.alerts.map((alert) => ({
            kind: alert.kind,
            label: alert.label,
            severity: alert.severity,
          })),
        },
        owner: {
          id: appointment.owner.id,
          fullName: `${appointment.owner.firstName} ${appointment.owner.lastName}`,
        },
        type: appointment.type,
        staff: {
          id: appointment.staff.id,
          fullName: `${appointment.staff.firstName} ${appointment.staff.lastName}`,
        },
        room: appointment.room ? { id: appointment.room.id, name: appointment.room.name } : null,
      };
    };

    const laneEntries = appointments.filter((appointment) =>
      (['arrived', 'waiting', 'in_consultation'] as const).includes(
        appointment.status as 'arrived' | 'waiting' | 'in_consultation',
      ),
    );

    const arrived = laneEntries
      .filter((a) => a.status === 'arrived')
      .sort((a, b) => (a.checkedInAt?.getTime() ?? 0) - (b.checkedInAt?.getTime() ?? 0))
      .map(toEntry);
    const waiting = laneEntries
      .filter((a) => a.status === 'waiting')
      .sort((a, b) => (a.waitingAt?.getTime() ?? 0) - (b.waitingAt?.getTime() ?? 0))
      .map(toEntry);
    const in_consultation = laneEntries
      .filter((a) => a.status === 'in_consultation')
      .sort((a, b) => (a.inConsultationAt?.getTime() ?? 0) - (b.inConsultationAt?.getTime() ?? 0))
      .map(toEntry);

    const counts = Object.fromEntries(
      APPOINTMENT_STATUS_KEYS.map((status) => [
        status,
        appointments.filter((appointment) => appointment.status === status).length,
      ]),
    ) as Record<AppointmentStatus, number>;

    return { date: dayISO, lanes: { arrived, waiting, in_consultation }, counts };
  }
}

const APPOINTMENT_STATUS_KEYS = [
  'scheduled',
  'arrived',
  'waiting',
  'in_consultation',
  'completed',
  'no_show',
  'cancelled',
] as const;

export type FlowboardEntry = {
  appointmentId: string;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  waitingMinutes: number;
  notes: string | null;
  patient: {
    id: string;
    name: string;
    code: string;
    alerts: { kind: string; label: string; severity: string }[];
  };
  owner: { id: string; fullName: string };
  type: { id: string; name: string; colorKey: string; durationMin: number };
  staff: { id: string; fullName: string };
  room: { id: string; name: string } | null;
};
