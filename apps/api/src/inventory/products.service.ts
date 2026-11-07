import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import { isLotSelectable, type FefoLot } from './inventory.domain';
import type {
  CreateCategoryDto,
  CreateConversionDto,
  CreateProductDto,
  CreateUnitDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from './inventory.dto';

/** Stabil hata kodları — istemci hata mesajlarını bu anahtarlarla ayırt eder. */
export const PRODUCT_ERROR_CODES = {
  DUPLICATE_CODE: 'PRODUCT_DUPLICATE_CODE',
  DUPLICATE_BARCODE: 'PRODUCT_DUPLICATE_BARCODE',
  DUPLICATE_CATEGORY: 'PRODUCT_DUPLICATE_CATEGORY',
  DUPLICATE_UNIT: 'PRODUCT_DUPLICATE_UNIT',
  DUPLICATE_CONVERSION: 'PRODUCT_DUPLICATE_CONVERSION',
  NOT_FOUND: 'PRODUCT_NOT_FOUND',
  UNIT_NOT_FOUND: 'UNIT_NOT_FOUND',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  IN_USE: 'PRODUCT_IN_USE',
} as const;

const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true } },
  baseUnit: { select: { id: true, key: true, name: true } },
  conversions: {
    select: {
      id: true,
      fromUnit: { select: { id: true, key: true, name: true } },
      toUnit: { select: { id: true, key: true, name: true } },
      factor: true,
    },
  },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

const decimal3 = (value: number) => new Prisma.Decimal(value.toFixed(3));
const decimal2 = (value: number) => new Prisma.Decimal(value.toFixed(2));

/**
 * Ürün kartı servisi — Faz 07. Kategori/birim/dönüşüm kataloğu, ürün CRUD,
 * FEFO parti görünümü ve ürün bazlı bakiyeler. Yazma uçları product.manage
 * izni ister (controller); okuma uçları kimlik + şube kapsamı yeterlidir.
 */
