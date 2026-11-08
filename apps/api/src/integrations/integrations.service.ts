import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import {
  containsSecretKey,
  type IntegrationKind,
  type IntegrationMode,
} from './integrations.domain';
import { IntegrationAdapterFactory } from './adapters/sandbox-adapters';
import type {
  CreateIntegrationConnectionDto,
  UpdateIntegrationConnectionDto,
} from './integrations.dto';

export const INTEGRATION_ERROR_CODES = {
  CONNECTION_NOT_FOUND: 'INTEGRATION_CONNECTION_NOT_FOUND',
  KIND_CONFLICT: 'INTEGRATION_KIND_CONFLICT',
  SECRET_NOT_ALLOWED: 'INTEGRATION_SECRET_NOT_ALLOWED',
  BRANCH_SCOPE: 'BRANCH_SCOPE',
} as const;

/**
 * Entegrasyon servisi — Faz 12: bağlantı kaydı (secret'sız), adapter
 * sözleşmesi ve sandbox kontrolü.
 *
 * Kabul kriterleriyle bağı:
 * - "Provider secret sadece server-side tutulmalı / bundle'a girmemeli":
 *   config yazım anında secret anahtar deseniyle taranır (SECRET_NOT_ALLOWED);
 *   canlı sağlayıcı kimlik bilgileri yalnız sunucu env'sinden okunur ve API
 *   yanıtlarına asla eklenmez.
 * - "Canlı yetkili entegrasyon yoksa UI'da açıkça belirt": list yanıtındaki
 *   hasLiveIntegration alanı mode='live' + status='active' yoksa false döner.
 */
