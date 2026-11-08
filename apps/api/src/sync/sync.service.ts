/**
 * Faz 13 — senkronizasyon servisi.
 *
 * Push: her işlem tek transaction'da claim (unique client_operation_id) →
 * uygula → sonuç yazılır. Aynı anahtar ikinci kez gelirse kayıttan REPLAY
 * edilir ('duplicate') — tekrar deneme duplicate hizmet/ücret/stok üretmez.
 * Sürüm uyuşmazlığında CONFLICT + sunucu anlık görüntüsü döner; sessiz
 * overwrite yoktur. finalize/finance/stock türleri beyaz listede olmadığından
 * push yoluyla kesinleşemez — sunucu onayı olmadan posted görünmez.
 *
 * Pull: (updatedAt, id) Filigranıyla iki varlık kümesinin (randevu + muayene)
 * delta'sı; imleç opak base64url JSON'dur ve varlık başına ayrı filigran taşır.
 */
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import {
  assertTransition,
  InvalidTransitionError,
  type AppointmentStatus,
} from '../appointments/appointments.domain';
import { isEditable } from '../encounters/encounters.domain';
import { APPOINTMENT_ERROR_CODES } from '../appointments/appointments.service';
import {
  ENCOUNTER_ERROR_CODES,
} from '../encounters/encounters.service';
import {
  SyncOperationDto,
  SyncPullQueryDto,
  SyncPushDto,
  SYNC_KINDS,
} from './dto/sync.dto';

export const SYNC_ERROR_CODES = {
  KIND_NOT_ALLOWED: 'SYNC_KIND_NOT_ALLOWED',
  KIND_ENTITY_MISMATCH: 'SYNC_KIND_ENTITY_MISMATCH',
  VALIDATION: 'SYNC_VALIDATION',
  PERMISSION: 'SYNC_PERMISSION_DENIED',
  BRANCH_SCOPE: 'SYNC_BRANCH_SCOPE',
  BRANCH_MISMATCH: 'SYNC_BRANCH_MISMATCH',
  NOT_FOUND: 'SYNC_ENTITY_NOT_FOUND',
  VERSION_CONFLICT: 'SYNC_VERSION_CONFLICT',
  CURSOR_INVALID: 'SYNC_CURSOR_INVALID',
} as const;

/** kind → hedef varlık + gerekli izin (beyaz liste; finalize YOK). */
const KIND_RULES: Record<
  string,
  { entity: 'encounter' | 'appointment'; permission: string }
> = {
  'encounter.create_draft': { entity: 'encounter', permission: 'encounter.manage' },
  'encounter.update_draft': { entity: 'encounter', permission: 'encounter.manage' },
  'appointment.check_in': { entity: 'appointment', permission: 'appointment.manage' },
  'appointment.status': { entity: 'appointment', permission: 'appointment.manage' },
  'appointment.cancel': { entity: 'appointment', permission: 'appointment.manage' },
};

/** Randevu durum makinesinin push'ta hedeflenebilen durumları (web ile aynı). */
const APPOINTMENT_TARGETS = [
  'arrived',
  'waiting',
  'in_consultation',
  'completed',
  'no_show',
] as const;

type OpStatus = 'accepted' | 'duplicate' | 'conflict' | 'rejected';

export type SyncOpResult = {
  clientOperationId: string;
  status: OpStatus;
  code?: string;
  message?: string;
  /** accepted/duplicate: sunucu kimliği + sürüm + uygulama sonrası anlık görüntü */
  result?: { serverId: string; version: string; snapshot: Record<string, unknown> };
};

const SOAP_FIELDS = [
  'chiefComplaint',
  'subjective',
  'objective',
  'assessment',
  'plan',
  'notes',
] as const;

const ENCOUNTER_SELECT = {
  id: true,
  branchId: true,
  patientId: true,
  ownerId: true,
  veterinarianId: true,
  appointmentId: true,
  status: true,
  chiefComplaint: true,
  subjective: true,
  objective: true,
  assessment: true,
  plan: true,
  notes: true,
  version: true,
  startedAt: true,
  updatedAt: true,
} satisfies Prisma.EncounterSelect;

