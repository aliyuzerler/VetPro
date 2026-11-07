import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { todayISO } from './appointments.domain';
import { AppointmentsService } from './appointments.service';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import type {
  BookWaitlistDto,
  CreateAppointmentTypeDto,
  CreateScheduleBlockDto,
  CreateWaitlistDto,
  UpdateAppointmentTypeDto,
  UpdateScheduleBlockDto,
  UpdateWaitlistDto,
} from './appointments.dto';

const TYPE_SELECT = {
  id: true,
  name: true,
  durationMin: true,
  colorKey: true,
  active: true,
  createdAt: true,
} as const;

const WAITLIST_INCLUDE = {
  patient: {
    select: {
      id: true,
      name: true,
      code: true,
      alerts: { where: { active: true }, select: { kind: true, label: true, severity: true } },
    },
  },
  owner: { select: { id: true, firstName: true, lastName: true } },
  type: { select: { id: true, name: true, colorKey: true, durationMin: true } },
  preferredStaff: { select: { id: true, firstName: true, lastName: true } },
  bookedAppointment: { select: { id: true, status: true, scheduledStart: true } },
} satisfies Prisma.WaitlistEntryInclude;

/**
 * Randevu türü kataloğu, çalışma saatleri (ScheduleBlock) ve bekleme listesi — Faz 05.
 * Yazma uçları appointment.manage izniyle sınırlıdır (controller); tüm mutation'lar
 * denetim defterine yazılır.
 */
