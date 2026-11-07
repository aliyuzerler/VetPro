import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolvePrice, type PriceRow } from './services.domain';
import type { AuthContext } from '../common/auth/auth-context';
import type { AuthRequest } from '../common/auth/auth-context';
import type { CreateConsumptionRuleDto, CreateServiceDto, CreateServicePriceDto, UpdateServiceDto } from './services.dto';

/** Stabil hata kodları — istemci hata mesajlarını bu anahtarlarla ayırt eder. */
export const SERVICE_ERROR_CODES = {
  DUPLICATE_CODE: 'SERVICE_DUPLICATE_CODE',
  PRICE_NOT_FOUND: 'SERVICE_PRICE_NOT_FOUND',
  INVALID_PRICE_WINDOW: 'SERVICE_PRICE_INVALID_WINDOW',
} as const;

const SERVICE_INCLUDE = {
  prices: {
    orderBy: { validFrom: 'desc' as const },
    select: {
      id: true,
      branchId: true,
      branch: { select: { id: true, name: true, code: true } },
      currency: true,
      amount: true,
      taxCode: true,
      validFrom: true,
      validTo: true,
    },
  },
  consumptionRules: {
    where: { active: true },
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      defaultQty: true,
      unit: true,
      required: true,
      allocationPolicy: true,
      active: true,
    },
  },
} satisfies Prisma.ServiceInclude;

export type ServiceWithRelations = Prisma.ServiceGetPayload<{ include: typeof SERVICE_INCLUDE }>;

/**
 * Hizmet kataloğu servisi — Faz 06. Kategori/fiyat/süre tanımları, varsayılan
 * tüketim kuralı ve fiyat çözümleme (kabul kriteri: geçerlilik tarihleri +
 * şube override). Yazma uçları service.manage izni ister (controller).
 */