const APPOINTMENT_PULL_SELECT = {
  id: true,
  branchId: true,
  patientId: true,
  ownerId: true,
  appointmentTypeId: true,
  staffId: true,
  roomId: true,
  status: true,
  notes: true,
  cancelledReason: true,
  scheduledStart: true,
  scheduledEnd: true,
  checkedInAt: true,
  waitingAt: true,
  inConsultationAt: true,
  completedAt: true,
  closedAt: true,
  updatedAt: true,
  patient: {
    select: {
      id: true,
      name: true,
      code: true,
      ownerId: true,
      alerts: {
        where: { active: true },
        select: { kind: true, label: true, severity: true },
      },
    },
  },
  owner: { select: { id: true, firstName: true, lastName: true } },
  type: { select: { id: true, name: true, colorKey: true, durationMin: true } },
  staff: { select: { id: true, firstName: true, lastName: true, title: true } },
  room: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true, code: true } },
} satisfies Prisma.AppointmentSelect;

type AppointmentPulled = Prisma.AppointmentGetPayload<{ select: typeof APPOINTMENT_PULL_SELECT }>;
type EncounterPulled = Prisma.EncounterGetPayload<{ select: typeof ENCOUNTER_SELECT }>;

/** Opak pull imleci — varlık başına filigran (updatedAt instant + id tie-break). */
type PullCursor = {
  appointment?: { t: string; i: string } | null;
  encounter?: { t: string; i: string } | null;
};