@Injectable()
export class ProductsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async recordAudit(
    input: {
      clinicId: string;
      staffId?: string | null;
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

  // ── Ürün ──────────────────────────────────────────────────────────────────

  async list(auth: AuthContext, query: ListProductsQueryDto) {
    const where: Prisma.ProductWhereInput = {
      clinicId: auth.clinicId,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { code: { contains: query.search, mode: 'insensitive' as const } },
              { barcode: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const items = await this.prisma.product.findMany({
      where,
      include: PRODUCT_INCLUDE,
      orderBy: [{ name: 'asc' }],
    });
    return { items };
  }

  async detail(auth: AuthContext, productId: string): Promise<ProductWithRelations> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, clinicId: auth.clinicId },
      include: PRODUCT_INCLUDE,
    });
    if (!product) {
      throw new NotFoundException({ code: PRODUCT_ERROR_CODES.NOT_FOUND, message: 'Ürün bulunamadı' });
    }
    return product;
  }

  async create(auth: AuthContext, dto: CreateProductDto, request: AuthRequest) {
    const duplicate = await this.prisma.product.findFirst({
      where: { clinicId: auth.clinicId, code: dto.code },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: PRODUCT_ERROR_CODES.DUPLICATE_CODE,
        message: 'Bu ürün kodu (SKU) zaten kullanılıyor',
      });
    }
    if (dto.barcode) {
      const barcodeDup = await this.prisma.product.findFirst({
        where: { clinicId: auth.clinicId, barcode: dto.barcode },
        select: { id: true },
      });
      if (barcodeDup) {
        throw new ConflictException({
          code: PRODUCT_ERROR_CODES.DUPLICATE_BARCODE,
          message: 'Bu barkod zaten kayıtlı',
        });
      }
    }
    await this.requireUnit(auth, dto.baseUnitId);
    if (dto.categoryId) await this.requireCategory(auth, dto.categoryId);

    const product = await this.prisma.product.create({
      data: {
        clinicId: auth.clinicId,
        code: dto.code,
        name: dto.name,
        categoryId: dto.categoryId ?? null,
        barcode: dto.barcode ?? null,
        trackingType: dto.trackingType,
        baseUnitId: dto.baseUnitId,
        minStock: decimal3(dto.minStock ?? 0),
        defaultSalePrice:
          dto.defaultSalePrice !== undefined ? decimal2(dto.defaultSalePrice) : null,
        notes: dto.notes ?? null,
      },
      include: PRODUCT_INCLUDE,
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        action: 'PRODUCT_CREATED',
        entityType: 'Product',
        entityId: product.id,
        metadata: { code: product.code, trackingType: product.trackingType },
      },
      request,
    );
    return product;
  }

  async update(auth: AuthContext, productId: string, dto: UpdateProductDto, request: AuthRequest) {
    const product = await this.detail(auth, productId);
    if (dto.categoryId) await this.requireCategory(auth, dto.categoryId);
    const updated = await this.prisma.product.update({
      where: { id: product.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.barcode !== undefined ? { barcode: dto.barcode } : {}),
        ...(dto.minStock !== undefined ? { minStock: decimal3(dto.minStock) } : {}),
        ...(dto.defaultSalePrice !== undefined
          ? { defaultSalePrice: decimal2(dto.defaultSalePrice) }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      include: PRODUCT_INCLUDE,
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        action: 'PRODUCT_UPDATED',
        entityType: 'Product',
        entityId: updated.id,
        metadata: { changes: dto as Record<string, unknown> },
      },
      request,
    );
    return updated;
  }

  // ── FEFO parti görünümü ───────────────────────────────────────────────────

  /**
   * Ürünün depodaki partileri FEFO sıralı. includeBlocked=false yalnızca
   * seçilebilir partileri döner (expired/quarantined/exhausted hariç) —
   * kabul kriteri: bloklu parti tüketim seçimine düşmez.
   */
  async listLots(
    auth: AuthContext,
    request: AuthRequest,
    productId: string,
    options: { warehouseId?: string; includeBlocked?: boolean },
  ) {
    const product = await this.detail(auth, productId);
    let warehouses: { id: string; branchId: string }[];
    if (options.warehouseId) {
      const warehouse = await this.prisma.warehouse.findUnique({
        where: { id: options.warehouseId },
        select: { id: true, branchId: true },
      });
      if (!warehouse) {
        throw new NotFoundException({ code: 'WAREHOUSE_NOT_FOUND', message: 'Depo bulunamadı' });
      }
      this.requireBranchAccess(auth, request, warehouse.branchId);
      warehouses = [warehouse];
    } else {
      warehouses = await this.prisma.warehouse.findMany({
        where: { branch: { clinicId: auth.clinicId } },
        select: { id: true, branchId: true },
      });
    }

    const lots = await this.prisma.inventoryLot.findMany({
      where: {
        productId: product.id,
        warehouseId: { in: warehouses.map((w) => w.id) },
      },
      include: { warehouse: { select: { id: true, name: true, branch: { select: { name: true } } } } },
    });
    const balances = await this.prisma.stockBalance.findMany({
      where: {
        productId: product.id,
        warehouseId: { in: warehouses.map((w) => w.id) },
        lotId: { not: null },
      },
    });
    const balanceByLot = new Map(balances.map((b) => [b.lotId!, b.qtyOnHand.toNumber()]));

    const now = new Date();
    const mapped = lots.map((lot) => {
      const fefo: FefoLot = {
        id: lot.id,
        lotCode: lot.lotCode,
        expiresAt: lot.expiresAt,
        status: lot.status,
        receivedAt: lot.receivedAt,
        qtyOnHand: balanceByLot.get(lot.id) ?? 0,
      };
      const blockReason = isLotSelectable(fefo, now);
      return {
        id: lot.id,
        lotCode: lot.lotCode,
        expiresAt: lot.expiresAt,
        status: lot.status,
        unitCost: lot.unitCost.toNumber(),
        receivedAt: lot.receivedAt,
        qtyOnHand: fefo.qtyOnHand,
        warehouseId: lot.warehouseId,
        warehouseName: lot.warehouse.name,
        branchName: lot.warehouse.branch.name,
        blockReason,
      };
    });
    // FEFO sırası: en yakın SKT önce, tarihsiz sona; eşitlikte önce alınan önce
    const sorted = mapped.sort(
      (a, b) =>
        (a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY) -
          (b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY) ||
        a.receivedAt.getTime() - b.receivedAt.getTime(),
    );
    const items = options.includeBlocked ? sorted : sorted.filter((m) => m.blockReason === null);
    return { items };
  }

  // ── Kategori / birim / dönüşüm ────────────────────────────────────────────

  async listCategories(auth: AuthContext) {
    const items = await this.prisma.productCategory.findMany({
      where: { clinicId: auth.clinicId },
      orderBy: { name: 'asc' },
    });
    return { items };
  }

  async createCategory(auth: AuthContext, dto: CreateCategoryDto, request: AuthRequest) {
    const duplicate = await this.prisma.productCategory.findFirst({
      where: { clinicId: auth.clinicId, name: dto.name },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: PRODUCT_ERROR_CODES.DUPLICATE_CATEGORY,
        message: 'Bu kategori zaten var',
      });
    }
    const category = await this.prisma.productCategory.create({
      data: { clinicId: auth.clinicId, name: dto.name },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        action: 'PRODUCT_CATEGORY_CREATED',
        entityType: 'ProductCategory',
        entityId: category.id,
        metadata: { name: category.name },
      },
      request,
    );
    return category;
  }

  async listUnits(auth: AuthContext) {
    const items = await this.prisma.unit.findMany({
      where: { clinicId: auth.clinicId },
      orderBy: { name: 'asc' },
    });
    return { items };
  }

  async createUnit(auth: AuthContext, dto: CreateUnitDto, request: AuthRequest) {
    const duplicate = await this.prisma.unit.findFirst({
      where: { clinicId: auth.clinicId, key: dto.key },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: PRODUCT_ERROR_CODES.DUPLICATE_UNIT,
        message: 'Bu birim anahtarı zaten var',
      });
    }
    const unit = await this.prisma.unit.create({
      data: { clinicId: auth.clinicId, key: dto.key, name: dto.name },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        action: 'UNIT_CREATED',
        entityType: 'Unit',
        entityId: unit.id,
        metadata: { key: unit.key },
      },
      request,
    );
    return unit;
  }

  async listConversions(auth: AuthContext, productId: string) {
    const product = await this.detail(auth, productId);
    const conversions = await this.prisma.productUnitConversion.findMany({
      where: { productId: product.id },
      include: {
        fromUnit: { select: { id: true, key: true, name: true } },
        toUnit: { select: { id: true, key: true, name: true } },
      },
      orderBy: { id: 'asc' },
    });
    return { items: conversions };
  }

  async createConversion(
    auth: AuthContext,
    productId: string,
    dto: CreateConversionDto,
    request: AuthRequest,
  ) {
    const product = await this.detail(auth, productId);
    await this.requireUnit(auth, dto.fromUnitId);
    await this.requireUnit(auth, dto.toUnitId);
    const duplicate = await this.prisma.productUnitConversion.findFirst({
      where: { productId: product.id, fromUnitId: dto.fromUnitId, toUnitId: dto.toUnitId },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: PRODUCT_ERROR_CODES.DUPLICATE_CONVERSION,
        message: 'Bu birim çifti için dönüşüm zaten tanımlı',
      });
    }
    const conversion = await this.prisma.productUnitConversion.create({
      data: {
        productId: product.id,
        fromUnitId: dto.fromUnitId,
        toUnitId: dto.toUnitId,
        factor: new Prisma.Decimal(dto.factor.toFixed(6)),
      },
      include: {
        fromUnit: { select: { id: true, key: true, name: true } },
        toUnit: { select: { id: true, key: true, name: true } },
      },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        action: 'PRODUCT_CONVERSION_CREATED',
        entityType: 'ProductUnitConversion',
        entityId: conversion.id,
        metadata: { productId: product.id, factor: dto.factor },
      },
      request,
    );
    return conversion;
  }

  private async requireUnit(auth: AuthContext, unitId: string): Promise<void> {
    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, clinicId: auth.clinicId },
      select: { id: true },
    });
    if (!unit) {
      throw new NotFoundException({ code: PRODUCT_ERROR_CODES.UNIT_NOT_FOUND, message: 'Birim bulunamadı' });
    }
  }

  private async requireCategory(auth: AuthContext, categoryId: string): Promise<void> {
    const category = await this.prisma.productCategory.findFirst({
      where: { id: categoryId, clinicId: auth.clinicId },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException({
        code: PRODUCT_ERROR_CODES.CATEGORY_NOT_FOUND,
        message: 'Kategori bulunamadı',
      });
    }
  }
}