@Injectable()
export class ServicesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
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

  async list(
    auth: AuthContext,
    query: { category?: string; active?: boolean; search?: string },
  ) {
    const where: Prisma.ServiceWhereInput = {
      clinicId: auth.clinicId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { code: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const items = await this.prisma.service.findMany({
      where,
      include: SERVICE_INCLUDE,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return { items };
  }

  async detail(auth: AuthContext, serviceId: string): Promise<ServiceWithRelations> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, clinicId: auth.clinicId },
      include: SERVICE_INCLUDE,
    });
    if (!service) {
      throw new NotFoundException({ code: SERVICE_ERROR_CODES.PRICE_NOT_FOUND, message: 'Hizmet bulunamadı' });
    }
    return service;
  }

  async create(auth: AuthContext, dto: CreateServiceDto, request: AuthRequest) {
    const duplicate = await this.prisma.service.findFirst({
      where: { clinicId: auth.clinicId, code: dto.code },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: SERVICE_ERROR_CODES.DUPLICATE_CODE,
        message: 'Bu hizmet kodu zaten kullanılıyor',
      });
    }
    const service = await this.prisma.service.create({
      data: {
        clinicId: auth.clinicId,
        code: dto.code,
        name: dto.name,
        category: dto.category,
        durationMin: dto.durationMin,
        notes: dto.notes ?? null,
      },
      include: SERVICE_INCLUDE,
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        action: 'SERVICE_CREATED',
        entityType: 'Service',
        entityId: service.id,
        metadata: { code: service.code, category: service.category },
      },
      request,
    );
    return service;
  }

  async update(auth: AuthContext, serviceId: string, dto: UpdateServiceDto, request: AuthRequest) {
    const service = await this.detail(auth, serviceId);
    const updated = await this.prisma.service.update({
      where: { id: service.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.durationMin !== undefined ? { durationMin: dto.durationMin } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      include: SERVICE_INCLUDE,
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        action: 'SERVICE_UPDATED',
        entityType: 'Service',
        entityId: updated.id,
        metadata: { changes: dto as Record<string, unknown> },
      },
      request,
    );
    return updated;
  }

  /** Şube geçerliliğini doğrular (dolu branchId override'ı için). */
  private async validateBranch(auth: AuthContext, request: AuthRequest, branchId?: string): Promise<void> {
    if (!branchId) return;
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, clinicId: auth.clinicId },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Şube bulunamadı' });
    }
    this.requireBranchAccess(auth, request, branchId);
  }

  async createPrice(
    auth: AuthContext,
    serviceId: string,
    dto: CreateServicePriceDto,
    request: AuthRequest,
  ) {
    const service = await this.detail(auth, serviceId);
    await this.validateBranch(auth, request, dto.branchId);
    const validFrom = new Date(dto.validFrom);
    const validTo = dto.validTo ? new Date(dto.validTo) : null;
    if (validTo && validTo.getTime() <= validFrom.getTime()) {
      throw new ConflictException({
        code: SERVICE_ERROR_CODES.INVALID_PRICE_WINDOW,
        message: 'Fiyat geçerlilik aralığı hatalı (validTo validFrom sonrası olmalı)',
      });
    }
    const price = await this.prisma.servicePrice.create({
      data: {
        serviceId: service.id,
        branchId: dto.branchId ?? null,
        currency: dto.currency ?? 'TRY',
        amount: new Prisma.Decimal(dto.amount.toFixed(2)),
        taxCode: dto.taxCode ?? null,
        validFrom,
        validTo,
      },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        action: 'SERVICE_PRICE_CREATED',
        entityType: 'ServicePrice',
        entityId: price.id,
        metadata: {
          serviceId: service.id,
          branchId: dto.branchId ?? null,
          amount: dto.amount,
          validFrom,
          validTo,
        },
      },
      request,
    );
    return price;
  }

  async listPrices(auth: AuthContext, serviceId: string) {
    const service = await this.detail(auth, serviceId);
    const prices = await this.prisma.servicePrice.findMany({
      where: { serviceId: service.id },
      orderBy: { validFrom: 'desc' as const },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
    return { items: prices };
  }

  async createConsumptionRule(
    auth: AuthContext,
    serviceId: string,
    dto: CreateConsumptionRuleDto,
    request: AuthRequest,
  ) {
    const service = await this.detail(auth, serviceId);
    const rule = await this.prisma.serviceConsumptionRule.create({
      data: {
        serviceId: service.id,
        defaultQty: new Prisma.Decimal(dto.defaultQty.toFixed(3)),
        unit: dto.unit ?? null,
        required: dto.required ?? false,
        allocationPolicy: dto.allocationPolicy ?? 'fifo',
      },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        action: 'SERVICE_RULE_CREATED',
        entityType: 'ServiceConsumptionRule',
        entityId: rule.id,
        metadata: { serviceId: service.id, defaultQty: dto.defaultQty, unit: dto.unit ?? null },
      },
      request,
    );
    return rule;
  }

  async deleteConsumptionRule(
    auth: AuthContext,
    serviceId: string,
    ruleId: string,
    request: AuthRequest,
  ) {
    const service = await this.detail(auth, serviceId);
    const rule = await this.prisma.serviceConsumptionRule.findFirst({
      where: { id: ruleId, serviceId: service.id },
    });
    if (!rule) {
      throw new NotFoundException({ code: 'RULE_NOT_FOUND', message: 'Tüketim kuralı bulunamadı' });
    }
    await this.prisma.serviceConsumptionRule.update({
      where: { id: rule.id },
      data: { active: false },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        action: 'SERVICE_RULE_DEACTIVATED',
        entityType: 'ServiceConsumptionRule',
        entityId: rule.id,
        metadata: { serviceId: service.id },
      },
      request,
    );
    return { deactivated: true };
  }

  /**
   * Hizmet kaydı satırları için fiyat çözümleme. EncountersService kullanır:
   * şube override > genel fiyat, geçerlilik penceresi + en yeni validFrom.
   */
  async resolvePricesForRecord(
    clinicId: string,
    branchId: string,
    serviceIds: string[],
    at: Date = new Date(),
  ): Promise<Map<string, { amount: number; priceId: string; source: 'branch_override' | 'global' }>> {
    const services = await this.prisma.service.findMany({
      where: { id: { in: serviceIds }, clinicId, active: true },
      include: { prices: true },
    });
    const result = new Map<string, { amount: number; priceId: string; source: 'branch_override' | 'global' }>();
    for (const service of services) {
      const rows: PriceRow[] = service.prices.map((p) => ({
        id: p.id,
        branchId: p.branchId,
        amount: p.amount,
        validFrom: p.validFrom,
        validTo: p.validTo,
      }));
      const resolved = resolvePrice(rows, branchId, at);
      if (resolved) {
        result.set(service.id, {
          amount: resolved.amount,
          priceId: resolved.priceId,
          source: resolved.source,
        });
      }
    }
    return result;
  }
}