function encodeCursor(cursor: PullCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(raw: string | undefined): PullCursor {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (parsed && typeof parsed === 'object') return parsed as PullCursor;
  } catch {
    // geçersiz imleç aşağıda 400 olur
  }
  throw new HttpException(
    {
      statusCode: HttpStatus.BAD_REQUEST,
      code: SYNC_ERROR_CODES.CURSOR_INVALID,
      message: 'Geçersiz senkronizasyon imleci',
    },
    HttpStatus.BAD_REQUEST,
  );
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Mobil istemcinin kind listesiyle pariteyi koruması için açıkça sunulur. */
  listKinds(): string[] {
    return [...SYNC_KINDS];
  }

  async push(auth: AuthContext, request: AuthRequest, dto: SyncPushDto): Promise<{
    results: SyncOpResult[];
    serverTime: string;
  }> {
    const results: SyncOpResult[] = [];
    for (const op of dto.operations) {
      results.push(await this.applyOperation(auth, request, op));
    }
    return { results, serverTime: new Date().toISOString() };
  }

  private async applyOperation(
    auth: AuthContext,
    request: AuthRequest,
    op: SyncOperationDto,
  ): Promise<SyncOpResult> {
    // 1) REPLAY — aynı client_operation_id daha önce geldiyse kayıttan oynat.
    const existing = await this.prisma.syncOperation.findUnique({
      where: { clinicId_clientOperationId: { clinicId: auth.clinicId, clientOperationId: op.clientOperationId } },
    });
    if (existing) {
      const stored = (existing.result ?? {}) as Record<string, unknown>;
      const out: SyncOpResult = {
        clientOperationId: op.clientOperationId,
        status: 'duplicate',
        ...(existing.status === 'rejected'
          ? {
              code: typeof stored['code'] === 'string' ? stored['code'] : undefined,
              message: typeof stored['message'] === 'string' ? stored['message'] : undefined,
            }
          : {}),
        ...(existing.status !== 'rejected' && stored['serverId']
          ? {
              result: {
                serverId: String(stored['serverId']),
                version: String(stored['version'] ?? '0'),
                snapshot: (stored['snapshot'] ?? {}) as Record<string, unknown>,
              },
            }
          : {}),
      };
      return out;
    }

    // 2) Beyaz liste + varlık uyumu — finalize/finance/stock burada reddedilir.
    const rule = KIND_RULES[op.kind];
    if (!rule) {
      return this.storeTerminal(
        auth,
        op,
        'rejected',
        SYNC_ERROR_CODES.KIND_NOT_ALLOWED,
        `İşlem türü push'ta desteklenmiyor: ${op.kind} — finalize/finans/stok işlemleri yalnız çevrimiçi uçlarla sunucu onaylı yapılır`,
      );
    }
    if (rule.entity !== op.entity) {
      return this.storeTerminal(
        auth,
        op,
        'rejected',
        SYNC_ERROR_CODES.KIND_ENTITY_MISMATCH,
        `İşlem türü ${op.kind} ${rule.entity} varlığına uygulanır`,
      );
    }

    // 3) İzin — JwtAuthGuard sonrası servis düzeyi kontrol (API düzeyi yetki kanıtı).
    if (!auth.permissions.includes(rule.permission)) {
      return this.storeTerminal(
        auth,
        op,
        'rejected',
        SYNC_ERROR_CODES.PERMISSION,
        `Gerekli izin: ${rule.permission}`,
      );
    }

    // 4) Uygulama — claim INSERT'i unique kısıttan yarıştırıcıdır: iki eşzamanlı
    //    aynı-anahtar push'tan yalnız biri uygular, öteki duplicate okur.
    const opBranchId = auth.activeBranchId ?? (auth.branchIds.length === 1 ? auth.branchIds[0] : null);
    if (!opBranchId) {
      return {
        clientOperationId: op.clientOperationId,
        status: 'rejected',
        code: SYNC_ERROR_CODES.BRANCH_SCOPE,
        message: 'Aktif şube seçili değil — mobil oturumda şube seçilmelidir',
      };
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.syncOperation.create({
          data: {
            clinicId: auth.clinicId,
            branchId: opBranchId,
            staffId: auth.staffId,
            clientOperationId: op.clientOperationId,
            kind: op.kind,
            entity: op.entity,
            entityId: op.entityId ?? null,
            expectedVersion: op.expectedVersion ?? '0',
            payload: op.payload as Prisma.InputJsonValue,
            status: 'processing',
            result: {},
          },
        });

        const applied =
          op.entity === 'encounter'
            ? await this.applyEncounterOperation(tx, auth, request, op)
            : await this.applyAppointmentOperation(tx, auth, request, op);

        await tx.syncOperation.update({
          where: {
            clinicId_clientOperationId: {
              clinicId: auth.clinicId,
              clientOperationId: op.clientOperationId,
            },
          },
          data: {
            status: applied.status,
            // Replay kaynağı: accepted/conflict'te sonuç paketi, rejected'ta hata kodu.
            result: (applied.result ?? {
              code: applied.code,
              message: applied.message,
            }) as unknown as Prisma.InputJsonValue,
          },
        });
        return applied;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Eşzamanlı duplicate — kayıtlı sonucu oynat.
        const stored = await this.prisma.syncOperation.findUnique({
          where: { clinicId_clientOperationId: { clinicId: auth.clinicId, clientOperationId: op.clientOperationId } },
        });
        if (stored) {
          const storedResult = (stored.result ?? {}) as Record<string, unknown>;
          return {
            clientOperationId: op.clientOperationId,
            status: 'duplicate',
            ...(stored.status !== 'rejected' && storedResult['serverId']
              ? {
                  result: {
                    serverId: String(storedResult['serverId']),
                    version: String(storedResult['version'] ?? '0'),
                    snapshot: (storedResult['snapshot'] ?? {}) as Record<string, unknown>,
                  },
                }
              : {}),
          };
        }
      }
      this.logger.error(
        `Sync işlem uygulanamadı (${op.kind}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        clientOperationId: op.clientOperationId,
        status: 'rejected',
        code: SYNC_ERROR_CODES.VALIDATION,
        message: 'İşlem uygulanamadı',
      };
    }
  }

  /** Validation/izin/red yollarında da işlem kaydı tutulur (replay tutarlılığı). */
  private async storeTerminal(
    auth: AuthContext,
    op: SyncOperationDto,
    status: 'rejected',
    code: string,
    message: string,
  ): Promise<SyncOpResult> {
    const branchId = auth.activeBranchId ?? auth.branchIds[0];
    if (!branchId) {
      // Şube çözümlenemeyen oturumda kayıt tutulamaz — kararlı hata yeterli.
      return { clientOperationId: op.clientOperationId, status, code, message };
    }
    try {
      await this.prisma.syncOperation.create({
        data: {
          clinicId: auth.clinicId,
          branchId,
          staffId: auth.staffId,
          clientOperationId: op.clientOperationId,
          kind: op.kind,
          entity: op.entity,
          entityId: op.entityId ?? null,
          expectedVersion: op.expectedVersion ?? '0',
          payload: op.payload as Prisma.InputJsonValue,
          status,
          result: { code, message } as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Eşzamanlı ilk gönderim kaydı zaten yazdı — duplicate sayılır.
        return { clientOperationId: op.clientOperationId, status: 'duplicate' };
      }
      throw error;
    }
    return { clientOperationId: op.clientOperationId, status, code, message };
  }

  // ---------------------------------------------------------------- encounters

  private encounterSnapshot(e: EncounterPulled): Record<string, unknown> {
    return {
      id: e.id,
      patientId: e.patientId,
      ownerId: e.ownerId,
      veterinarianId: e.veterinarianId,
      appointmentId: e.appointmentId,
      status: e.status,
      chiefComplaint: e.chiefComplaint,
      subjective: e.subjective,
      objective: e.objective,
      assessment: e.assessment,
      plan: e.plan,
      notes: e.notes,
      version: e.version,
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  private assertBranchScope(
    auth: AuthContext,
    request: AuthRequest,
    entityBranchId: string,
  ): { code: string; message: string } | null {
    if (request.branchId && request.branchId !== entityBranchId) {
      return {
        code: SYNC_ERROR_CODES.BRANCH_MISMATCH,
        message: 'Aktif şube ile kaydın şubesi uyuşmuyor',
      };
    }
    if (!auth.allBranches && !auth.branchIds.includes(entityBranchId)) {
      return {
        code: SYNC_ERROR_CODES.BRANCH_SCOPE,
        message: 'Bu şubeye erişiminiz yok',
      };
    }
    return null;
  }

  private async applyEncounterOperation(
    tx: Prisma.TransactionClient,
    auth: AuthContext,
    request: AuthRequest,
    op: SyncOperationDto,
  ): Promise<SyncOpResult> {
    const fail = (code: string, message: string): SyncOpResult => ({
      clientOperationId: op.clientOperationId,
      status: 'rejected',
      code,
      message,
    });

    if (op.kind === 'encounter.create_draft') {
      const p = op.payload as Record<string, unknown>;
      const patientId = typeof p.patientId === 'string' ? p.patientId : '';
      if (!patientId) return fail(SYNC_ERROR_CODES.VALIDATION, 'patientId zorunludur');

      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId: auth.clinicId, archivedAt: null },
        select: { id: true, branchId: true, ownerId: true },
      });
      if (!patient) return fail('PATIENT_NOT_FOUND', 'Hasta bulunamadı');
      const scope = this.assertBranchScope(auth, request, patient.branchId);
      if (scope) return fail(scope.code, scope.message);

      // veterinarianId yoksa taslağı açan personel atanır (mobil kendini seçer).
      let veterinarianId = typeof p.veterinarianId === 'string' ? p.veterinarianId : auth.staffId;
      const vet = await tx.staff.findFirst({
        where: { id: veterinarianId, clinicId: auth.clinicId, active: true },
        select: { id: true },
      });
      if (!vet) return fail('VETERINARIAN_NOT_FOUND', 'Atanan hekim bulunamadı');
      if (vet.id !== veterinarianId) veterinarianId = vet.id;

      if (typeof p.appointmentId === 'string' && p.appointmentId) {
        const appointment = await tx.appointment.findFirst({
          where: {
            id: p.appointmentId,
            clinicId: auth.clinicId,
            branchId: patient.branchId,
            patientId: patient.id,
          },
          select: { id: true },
        });
        if (!appointment) return fail('APPOINTMENT_MISMATCH', 'Randevu bu hasta/şube ile eşleşmiyor');
      }

      const soap = this.readSoapFields(p);
      if (!soap.ok) return fail(SYNC_ERROR_CODES.VALIDATION, soap.error);

      const created = await tx.encounter.create({
        data: {
          clinicId: auth.clinicId,
          branchId: patient.branchId,
          patientId: patient.id,
          ownerId: patient.ownerId,
          veterinarianId: vet.id,
          appointmentId: typeof p.appointmentId === 'string' && p.appointmentId ? p.appointmentId : null,
          status: 'draft',
          ...soap.fields,
          createdById: auth.staffId,
        },
        select: ENCOUNTER_SELECT,
      });

      await this.audit.record(
        {
          clinicId: auth.clinicId,
          staffId: auth.staffId,
          branchId: created.branchId,
          action: 'ENCOUNTER_CREATED',
          entityType: 'Encounter',
          entityId: created.id,
          metadata: { via: 'sync', clientOperationId: op.clientOperationId },
        },
        tx,
      );

      return {
        clientOperationId: op.clientOperationId,
        status: 'accepted',
        result: {
          serverId: created.id,
          version: String(created.version),
          snapshot: this.encounterSnapshot(created),
        },
      };
    }

    // encounter.update_draft
    const encounterId = op.entityId;
    if (!encounterId) return fail(SYNC_ERROR_CODES.VALIDATION, 'entityId zorunludur');

    // Sürüm yarışını DB kilidiyle kapat: satırı kilitle, sonra oku.
    await tx.$queryRaw`SELECT id FROM "encounters" WHERE id = ${encounterId}::uuid FOR UPDATE`;
    const encounter = await tx.encounter.findFirst({
      where: { id: encounterId, clinicId: auth.clinicId },
      select: ENCOUNTER_SELECT,
    });
    if (!encounter) return fail('ENCOUNTER_NOT_FOUND', 'Muayene kaydı bulunamadı');

    const scope = this.assertBranchScope(auth, request, encounter.branchId);
    if (scope) return fail(scope.code, scope.message);
    if (!isEditable(encounter.status)) {
      return fail(ENCOUNTER_ERROR_CODES.SIGNED, 'İmzalı muayene kaydı değiştirilemez — düzeltme için addendum ekleyin');
    }

    if (String(encounter.version) !== (op.expectedVersion ?? '0')) {
      return {
        clientOperationId: op.clientOperationId,
        status: 'conflict',
        code: SYNC_ERROR_CODES.VERSION_CONFLICT,
        message: `Sürüm uyuşmazlığı: istemci ${op.expectedVersion ?? '0'}, sunucu ${encounter.version}`,
        result: {
          serverId: encounter.id,
          version: String(encounter.version),
          snapshot: this.encounterSnapshot(encounter),
        },
      };
    }

    const p = op.payload as Record<string, unknown>;
    const soap = this.readSoapFields(p);
    if (!soap.ok) return fail(SYNC_ERROR_CODES.VALIDATION, soap.error);

    let veterinarianId: string | undefined;
    if (typeof p.veterinarianId === 'string' && p.veterinarianId) {
      const vet = await tx.staff.findFirst({
        where: { id: p.veterinarianId, clinicId: auth.clinicId, active: true },
        select: { id: true },
      });
      if (!vet) return fail('VETERINARIAN_NOT_FOUND', 'Atanan hekim bulunamadı');
      veterinarianId = vet.id;
    }

    // Yalnız draft → in_progress geçişine izin verilir (web ile aynı kural).
    const data: Prisma.EncounterUncheckedUpdateInput = {
      ...soap.fields,
      version: { increment: 1 },
    };
    if (veterinarianId) data.veterinarianId = veterinarianId;
    if (p.status === 'in_progress' && encounter.status === 'draft') {
      data.status = 'in_progress';
    }

    const updated = await tx.encounter.update({
      where: { id: encounter.id },
      data,
      select: ENCOUNTER_SELECT,
    });

    await this.audit.record(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: updated.branchId,
        action: 'ENCOUNTER_UPDATED',
        entityType: 'Encounter',
        entityId: updated.id,
        metadata: {
          via: 'sync',
          clientOperationId: op.clientOperationId,
          version: updated.version,
        },
      },
      tx,
    );

    return {
      clientOperationId: op.clientOperationId,
      status: 'accepted',
      result: {
        serverId: updated.id,
        version: String(updated.version),
        snapshot: this.encounterSnapshot(updated),
      },
    };
  }

  /** SOAP alanlarını beyaz listeyle oku; tip/uzunluk hatasında ok:false döner. */
  private readSoapFields(p: Record<string, unknown>):
    | { ok: true; fields: Partial<Record<(typeof SOAP_FIELDS)[number], string>> }
    | { ok: false; error: string } {
    const fields: Partial<Record<(typeof SOAP_FIELDS)[number], string>> = {};
    for (const field of SOAP_FIELDS) {
      if (p[field] === undefined) continue;
      if (p[field] === null) {
        fields[field] = null as never; // alan temizleme (null yazımı) desteği
        continue;
      }
      if (typeof p[field] !== 'string') {
        return { ok: false, error: `${field} metin olmalıdır` };
      }
      const max = field === 'chiefComplaint' ? 500 : 5000;
      if ((p[field] as string).length > max) {
        return { ok: false, error: `${field} en çok ${max} karakter olabilir` };
      }
      fields[field] = p[field] as string;
    }
    return { ok: true, fields };
  }

  // -------------------------------------------------------------- appointments

  private appointmentSnapshot(a: AppointmentPulled): Record<string, unknown> {
    return {
      id: a.id,
      branchId: a.branchId,
      patientId: a.patientId,
      ownerId: a.ownerId,
      appointmentTypeId: a.appointmentTypeId,
      staffId: a.staffId,
      roomId: a.roomId,
      status: a.status,
      notes: a.notes,
      cancelledReason: a.cancelledReason,
      scheduledStart: a.scheduledStart.toISOString(),
      scheduledEnd: a.scheduledEnd.toISOString(),
      checkedInAt: a.checkedInAt?.toISOString() ?? null,
      waitingAt: a.waitingAt?.toISOString() ?? null,
      inConsultationAt: a.inConsultationAt?.toISOString() ?? null,
      completedAt: a.completedAt?.toISOString() ?? null,
      closedAt: a.closedAt?.toISOString() ?? null,
      updatedAt: a.updatedAt.toISOString(),
    };
  }

  private async applyAppointmentOperation(
    tx: Prisma.TransactionClient,
    auth: AuthContext,
    request: AuthRequest,
    op: SyncOperationDto,
  ): Promise<SyncOpResult> {
    const fail = (code: string, message: string): SyncOpResult => ({
      clientOperationId: op.clientOperationId,
      status: 'rejected',
      code,
      message,
    });

    const appointmentId = op.entityId;
    if (!appointmentId) return fail(SYNC_ERROR_CODES.VALIDATION, 'entityId zorunludur');

    await tx.$queryRaw`SELECT id FROM "appointments" WHERE id = ${appointmentId}::uuid FOR UPDATE`;
    const appointment = await tx.appointment.findFirst({
      where: { id: appointmentId, clinicId: auth.clinicId },
      select: APPOINTMENT_PULL_SELECT,
    });
    if (!appointment) return fail('APPOINTMENT_NOT_FOUND', 'Randevu bulunamadı');

    const scope = this.assertBranchScope(auth, request, appointment.branchId);
    if (scope) return fail(scope.code, scope.message);

    const current = appointment.status;
    const stampData: Prisma.AppointmentUpdateInput = {};
    let auditAction = 'appointment.status';
    const now = new Date();

    if (op.kind === 'appointment.check_in') {
      auditAction = 'appointment.checkin';
      try {
        assertTransition(current as AppointmentStatus, 'arrived');
      } catch (error) {
        if (error instanceof InvalidTransitionError) {
          return fail(
            APPOINTMENT_ERROR_CODES.INVALID_TRANSITION,
            `Check-in yalnızca planlanmış randevu için geçerlidir (mevcut: ${current})`,
          );
        }
        throw error;
      }
      stampData.status = 'arrived';
      stampData.checkedInAt = now;
    } else if (op.kind === 'appointment.status') {
      const p = op.payload as Record<string, unknown>;
      const target = typeof p.status === 'string' ? p.status : '';
      if (!APPOINTMENT_TARGETS.includes(target as (typeof APPOINTMENT_TARGETS)[number])) {
        return fail(SYNC_ERROR_CODES.VALIDATION, 'Geçersiz hedef durum');
      }
      try {
        assertTransition(current as AppointmentStatus, target as AppointmentStatus);
      } catch (error) {
        if (error instanceof InvalidTransitionError) {
          return fail(
            APPOINTMENT_ERROR_CODES.INVALID_TRANSITION,
            `Geçersiz durum geçişi: ${current} → ${target}`,
          );
        }
        throw error;
      }
      stampData.status = target;
      if (target === 'arrived' && !appointment.checkedInAt) stampData.checkedInAt = now;
      if (target === 'waiting') stampData.waitingAt = now;
      if (target === 'in_consultation') stampData.inConsultationAt = now;
      if (target === 'completed') stampData.completedAt = now;
      if (target === 'no_show') stampData.closedAt = now;
    } else {
      // appointment.cancel
      auditAction = 'appointment.cancel';
      const p = op.payload as Record<string, unknown>;
      const reason = typeof p.reason === 'string' ? p.reason.trim() : '';
      if (!reason || reason.length > 500) {
        return fail(SYNC_ERROR_CODES.VALIDATION, 'İptal gerekçesi zorunludur (en çok 500 karakter)');
      }
      try {
        assertTransition(current as AppointmentStatus, 'cancelled');
      } catch (error) {
        if (error instanceof InvalidTransitionError) {
          return fail(
            APPOINTMENT_ERROR_CODES.INVALID_TRANSITION,
            `Tamamlanmış randevu iptal edilemez (mevcut: ${current})`,
          );
        }
        throw error;
      }
      stampData.status = 'cancelled';
      stampData.cancelledReason = reason;
      stampData.closedAt = now;
    }

    // Sürüm çakışması — iş kuralından SONRA değerlendirilir; sunucu anlık
    // görüntüsüyle birlikte CONFLICT döner (sessiz overwrite yok).
    const serverVersion = String(appointment.updatedAt.getTime());
    if (serverVersion !== (op.expectedVersion ?? '0')) {
      return {
        clientOperationId: op.clientOperationId,
        status: 'conflict',
        code: SYNC_ERROR_CODES.VERSION_CONFLICT,
        message: `Sürüm uyuşmazlığı: istemci ${op.expectedVersion ?? '0'}, sunucu ${serverVersion}`,
        result: {
          serverId: appointment.id,
          version: serverVersion,
          snapshot: this.appointmentSnapshot(appointment),
        },
      };
    }

    const p = op.payload as Record<string, unknown>;
    const updated = await tx.appointment.update({
      where: { id: appointment.id },
      data: stampData,
      select: APPOINTMENT_PULL_SELECT,
    });

    await this.audit.record(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: updated.branchId,
        action: auditAction,
        entityType: 'Appointment',
        entityId: updated.id,
        metadata: {
          via: 'sync',
          clientOperationId: op.clientOperationId,
          from: current,
          to: updated.status,
          ...(op.kind === 'appointment.cancel' ? { reason: (p.reason as string).trim() } : {}),
          ...(op.kind === 'appointment.status' && typeof p.note === 'string' ? { note: p.note } : {}),
        },
      },
      tx,
    );

    return {
      clientOperationId: op.clientOperationId,
      status: 'accepted',
      result: {
        serverId: updated.id,
        version: String(updated.updatedAt.getTime()),
        snapshot: this.appointmentSnapshot(updated),
      },
    };
  }

  // ---------------------------------------------------------------------- pull

  async pull(
    auth: AuthContext,
    request: AuthRequest,
    query: SyncPullQueryDto,
  ): Promise<{
    items: { entity: string; data: Record<string, unknown> }[];
    nextCursor: string;
    hasMore: boolean;
    serverTime: string;
  }> {
    const cursor = decodeCursor(query.cursor);
    const limit = query.limit ?? 100;

    const branchFilter = request.branchId
      ? { branchId: request.branchId }
      : auth.allBranches
        ? {}
        : { branchId: { in: auth.branchIds } };

    const watermark = (
      rows: { updatedAt: Date; id: string }[],
      fallback: PullCursor['appointment'],
    ): { t: string; i: string } | null =>
      rows.length
        ? { t: rows[rows.length - 1]!.updatedAt.toISOString(), i: rows[rows.length - 1]!.id }
        : (fallback ?? null);

    const deltaWhere = (mark: { t: string; i: string } | null | undefined) =>
      mark
        ? {
            OR: [
              { updatedAt: { gt: new Date(mark.t) } },
              { updatedAt: { equals: new Date(mark.t) }, id: { gt: mark.i } },
            ],
          }
        : {};

    const appointments = await this.prisma.appointment.findMany({
      where: { clinicId: auth.clinicId, ...branchFilter, ...deltaWhere(cursor.appointment) },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: APPOINTMENT_PULL_SELECT,
    });
    const encounters = await this.prisma.encounter.findMany({
      where: { clinicId: auth.clinicId, ...branchFilter, ...deltaWhere(cursor.encounter) },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: ENCOUNTER_SELECT,
    });

    const hasMore = appointments.length >= limit || encounters.length >= limit;
    const nextCursor = encodeCursor({
      appointment: watermark(appointments, cursor.appointment),
      encounter: watermark(encounters, cursor.encounter),
    });

    return {
      items: [
        ...appointments.map((a) => ({ entity: 'appointment', data: a as unknown as Record<string, unknown> })),
        ...encounters.map((e) => ({ entity: 'encounter', data: e as unknown as Record<string, unknown> })),
      ],
      nextCursor,
      hasMore,
      serverTime: new Date().toISOString(),
    };
  }
}
