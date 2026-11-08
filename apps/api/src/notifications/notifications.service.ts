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
  MAX_PROVIDER_ATTEMPTS,
  TemplateVarMissingError,
  backoffDelayMs,
  canTransitionNotification,
  classifyFailure,
  consentKindForChannel,
  normalizeRecipient,
  renderTemplate,
  requiredTemplateVars,
  type NotificationChannel,
  type NotificationStatus,
} from './notifications.domain';
import {
  NotificationProviderRegistry,
  ProviderError,
} from './providers/notification-providers';
import type {
  CreateNotificationTemplateDto,
  DeliveryReportQueryDto,
  EnqueueNotificationDto,
  ListNotificationsQueryDto,
  RunNotificationQueueDto,
  UpdateNotificationTemplateDto,
} from './notifications.dto';

export const NOTIFICATION_ERROR_CODES = {
  TEMPLATE_NOT_FOUND: 'NOTIFICATION_TEMPLATE_NOT_FOUND',
  TEMPLATE_CONFLICT: 'NOTIFICATION_TEMPLATE_CONFLICT',
  OWNER_NOT_FOUND: 'NOTIFICATION_OWNER_NOT_FOUND',
  RECIPIENT_MISSING: 'NOTIFICATION_RECIPIENT_MISSING',
  CONSENT_REQUIRED: 'NOTIFICATION_CONSENT_REQUIRED',
  TEMPLATE_VAR_MISSING: 'NOTIFICATION_TEMPLATE_VAR_MISSING',
  NOTIFICATION_NOT_FOUND: 'NOTIFICATION_NOT_FOUND',
  INVALID_TRANSITION: 'NOTIFICATION_INVALID_TRANSITION',
  BRANCH_SCOPE: 'BRANCH_SCOPE',
} as const;

const NOTIFICATION_INCLUDE = {
  template: { select: { id: true, code: true, name: true } },
  owner: {
    select: { id: true, firstName: true, lastName: true },
  },
  attemptLog: {
    orderBy: { attemptNo: 'asc' as const },
  },
} satisfies Prisma.NotificationInclude;

interface NotificationRow {
  id: string;
  clinicId: string;
  branchId: string | null;
  channel: string;
  status: string;
  attempts: number;
  recipientValue: string;
  subject: string | null;
  body: string;
  lastError: string | null;
  sentAt: Date | null;
  scheduledFor: Date;
  templateId: string | null;
  ownerId: string;
  category: string;
  idempotencyKey: string;
  createdAt: Date;
}