@Injectable()
export class IntegrationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(IntegrationAdapterFactory) private readonly adapterFactory: IntegrationAdapterFactory,
  ) {}

  private async recordAudit(input: {
    clinicId: string;
    staffId?: string | null;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.audit.record(input, this.prisma);
  }

  private requireClinicAccess(auth: AuthContext, request: AuthRequest): void {
    // Entegrasyon bağlantıları klinik kapsamlıdır; şube yetkisi yeterlidir.
    if (request.branchId && !auth.allBranches && !auth.branchIds.includes(request.branchId)) {
      throw new ForbiddenException({
        code: INTEGRATION_ERROR_CODES.BRANCH_SCOPE,
        message: 'Şube erişiminiz yok',
      });
    }
  }

  private mapConnection(connection: {
    id: string;
    clinicId: string;
    kind: string;
    providerName: string;
    mode: string;
    status: string;
    config: unknown;
    lastCheckAt: Date | null;
    lastCheckResult: string | null;
    updatedAt: Date;
  }) {
    return {
      id: connection.id,
      kind: connection.kind,
      kindLabel: connection.kind === 'einvoice' ? 'E-Fatura' : 'Lab Entegrasyonu',
      providerName: connection.providerName,
      mode: connection.mode as IntegrationMode,
      status: connection.status,
      // Secret'sız config — yazım anında taranır, okuma anında sızma yok.
      config: (connection.config ?? null) as Record<string, unknown> | null,
      lastCheckAt: connection.lastCheckAt?.toISOString() ?? null,
      lastCheckResult: connection.lastCheckResult,
      updatedAt: connection.updatedAt.toISOString(),
    };
  }

  async list(auth: AuthContext, request: AuthRequest) {
    this.requireClinicAccess(auth, request);
    const connections = await this.prisma.integrationConnection.findMany({
      where: { clinicId: auth.clinicId },
      orderBy: { kind: 'asc' },
    });
    const hasLiveIntegration = connections.some(
      (c) => c.mode === 'live' && c.status === 'active',
    );
    return {
      items: connections.map((c) => this.mapConnection(c)),
      /** Canlı yetkili entegrasyon yok — UI bu alanla uyarıyı gösterir. */
      hasLiveIntegration,
      liveNotice: hasLiveIntegration
        ? null
        : 'Canlı yetkili entegrasyon yok — çıkışlar yalnızca sandbox modunda çalışır',
      /** Sağlayıcı secret'ları sunucu env'sinden okunur; bu yanıtta YOKTUR. */
      secretPolicy: 'Provider secret yalnızca sunucu tarafında tutulur ve API yanıtlarına dahil edilmez',
    };
  }

  async create(auth: AuthContext, dto: CreateIntegrationConnectionDto, request: AuthRequest) {
    this.requireClinicAccess(auth, request);
    if (containsSecretKey(dto.config)) {
      throw new BadRequestException({
        code: INTEGRATION_ERROR_CODES.SECRET_NOT_ALLOWED,
        message: `Config içinde gizli anahtar yasak: ${containsSecretKey(dto.config)} — secret yalnız sunucu env'sinde tutulur`,
      });
    }
    const exists = await this.prisma.integrationConnection.findUnique({
      where: { clinicId_kind: { clinicId: auth.clinicId, kind: dto.kind } },
      select: { id: true },
    });
    if (exists) {
      throw new BadRequestException({
        code: INTEGRATION_ERROR_CODES.KIND_CONFLICT,
        message: 'Bu tür için bağlantı zaten var — güncelleyin',
      });
    }
    const created = await this.prisma.integrationConnection.create({
      data: {
        clinicId: auth.clinicId,
        kind: dto.kind,
        providerName: dto.providerName,
        mode: 'sandbox',
        status: 'inactive',
        config: (dto.config ?? undefined) as never,
      },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'INTEGRATION_CONNECTION_CREATED',
      entityType: 'IntegrationConnection',
      entityId: created.id,
      metadata: { kind: created.kind, providerName: created.providerName },
    });
    return this.mapConnection(created);
  }

  async update(
    auth: AuthContext,
    id: string,
    dto: UpdateIntegrationConnectionDto,
    request: AuthRequest,
  ) {
    this.requireClinicAccess(auth, request);
    const connection = await this.prisma.integrationConnection.findUnique({ where: { id } });
    if (!connection || connection.clinicId !== auth.clinicId) {
      throw new NotFoundException({
        code: INTEGRATION_ERROR_CODES.CONNECTION_NOT_FOUND,
        message: 'Entegrasyon bağlantısı bulunamadı',
      });
    }
    if (containsSecretKey(dto.config)) {
      throw new BadRequestException({
        code: INTEGRATION_ERROR_CODES.SECRET_NOT_ALLOWED,
        message: `Config içinde gizli anahtar yasak: ${containsSecretKey(dto.config)} — secret yalnız sunucu env'sinde tutulur`,
      });
    }
    // mode='live' yalnız yetkili sözleşmeyle açılır: demo/API yolu mode'u
    // değiştirmez (canlı entegrasyon yoksa UI bunu açıkça raporlar).
    const updated = await this.prisma.integrationConnection.update({
      where: { id },
      data: {
        status: dto.status ?? connection.status,
        ...(dto.config === undefined ? {} : { config: dto.config as never }),
      },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'INTEGRATION_CONNECTION_UPDATED',
      entityType: 'IntegrationConnection',
      entityId: id,
      metadata: { status: updated.status },
    });
    return this.mapConnection(updated);
  }

  /** Sandbox kontrolü — adapter sözleşmesinin ping'i koşar ve sonucu kaydeder. */
  async runSandboxCheck(auth: AuthContext, id: string, request: AuthRequest) {
    this.requireClinicAccess(auth, request);
    const connection = await this.prisma.integrationConnection.findUnique({ where: { id } });
    if (!connection || connection.clinicId !== auth.clinicId) {
      throw new NotFoundException({
        code: INTEGRATION_ERROR_CODES.CONNECTION_NOT_FOUND,
        message: 'Entegrasyon bağlantısı bulunamadı',
      });
    }
    const adapter = this.adapterFactory.resolve(
      connection.kind as IntegrationKind,
      connection.providerName,
      connection.mode as IntegrationMode,
    );
    const result = await adapter.ping(
      (connection.config ?? null) as Record<string, unknown> | null,
    );
    const stamped = await this.prisma.integrationConnection.update({
      where: { id },
      data: {
        lastCheckAt: new Date(),
        lastCheckResult: `${result.ok ? 'OK' : 'FAIL'} — ${result.detail}`,
      },
    });
    await this.recordAudit({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      action: 'INTEGRATION_SANDBOX_CHECK',
      entityType: 'IntegrationConnection',
      entityId: id,
      metadata: { kind: connection.kind, ok: result.ok },
    });
    return this.mapConnection(stamped);
  }
}