@Injectable()
export class SchedulingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AppointmentsService) private readonly appointments: AppointmentsService,
  ) {}

  private branchFilter(auth: AuthContext, request: AuthRequest) {
    if (request.branchId) return { branchId: request.branchId };
    if (auth.allBranches) return {};
    return { branchId: { in: auth.branchIds } };
  }

  private requireBranchId(auth: AuthContext, request: AuthRequest): string {
    if (request.branchId) return request.branchId;
    if (auth.allBranches) {
      throw new BadRequestException('Şube belirtilmelidir (branchId veya X-Branch-Id)');
    }
    throw new BadRequestException('Şube belirtilmelidir');
  }

  // ---------- Randevu türleri ----------

  listTypes(clinicId: string) {
    return this.prisma.appointmentType.findMany({
      where: { clinicId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: TYPE_SELECT,
    });
  }

  async createType(auth: AuthContext, dto: CreateAppointmentTypeDto) {
    const name = dto.name.trim();
    const exists = await this.prisma.appointmentType.findFirst({
      where: { clinicId: auth.clinicId, name },
      select: { id: true },
    });
    if (exists) throw new ConflictException('Bu randevu türü zaten kayıtlı');
    const type = await this.prisma.appointmentType.create({
      data: {
        clinicId: auth.clinicId,
        name,
        durationMin: dto.durationMin,
        colorKey: dto.colorKey ?? 'brand',
      },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'appointment.type.create',
      entityType: 'AppointmentType',
      entityId: type.id,
      metadata: { name, durationMin: dto.durationMin },
    });
    return type;
  }

  async updateType(auth: AuthContext, id: string, dto: UpdateAppointmentTypeDto) {
    const type = await this.prisma.appointmentType.findFirst({
      where: { id, clinicId: auth.clinicId },
    });
    if (!type) throw new NotFoundException('Randevu türü bulunamadı');
    if (dto.name && dto.name.trim() !== type.name) {
      const exists = await this.prisma.appointmentType.findFirst({
        where: { clinicId: auth.clinicId, name: dto.name.trim() },
        select: { id: true },
      });
      if (exists) throw new ConflictException('Bu randevu türü zaten kayıtlı');
    }
    const updated = await this.prisma.appointmentType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.durationMin !== undefined ? { durationMin: dto.durationMin } : {}),
        ...(dto.colorKey !== undefined ? { colorKey: dto.colorKey } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'appointment.type.update',
      entityType: 'AppointmentType',
      entityId: id,
      metadata: { ...dto },
    });
    return updated;
  }

  // ---------- Çalışma saatleri / plan engelleri ----------

  listBlocks(auth: AuthContext, request: AuthRequest, staffId?: string) {
    return this.prisma.scheduleBlock.findMany({
      where: {
        clinicId: auth.clinicId,
        ...this.branchFilter(auth, request),
        ...(staffId ? { staffId } : {}),
      },
      orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }],
      include: { staff: { select: { id: true, firstName: true, lastName: true, title: true } } },
    });
  }

  async createBlock(auth: AuthContext, request: AuthRequest, dto: CreateScheduleBlockDto) {
    const branchId = this.requireBranchId(auth, request);
    let staffId: string | null = null;
    if (dto.staffId) {
      const staff = await this.prisma.staff.findFirst({
        where: { id: dto.staffId, clinicId: auth.clinicId },
        select: { id: true },
      });
      if (!staff) throw new NotFoundException('Personel bulunamadı');
      staffId = staff.id;
    }
    if (dto.endMin <= dto.startMin) {
      throw new BadRequestException('endMin, startMin değerinden büyük olmalıdır');
    }
    const block = await this.prisma.scheduleBlock.create({
      data: {
        clinicId: auth.clinicId,
        branchId,
        staffId,
        kind: dto.kind,
        weekday: dto.weekday,
        startMin: dto.startMin,
        endMin: dto.endMin,
        note: dto.note?.trim() || null,
      },
      include: { staff: { select: { id: true, firstName: true, lastName: true, title: true } } },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId,
      action: 'schedule.block.create',
      entityType: 'ScheduleBlock',
      entityId: block.id,
      metadata: { ...dto, staffId },
    });
    return block;
  }

  async updateBlock(auth: AuthContext, id: string, dto: UpdateScheduleBlockDto) {
    const block = await this.prisma.scheduleBlock.findFirst({
      where: { id, clinicId: auth.clinicId },
    });
    if (!block) throw new NotFoundException('Çalışma saati kaydı bulunamadı');
    const startMin = dto.startMin ?? block.startMin;
    const endMin = dto.endMin ?? block.endMin;
    if (endMin <= startMin) {
      throw new BadRequestException('endMin, startMin değerinden büyük olmalıdır');
    }
    const updated = await this.prisma.scheduleBlock.update({
      where: { id },
      data: {
        ...(dto.startMin !== undefined ? { startMin } : {}),
        ...(dto.endMin !== undefined ? { endMin } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      include: { staff: { select: { id: true, firstName: true, lastName: true, title: true } } },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: block.branchId,
      action: 'schedule.block.update',
      entityType: 'ScheduleBlock',
      entityId: id,
      metadata: { ...dto },
    });
    return updated;
  }

  async deleteBlock(auth: AuthContext, id: string) {
    const block = await this.prisma.scheduleBlock.findFirst({
      where: { id, clinicId: auth.clinicId },
    });
    if (!block) throw new NotFoundException('Çalışma saati kaydı bulunamadı');
    await this.prisma.scheduleBlock.delete({ where: { id } });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: block.branchId,
      action: 'schedule.block.delete',
      entityType: 'ScheduleBlock',
      entityId: id,
      metadata: { kind: block.kind, weekday: block.weekday, startMin: block.startMin },
    });
  }

  // ---------- Bekleme listesi ----------

  async listWaitlist(auth: AuthContext, request: AuthRequest, status?: string) {
    return this.prisma.waitlistEntry.findMany({
      where: {
        clinicId: auth.clinicId,
        ...this.branchFilter(auth, request),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: WAITLIST_INCLUDE,
    });
  }

  private async getWaitlistOr404(clinicId: string, id: string) {
    const entry = await this.prisma.waitlistEntry.findFirst({
      where: { id, clinicId },
      include: WAITLIST_INCLUDE,
    });
    if (!entry) throw new NotFoundException('Bekleme listesi kaydı bulunamadı');
    return entry;
  }

  async createWaitlist(auth: AuthContext, request: AuthRequest, dto: CreateWaitlistDto) {
    const branchId = this.requireBranchId(auth, request);
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId: auth.clinicId, archivedAt: null },
      select: { id: true, ownerId: true },
    });
    if (!patient) throw new NotFoundException('Hasta bulunamadı');
    if (dto.appointmentTypeId) {
      const type = await this.prisma.appointmentType.findFirst({
        where: { id: dto.appointmentTypeId, clinicId: auth.clinicId },
        select: { id: true },
      });
      if (!type) throw new NotFoundException('Randevu türü bulunamadı');
    }
    if (dto.preferredStaffId) {
      const staff = await this.prisma.staff.findFirst({
        where: { id: dto.preferredStaffId, clinicId: auth.clinicId },
        select: { id: true },
      });
      if (!staff) throw new NotFoundException('Personel bulunamadı');
    }
    const entry = await this.prisma.waitlistEntry.create({
      data: {
        clinicId: auth.clinicId,
        branchId,
        patientId: patient.id,
        ownerId: patient.ownerId,
        appointmentTypeId: dto.appointmentTypeId ?? null,
        preferredStaffId: dto.preferredStaffId ?? null,
        preferredDate: dto.preferredDate ? new Date(`${dto.preferredDate}T00:00:00Z`) : null,
        preferredStartMin: dto.preferredStartMin ?? null,
        preferredEndMin: dto.preferredEndMin ?? null,
        note: dto.note?.trim() || null,
        status: 'waiting',
        createdById: auth.staffId,
      },
      include: WAITLIST_INCLUDE,
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId,
      action: 'waitlist.create',
      entityType: 'WaitlistEntry',
      entityId: entry.id,
      metadata: { patientId: patient.id, note: dto.note ?? null },
    });
    return entry;
  }

  async updateWaitlist(auth: AuthContext, id: string, dto: UpdateWaitlistDto) {
    const entry = await this.getWaitlistOr404(auth.clinicId, id);
    if (entry.status !== 'waiting') {
      throw new ConflictException('Yalnızca bekleyen kayıtlar düzenlenebilir');
    }
    if (dto.preferredDate === '') {
      dto.preferredDate = undefined;
    }
    const updated = await this.prisma.waitlistEntry.update({
      where: { id },
      data: {
        ...(dto.appointmentTypeId !== undefined ? { appointmentTypeId: dto.appointmentTypeId } : {}),
        ...(dto.preferredStaffId !== undefined ? { preferredStaffId: dto.preferredStaffId } : {}),
        ...(dto.preferredDate !== undefined
          ? { preferredDate: new Date(`${dto.preferredDate}T00:00:00Z`) }
          : {}),
        ...(dto.preferredStartMin !== undefined ? { preferredStartMin: dto.preferredStartMin } : {}),
        ...(dto.preferredEndMin !== undefined ? { preferredEndMin: dto.preferredEndMin } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
      },
      include: WAITLIST_INCLUDE,
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: entry.branchId,
      action: 'waitlist.update',
      entityType: 'WaitlistEntry',
      entityId: id,
      metadata: { ...dto },
    });
    return updated;
  }

  async cancelWaitlist(auth: AuthContext, id: string) {
    const entry = await this.getWaitlistOr404(auth.clinicId, id);
    if (entry.status !== 'waiting') {
      throw new ConflictException('Yalnızca bekleyen kayıtlar iptal edilebilir');
    }
    const updated = await this.prisma.waitlistEntry.update({
      where: { id },
      data: { status: 'cancelled' },
      include: WAITLIST_INCLUDE,
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: entry.branchId,
      action: 'waitlist.cancel',
      entityType: 'WaitlistEntry',
      entityId: id,
      metadata: { patientId: entry.patientId },
    });
    return updated;
  }

  /** Bekleme kaydını randevuya çevirir — randevu kuralları (çakışma, çalışma saati) aynen uygulanır. */
  async bookWaitlist(auth: AuthContext, request: AuthRequest, id: string, dto: BookWaitlistDto) {
    const entry = await this.getWaitlistOr404(auth.clinicId, id);
    if (entry.status !== 'waiting') {
      throw new ConflictException('Yalnızca bekleyen kayıtlar randevuya çevrilebilir');
    }
    const appointmentTypeId = dto.appointmentTypeId ?? entry.appointmentTypeId;
    if (!appointmentTypeId) {
      throw new BadRequestException(
        'Randevu türü belirtilmelidir (kayıtta tür yoksa istekle verilmelidir)',
      );
    }
    const staffId = dto.staffId ?? entry.preferredStaffId;
    if (!staffId) {
      throw new BadRequestException(
        'Hekim belirtilmelidir (kayıtta tercih yoksa istekle verilmelidir)',
      );
    }
    const appointment = await this.appointments.create(auth, request, {
      patientId: entry.patientId,
      appointmentTypeId,
      staffId,
      roomId: dto.roomId,
      startAt: dto.startAt,
      endAt: dto.endAt,
      notes: entry.note ?? undefined,
      allowOutsideHours: dto.allowOutsideHours,
      overrideReason: dto.overrideReason,
    });
    const updated = await this.prisma.waitlistEntry.update({
      where: { id },
      data: { status: 'scheduled', bookedAppointmentId: appointment.id },
      include: WAITLIST_INCLUDE,
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: entry.branchId,
      action: 'waitlist.book',
      entityType: 'WaitlistEntry',
      entityId: id,
      metadata: { appointmentId: appointment.id, scheduledStart: dto.startAt },
    });
    return updated;
  }

  /** Akış panosu için gün bilgisi (klinik yerel saatinde). */
  todayISO(clinicId: string): Promise<string> {
    return this.prisma.clinic
      .findUnique({ where: { id: clinicId }, select: { timezone: true } })
      .then((clinic) => todayISO(clinic?.timezone ?? 'Europe/Istanbul'));
  }
}