/**
 * Bildirim servisi — Faz 12: şablonlar, onay (consent) kuralı, kuyruk,
 * retry/dead-letter ve teslim raporu.
 *
 * Kabul kriterleriyle bağı:
 * - Retry duplicate üretmez: idempotencyKey unique kısıtı (REPLAY döner),
 *   koşullu claim (queued→processing updateMany), sağlayıcıya bildirim
 *   kimliğinden türetilen deterministik providerMessageId.
 * - Onay kuralı: sms/email/whatsapp için OwnerConsent (granted, revokedAt
 *   yok) zorunlu; yoksa 409 CONSENT_REQUIRED — kuyruğa hiç girmez.
 * - Sağlayıcı hatası klinik ana işlemi bozmaz: run-queue içindeki her kayıt
 *   ayrı try/catch'te işlenir; hata yalnızca kayıt durumuna yazılır.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationProviderRegistry)
    private readonly providers: NotificationProviderRegistry,
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
          code: NOTIFICATION_ERROR_CODES.BRANCH_SCOPE,
          message: 'Şube kapsamı dışı istek',
        });
      }
      return;
    }
    if (auth.allBranches) return;
    if (!auth.branchIds.includes(branchId)) {
      throw new ForbiddenException({
        code: NOTIFICATION_ERROR_CODES.BRANCH_SCOPE,
        message: 'Şube erişiminiz yok',
      });
    }
  }

  private mapNotification(n: NotificationRow & {
    template?: { id: string; code: string; name: string } | null;
    owner?: { id: string; firstName: string; lastName: string } | null;
    attemptLog?: Array<{
      id: string;
      attemptNo: number;
      outcome: string;
      providerName: string;
      providerMessageId: string | null;
      error: string | null;
      startedAt: Date;
      finishedAt: Date;
    }>;
  }) {
    return {
      id: n.id,
      clinicId: n.clinicId,
      branchId: n.branchId,
      channel: n.channel,
      category: n.category,
      status: n.status as NotificationStatus,
      ownerId: n.ownerId,
      ownerName: n.owner ? `${n.owner.firstName} ${n.owner.lastName}` : null,
      templateId: n.templateId,
      templateCode: n.template?.code ?? null,
      recipientValue: n.recipientValue,
      subject: n.subject,
      body: n.body,
      attempts: n.attempts,
      maxAttempts: MAX_PROVIDER_ATTEMPTS,
      lastError: n.lastError,
      sentAt: n.sentAt?.toISOString() ?? null,
      scheduledFor: n.scheduledFor.toISOString(),
      idempotencyKey: n.idempotencyKey,
      createdAt: n.createdAt.toISOString(),
      attemptsLog: n.attemptLog
        ? n.attemptLog.map((a) => ({
            id: a.id,
            attemptNo: a.attemptNo,
            outcome: a.outcome,
            providerName: a.providerName,
            providerMessageId: a.providerMessageId,
            error: a.error,
            startedAt: a.startedAt.toISOString(),
            finishedAt: a.finishedAt.toISOString(),
          }))
        : undefined,
    };
  }

  // ---------------------------------------------------------------- şablonlar

  async listTemplates(auth: AuthContext, includeInactive = false) {
    const templates = await this.prisma.notificationTemplate.findMany({
      where: {
        clinicId: auth.clinicId,
        ...(includeInactive ? {} : { active: true }),
      },
      orderBy: { code: 'asc' },
    });
    return templates.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      channel: t.channel,
      category: t.category,
      subject: t.subject,
      body: t.body,
      requiredVars: requiredTemplateVars(t.body),
      active: t.active,
    }));
  }

  async createTemplate(auth: AuthContext, dto: CreateNotificationTemplateDto, request: AuthRequest) {
    const exists = await this.prisma.notificationTemplate.findUnique({
      where: { clinicId_code: { clinicId: auth.clinicId, code: dto.code } },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException({
        code: NOTIFICATION_ERROR_CODES.TEMPLATE_CONFLICT,
        message: 'Bu kodla şablon zaten var',
      });
    }
    const template = await this.prisma.notificationTemplate.create({
      data: {
        clinicId: auth.clinicId,
        code: dto.code,
        name: dto.name,
        channel: dto.channel,
        category: dto.category,
        subject: dto.subject ?? null,
        body: dto.body,
        active: true,
      },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'NOTIFICATION_TEMPLATE_CREATED',
      entityType: 'NotificationTemplate',
      entityId: template.id,
      metadata: { code: template.code, channel: template.channel },
    });
    void request;
    return {
      id: template.id,
      code: template.code,
      name: template.name,
      channel: template.channel,
      category: template.category,
      subject: template.subject,
      body: template.body,
      requiredVars: requiredTemplateVars(template.body),
      active: template.active,
    };
  }

  async updateTemplate(
    auth: AuthContext,
    id: string,
    dto: UpdateNotificationTemplateDto,
    request: AuthRequest,
  ) {
    const template = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!template || template.clinicId !== auth.clinicId) {
      throw new NotFoundException({
        code: NOTIFICATION_ERROR_CODES.TEMPLATE_NOT_FOUND,
        message: 'Şablon bulunamadı',
      });
    }
    const updated = await this.prisma.notificationTemplate.update({
      where: { id },
      data: {
        name: dto.name ?? template.name,
        category: dto.category ?? template.category,
        subject: dto.subject === undefined ? template.subject : dto.subject,
        body: dto.body ?? template.body,
        active: dto.active ?? template.active,
      },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'NOTIFICATION_TEMPLATE_UPDATED',
      entityType: 'NotificationTemplate',
      entityId: id,
      metadata: { code: updated.code },
    });
    void request;
    return {
      id: updated.id,
      code: updated.code,
      name: updated.name,
      channel: updated.channel,
      category: updated.category,
      subject: updated.subject,
      body: updated.body,
      requiredVars: requiredTemplateVars(updated.body),
      active: updated.active,
    };
  }

  // ------------------------------------------------------- onay / tercih durumu

  /** Sahibin kanal bazlı iletişim onay durumu — UI kilit nedenlerini gösterir. */
  async getConsentStatus(auth: AuthContext, ownerId: string) {
    const owner = await this.prisma.owner.findUnique({
      where: { id: ownerId },
      include: {
        contacts: true,
        consents: true,
      },
    });
    if (!owner || owner.clinicId !== auth.clinicId) {
      throw new NotFoundException({
        code: NOTIFICATION_ERROR_CODES.OWNER_NOT_FOUND,
        message: 'Hasta sahibi bulunamadı',
      });
    }
    const primaryPhone = owner.contacts.find((c) => c.kind === 'phone' && c.isPrimary)
      ?? owner.contacts.find((c) => c.kind === 'phone');
    const primaryEmail = owner.contacts.find((c) => c.kind === 'email' && c.isPrimary)
      ?? owner.contacts.find((c) => c.kind === 'email');
    const consentOf = (kind: string) => owner.consents.find((c) => c.kind === kind) ?? null;
    const state = (channel: NotificationChannel) => {
      const consentKind = consentKindForChannel(channel);
      const consent = consentKind ? consentOf(consentKind) : null;
      const granted = consentKind ? Boolean(consent && consent.granted && !consent.revokedAt) : true;
      return {
        channel,
        consentKind,
        granted,
        revokedAt: consent?.revokedAt?.toISOString() ?? null,
      };
    };
    return {
      ownerId: owner.id,
      ownerName: `${owner.firstName} ${owner.lastName}`,
      channels: {
        push: state('push'),
        sms: state('sms'),
        email: state('email'),
        whatsapp: state('whatsapp'),
      },
      contacts: {
        phone: primaryPhone?.value ?? null,
        email: primaryEmail?.value ?? null,
      },
    };
  }

  // ---------------------------------------------------------------- kuyruğa alma

  async enqueue(auth: AuthContext, dto: EnqueueNotificationDto, request: AuthRequest) {
    const channel = dto.channel as NotificationChannel;

    const owner = await this.prisma.owner.findUnique({
      where: { id: dto.ownerId },
      include: { contacts: true, consents: true },
    });
    if (!owner || owner.clinicId !== auth.clinicId) {
      throw new NotFoundException({
        code: NOTIFICATION_ERROR_CODES.OWNER_NOT_FOUND,
        message: 'Hasta sahibi bulunamadı',
      });
    }

    // Kanal alıcısı: dış kanallarda sahibin iletişim tercihinden çözülür;
    // push (uygulama içi) alıcı gerektirmez.
    const kind = consentKindForChannel(channel);
    let contact: { value: string } | null = null;
    if (channel === 'email') {
      contact =
        owner.contacts.find((c) => c.kind === 'email' && c.isPrimary)
        ?? owner.contacts.find((c) => c.kind === 'email')
        ?? null;
    } else if (channel !== 'push') {
      contact =
        owner.contacts.find((c) => c.kind === 'phone' && c.isPrimary)
        ?? owner.contacts.find((c) => c.kind === 'phone')
        ?? null;
    }
    if (channel !== 'push' && !contact) {
      throw new BadRequestException({
        code: NOTIFICATION_ERROR_CODES.RECIPIENT_MISSING,
        message:
          channel === 'email'
            ? 'Sahibin e-posta adresi kayıtlı değil'
            : 'Sahibin telefon numarası kayıtlı değil',
      });
    }

    // Onay kuralı — kabul kriteri: iletişim tercihi/izin kontrol edilmelidir.
    if (kind) {
      const consent = owner.consents.find((c) => c.kind === kind);
      const granted = Boolean(consent && consent.granted && !consent.revokedAt);
      if (!granted) {
        throw new ConflictException({
          code: NOTIFICATION_ERROR_CODES.CONSENT_REQUIRED,
          message: `${kind} onayı verilmemiş — bildirim kuyruğa alınamaz`,
          metadata: { consentKind: kind, ownerId: owner.id },
        });
      }
    }

    // Metin: şablonlu veya serbest. Şablonda eksik değişken 400 döner.
    let subject: string | null = dto.subject ?? null;
    let body = dto.body ?? '';
    if (dto.templateId) {
      const template = await this.prisma.notificationTemplate.findUnique({
        where: { id: dto.templateId },
      });
      if (!template || template.clinicId !== auth.clinicId || !template.active) {
        throw new NotFoundException({
          code: NOTIFICATION_ERROR_CODES.TEMPLATE_NOT_FOUND,
          message: 'Şablon bulunamadı veya pasif',
        });
      }
      const vars: Record<string, string> = {};
      for (const [key, value] of Object.entries(dto.vars ?? {})) {
        vars[key] = String(value);
      }
      const defaultVars: Record<string, string> = {
        ownerName: `${owner.firstName} ${owner.lastName}`,
        clinicName: 'VetCore',
        ...(vars as Record<string, string>),
      };
      try {
        if (template.subject) {
          subject = renderTemplate(template.subject, defaultVars);
        }
        body = renderTemplate(template.body, defaultVars);
      } catch (error) {
        if (error instanceof TemplateVarMissingError) {
          throw new BadRequestException({
            code: NOTIFICATION_ERROR_CODES.TEMPLATE_VAR_MISSING,
            message: error.message,
            metadata: { varName: error.varName },
          });
        }
        throw error;
      }
    }
    if (!body.trim()) {
      throw new BadRequestException({
        code: 'NOTIFICATION_BODY_REQUIRED',
        message: 'Bildirim gövdesi boş olamaz',
      });
    }

    const recipientValue = contact
      ? normalizeRecipient(channel, contact.value)
      : `in-app:${owner.id}`;
    const branchId = request.branchId ?? owner.clinicId;

    // Idempotent kuyruk: aynı anahtar ikinci kez yeni satır üretmez (REPLAY).
    const existing = await this.prisma.notification.findUnique({
      where: { clinicId_idempotencyKey: { clinicId: auth.clinicId, idempotencyKey: dto.idempotencyKey } },
      include: NOTIFICATION_INCLUDE,
    });
    if (existing) {
      return { ...this.mapNotification(existing), replayed: true };
    }

    const created = await this.prisma.notification.create({
      data: {
        clinicId: auth.clinicId,
        branchId,
        templateId: dto.templateId ?? null,
        channel,
        category: dto.category ?? 'custom',
        ownerId: owner.id,
        recipientValue,
        subject,
        body,
        status: 'queued',
        attempts: 0,
        idempotencyKey: dto.idempotencyKey,
        createdById: auth.staffId,
      },
      include: NOTIFICATION_INCLUDE,
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId,
      action: 'NOTIFICATION_ENQUEUED',
      entityType: 'Notification',
      entityId: created.id,
      metadata: { channel, category: created.category, ownerId: owner.id },
    });
    return { ...this.mapNotification(created), replayed: false };
  }

  // ------------------------------------------------------------------ kuyruk işleme

  /**
   * Kuyruk tiki: queued kayıtları koşullu claim ile işler. İki eşzamanlı
   * çağrı aynı kaydı çift işleyemez — claim koşullu UPDATE ile yapılır ve
   * kaybeden işleyici kaydı atlar. Sağlayıcı hatası buraya asla sızmaz.
   */
  async runQueue(auth: AuthContext, dto: RunNotificationQueueDto, request: AuthRequest) {
    const limit = dto.limit ?? 10;
    const queued = await this.prisma.notification.findMany({
      where: {
        clinicId: auth.clinicId,
        status: 'queued',
        scheduledFor: { lte: new Date() },
        ...(request.branchId ? { branchId: request.branchId } : {}),
      },
      orderBy: { scheduledFor: 'asc' },
      take: limit,
      select: { id: true },
    });

    const summary = {
      claimed: 0,
      sent: 0,
      retrying: 0,
      deadLettered: 0,
      failed: 0,
    };

    for (const { id } of queued) {
      // Koşullu claim: status hâlâ queued ise processing'e al (tek kazanan).
      const claimed = await this.prisma.notification.updateMany({
        where: { id, status: 'queued' },
        data: { status: 'processing' },
      });
      if (claimed.count === 0) continue;
      summary.claimed += 1;

      try {
        const outcome = await this.processOne(id);
        summary[outcome] += 1;
      } catch (error) {
        // Sağlayıcı/kuyruk hatası kayıt düzeyinde izole edilir — ana akış bozulmaz.
        await this.prisma.notification.updateMany({
          where: { id, status: 'processing' },
          data: {
            status: 'queued',
            scheduledFor: new Date(Date.now() + backoffDelayMs(1)),
            lastError: error instanceof Error ? error.message.slice(0, 500) : 'UNKNOWN_ERROR',
          },
        });
        summary.retrying += 1;
      }
    }
    void auth;
    return summary;
  }

  private async processOne(
    notificationId: string,
  ): Promise<'sent' | 'retrying' | 'deadLettered' | 'failed'> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) return 'failed';

    // Satır numarası GLOBAL devam eder (manuel retry sonrası unique çakışmaz);
    // bütçe sayacı (notification.attempts) ise çevrim yerelidir ve manuel
    // retry sıfırlar — operatör yeniden denerken bütçe tazelenir.
    const lastAttempt = await this.prisma.notificationAttempt.findFirst({
      where: { notificationId },
      orderBy: { attemptNo: 'desc' },
      select: { attemptNo: true },
    });
    const attemptNo = (lastAttempt?.attemptNo ?? 0) + 1;
    const cycleAttemptNo = notification.attempts + 1;
    const startedAt = new Date();
    const provider = this.providers.resolve(notification.channel as NotificationChannel);

    try {
      const result = await provider.send({
        channel: notification.channel as NotificationChannel,
        to: notification.recipientValue,
        subject: notification.subject,
        body: notification.body,
        idempotencyKey: notification.id,
      });
      await this.prisma.notificationAttempt.create({
        data: {
          notificationId,
          attemptNo,
          outcome: 'success',
          providerName: provider.name,
          providerMessageId: result.providerMessageId,
          startedAt,
          finishedAt: new Date(),
        },
      });
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: 'sent',
          attempts: cycleAttemptNo,
          sentAt: result.deliveredAt,
          lastError: null,
        },
      });
      return 'sent';
    } catch (error) {
      const message =
        error instanceof ProviderError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'UNKNOWN_PROVIDER_ERROR';
      const failureClass = classifyFailure(message);
      await this.prisma.notificationAttempt.create({
        data: {
          notificationId,
          attemptNo,
          outcome: failureClass,
          providerName: provider.name,
          providerMessageId: null,
          error: message.slice(0, 500),
          startedAt,
          finishedAt: new Date(),
        },
      });
      if (failureClass === 'permanent') {
        await this.prisma.notification.update({
          where: { id: notificationId },
          data: { status: 'failed', attempts: cycleAttemptNo, lastError: message.slice(0, 500) },
        });
        return 'failed';
      }
      if (cycleAttemptNo >= MAX_PROVIDER_ATTEMPTS) {
        await this.prisma.notification.update({
          where: { id: notificationId },
          data: {
            status: 'dead_letter',
            attempts: cycleAttemptNo,
            lastError: message.slice(0, 500),
          },
        });
        return 'deadLettered';
      }
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: 'queued',
          attempts: cycleAttemptNo,
          lastError: message.slice(0, 500),
          scheduledFor: new Date(Date.now() + backoffDelayMs(cycleAttemptNo)),
        },
      });
      return 'retrying';
    }
  }

  /** Manuel yeniden kuyruklama — operatör aksiyonu, denetlenir. */
  async retryOne(auth: AuthContext, id: string, request: AuthRequest) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.clinicId !== auth.clinicId) {
      throw new NotFoundException({
        code: NOTIFICATION_ERROR_CODES.NOTIFICATION_NOT_FOUND,
        message: 'Bildirim bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, notification.branchId ?? notification.clinicId);
    if (!canTransitionNotification(notification.status as NotificationStatus, 'queued')) {
      throw new ConflictException({
        code: NOTIFICATION_ERROR_CODES.INVALID_TRANSITION,
        message: `Bu durumdaki bildirim yeniden kuyruklanamaz: ${notification.status}`,
      });
    }
    const updated = await this.prisma.notification.update({
      where: { id },
      data: {
        status: 'queued',
        attempts: 0,
        scheduledFor: new Date(),
      },
      include: NOTIFICATION_INCLUDE,
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: notification.branchId,
      action: 'NOTIFICATION_RETRIED',
      entityType: 'Notification',
      entityId: id,
      metadata: { previousStatus: notification.status, attemptsReset: true },
    });
    return this.mapNotification(updated);
  }

  // ------------------------------------------------------------------ listeleme/rapor

  async listNotifications(auth: AuthContext, query: ListNotificationsQueryDto, request: AuthRequest) {
    const statusFilter =
      query.status && query.status !== 'all'
        ? { status: query.status as NotificationStatus }
        : {};
    const notifications = await this.prisma.notification.findMany({
      where: {
        clinicId: auth.clinicId,
        ...(request.branchId ? { branchId: request.branchId } : {}),
        ...statusFilter,
        ...(query.channel ? { channel: query.channel } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      },
      include: {
        template: { select: { id: true, code: true, name: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.take ?? 50, 100),
      skip: query.skip ?? 0,
    });
    const total = await this.prisma.notification.count({
      where: {
        clinicId: auth.clinicId,
        ...(request.branchId ? { branchId: request.branchId } : {}),
        ...statusFilter,
        ...(query.channel ? { channel: query.channel } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      },
    });
    return {
      items: notifications.map((n) => this.mapNotification(n)),
      total,
    };
  }

  async getNotification(auth: AuthContext, id: string, request: AuthRequest) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      include: NOTIFICATION_INCLUDE,
    });
    if (!notification || notification.clinicId !== auth.clinicId) {
      throw new NotFoundException({
        code: NOTIFICATION_ERROR_CODES.NOTIFICATION_NOT_FOUND,
        message: 'Bildirim bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, notification.branchId ?? notification.clinicId);
    return this.mapNotification(notification);
  }

  /** Teslim raporu — durum/kanal kırılımında sayımlar (UI KPI kartları). */
  async deliveryReport(auth: AuthContext, query: DeliveryReportQueryDto, request: AuthRequest) {
    const sinceDays = query.sinceDays ?? 30;
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const where = {
      clinicId: auth.clinicId,
      createdAt: { gte: since },
      ...(request.branchId ? { branchId: request.branchId } : {}),
    };
    const grouped = await this.prisma.notification.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const byChannel = await this.prisma.notification.groupBy({
      by: ['channel', 'status'],
      where,
      _count: { _all: true },
    });
    const statusCounts: Record<string, number> = {
      queued: 0,
      processing: 0,
      sent: 0,
      failed: 0,
      dead_letter: 0,
      skipped: 0,
    };
    for (const row of grouped) statusCounts[row.status] = row._count._all;
    const channelBreakdown = byChannel.reduce<Record<string, Record<string, number>>>(
      (acc, row) => {
        const bucket = acc[row.channel] ?? {};
        bucket[row.status] = row._count._all;
        acc[row.channel] = bucket;
        return acc;
      },
      {},
    );
    const total = Object.values(statusCounts).reduce((sum, n) => sum + n, 0);
    const delivered = statusCounts.sent ?? 0;
    const deliverability = total > 0 ? Math.round((delivered / total) * 1000) / 10 : 100;
    return {
      sinceDays,
      total,
      statusCounts,
      channelBreakdown,
      deliverabilityPercent: deliverability,
    };
  }
}
