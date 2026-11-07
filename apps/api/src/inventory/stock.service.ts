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
  allocateFefo,
  countDifference,
  endOfDay,
  InsufficientStockError,
  isLotSelectable,
  round3,
  type FefoLot,
} from './inventory.domain';
import type {
  CompleteCountDto,
  ConsumptionLineDto,
  CreateAdjustmentDto,
  CreateConsumptionDto,
  CreateCountDto,
  CreateReceiptDto,
  CreateSupplierReturnDto,
  CreateTemperatureLogDto,
  CreateTransferDto,
  ListBalancesQueryDto,
  ListMovementsQueryDto,
  ReceiptLineDto,
  TransferLineDto,
  UpdateCountLinesDto,
} from './inventory.dto';

/** Stabil hata kodları — istemci hata mesajlarını bu anahtarlarla ayırt eder. */
export const STOCK_ERROR_CODES = {
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  LOT_BLOCKED: 'LOT_BLOCKED',
  LOT_CONFLICT: 'LOT_CONFLICT',
  LOT_NOT_FOUND: 'LOT_NOT_FOUND',
  PRODUCT_NOT_LOT_TRACKED: 'PRODUCT_NOT_LOT_TRACKED',
  PRODUCT_LOT_TRACKED: 'PRODUCT_LOT_TRACKED',
  WAREHOUSE_NOT_FOUND: 'WAREHOUSE_NOT_FOUND',
  SAME_WAREHOUSE: 'TRANSFER_SAME_WAREHOUSE',
  TRANSFER_NOT_FOUND: 'TRANSFER_NOT_FOUND',
  TRANSFER_STATE: 'TRANSFER_INVALID_STATE',
  COUNT_NOT_FOUND: 'COUNT_NOT_FOUND',
  COUNT_STATE: 'COUNT_INVALID_STATE',
  COUNT_REASON_REQUIRED: 'COUNT_REASON_REQUIRED',
  LOT_MERGE_MISMATCH: 'LOT_MERGE_MISMATCH',
  SUPPLIER_NOT_FOUND: 'SUPPLIER_NOT_FOUND',
} as const;

/** Defter referans tipleri */
const REF_TRANSFER = 'StockTransfer';
const REF_COUNT = 'StockCount';

const decimal3 = (value: number) => new Prisma.Decimal(value.toFixed(3));
const decimal2 = (value: number) => new Prisma.Decimal(value.toFixed(2));

/** Defter satırı girdisi — işaretli qty (giriş +, çıkış −). */
interface LedgerLineInput {
  productId: string;
  lotId: string | null;
  qty: number;
  unitCost: number;
}

/**
 * Stok çekirdek servisi — Faz 07.
 *
 * Bütünlük modeli (agents.md + inventory-finance-integrity becerisi):
 * - Defter append-only: hareket/satır update+delete API'de yok, veritabanı
 *   tetikleyicileriyle de blokludur; düzeltme yalnızca adjustment hareketiyle.
 * - Bakiye projeksiyonu defterle aynı işlemde yazılır: giriş ensure+increment,
 *   çıkış atomik koşullu azaltım (qtyOnHand >= qty) — eş zamanlı iki tüketimde
 *   negatif stok oluşamaz (kabul kriteri 6).
 * - Mal kabul lot/SKT/maliyet ile kayıt açar (kabul kriteri 1); aynı
 *   (kod, SKT, maliyet) ile gelen kabul mevcut partiye eklenir, uyuşmazlıkta
 *   LOT_CONFLICT verilir.
 * - Expired/karantina partileri tüketimde seçilemez (kabul kriteri 3).
 * - Transfer iki aşamalı: dispatch kaynak bakiyeyi düşer + 'transfer_out'
 *   yazar (yolda), receive hedef depo stoğunu artırır (kabul kriteri 4).
 * - Sayım tamamlama gerekçe ister, her fark için 'adjustment' yazar ve
 *   denetim kaydı üretir (kabul kriteri 5).
 */
@Injectable()
export class StockService {
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

  private async requireWarehouse(auth: AuthContext, request: AuthRequest, warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true, branchId: true, name: true, active: true },
    });
    if (!warehouse) {
      throw new NotFoundException({
        code: STOCK_ERROR_CODES.WAREHOUSE_NOT_FOUND,
        message: 'Depo bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, warehouse.branchId);
    return warehouse;
  }

  private async requireProduct(auth: AuthContext, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, clinicId: auth.clinicId },
    });
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Ürün bulunamadı' });
    }
    return product;
  }

  /**
   * Bakiye satırını bulur/yoksa oluşturur (0'dan başlar). lotId null bileşik
   * unique seçicisinde kullanılamadığından findFirst + create (P2002 yarış
   * güvencesi) deseni uygulanır.
   */
  private async ensureBalance(
    tx: Prisma.TransactionClient,
    input: { clinicId: string; productId: string; warehouseId: string; lotId: string | null },
  ) {
    const existing = await tx.stockBalance.findFirst({
      where: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        lotId: input.lotId ?? null,
      },
    });
    if (existing) return existing;
    try {
      return await tx.stockBalance.create({
        data: {
          clinicId: input.clinicId,
          productId: input.productId,
          warehouseId: input.warehouseId,
          lotId: input.lotId ?? null,
          qtyOnHand: decimal3(0),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await tx.stockBalance.findFirst({
          where: {
            productId: input.productId,
            warehouseId: input.warehouseId,
            lotId: input.lotId ?? null,
          },
        });
        if (raced) return raced;
      }
      throw error;
    }
  }

  /** Defter hareketi + satırları + bakiye mutabakatını tek işlemde yazar. */
  private async postMovement(
    tx: Prisma.TransactionClient,
    input: {
      clinicId: string;
      branchId: string;
      warehouseId: string;
      kind: string;
      supplierId?: string | null;
      refType?: string | null;
      refId?: string | null;
      reason?: string | null;
      note?: string | null;
      staffId?: string | null;
      idempotencyKey?: string | null;
      lines: LedgerLineInput[];
      /** Çıkış satırları için atomik koşullu azaltım uygula */
      enforceDecrease?: boolean;
    },
  ) {
    const movement = await tx.stockMovement.create({
      data: {
        clinicId: input.clinicId,
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        kind: input.kind,
        supplierId: input.supplierId ?? null,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        reason: input.reason ?? null,
        note: input.note ?? null,
        performedByStaffId: input.staffId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
    for (const line of input.lines) {
      await tx.stockMovementLine.create({
        data: {
          movementId: movement.id,
          productId: line.productId,
          lotId: line.lotId ?? null,
          qty: decimal3(line.qty),
          unitCost: decimal2(line.unitCost),
        },
      });
      if (line.qty > 0) {
        const balance = await this.ensureBalance(tx, {
          clinicId: input.clinicId,
          productId: line.productId,
          warehouseId: input.warehouseId,
          lotId: line.lotId,
        });
        await tx.stockBalance.update({
          where: { id: balance.id },
          data: { qtyOnHand: { increment: decimal3(line.qty) } },
        });
      } else if (line.qty < 0 && input.enforceDecrease !== false) {
        // Atomik koşullu azaltım: bakiye yetersizse satır etkilenmez → count 0
        const result = await tx.stockBalance.updateMany({
          where: {
            productId: line.productId,
            warehouseId: input.warehouseId,
            lotId: line.lotId ?? null,
            qtyOnHand: { gte: decimal3(-line.qty) },
          },
          data: { qtyOnHand: { decrement: decimal3(-line.qty) } },
        });
        if (result.count === 0) {
          throw new ConflictException({
            code: STOCK_ERROR_CODES.INSUFFICIENT_STOCK,
            message: 'Yetersiz stok: hareket yazılamadı (bakiye defterle tutarsız olurdu)',
          });
        }
      }
    }
    return movement;
  }

  // ── Mal kabul (kabul kriteri 1) ───────────────────────────────────────────

  async createReceipt(auth: AuthContext, dto: CreateReceiptDto, request: AuthRequest) {
    const warehouse = await this.requireWarehouse(auth, request, dto.warehouseId);

    // Ürünler ve lot takibi doğrulanır
    const products = new Map<string, Awaited<ReturnType<typeof this.requireProduct>>>();
    for (const line of dto.lines) {
      const product = await this.requireProduct(auth, line.productId);
      products.set(line.productId, product);
      if (product.trackingType === 'lot' && !line.lotCode) {
        throw new BadRequestException({
          code: STOCK_ERROR_CODES.PRODUCT_LOT_TRACKED,
          message: `Ürün ${product.code} parti takiplidir — lot kodu zorunlu`,
        });
      }
      if (product.trackingType === 'none' && line.lotCode && line.lotCode !== '-') {
        throw new BadRequestException({
          code: STOCK_ERROR_CODES.PRODUCT_NOT_LOT_TRACKED,
          message: `Ürün ${product.code} parti takipli değildir — lot kodu verilemez`,
        });
      }
    }

    // Tedarikçi klinik kapsamı
    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, clinicId: auth.clinicId },
        select: { id: true },
      });
      if (!supplier) {
        throw new NotFoundException({
          code: STOCK_ERROR_CODES.SUPPLIER_NOT_FOUND,
          message: 'Tedarikçi bulunamadı',
        });
      }
    }

    // Lot çözümleme (birleştirme kuralı) — işlem dışı doğrulama
    interface ResolvedLine extends LedgerLineInput {
      lotStatus?: 'active' | 'quarantined';
    }
    const resolved: ResolvedLine[] = [];
    for (const line of dto.lines) {
      const product = products.get(line.productId)!;
      const qty = round3(line.qty);
      if (qty <= 0) {
        throw new BadRequestException({ code: 'VALIDATION', message: 'Miktar 0’dan büyük olmalı' });
      }
      let lotId: string | null = null;
      if (product.trackingType === 'lot') {
        const lotCode = line.lotCode!.trim();
        const existing = await this.prisma.inventoryLot.findUnique({
          where: {
            productId_warehouseId_lotCode: {
              productId: product.id,
              warehouseId: warehouse.id,
              lotCode,
            },
          },
        });
        if (existing) {
          const sameExpiry =
            (existing.expiresAt?.getTime() ?? null) ===
            (line.expiresAt ? new Date(line.expiresAt).getTime() : null);
          const sameCost = existing.unitCost.toNumber() === round2(line.unitCost ?? 0);
          if (!sameExpiry || !sameCost) {
            throw new ConflictException({
              code: STOCK_ERROR_CODES.LOT_CONFLICT,
              message: `Parti ${lotCode} bu depoda farklı SKT/maliyet ile kayıtlı — yeni parti kodu kullanın`,
            });
          }
          lotId = existing.id;
        } else {
          const created = await this.prisma.inventoryLot.create({
            data: {
              clinicId: auth.clinicId,
              productId: product.id,
              warehouseId: warehouse.id,
              lotCode,
              expiresAt: line.expiresAt ? new Date(line.expiresAt) : null,
              unitCost: decimal2(line.unitCost ?? 0),
              status: 'active',
              supplierId: dto.supplierId ?? null,
            },
          });
          lotId = created.id;
        }
      }
      resolved.push({
        productId: product.id,
        lotId,
        qty,
        unitCost: round2(line.unitCost ?? 0),
      });
    }

    const movement = await this.prisma.$transaction(async (tx) =>
      this.postMovement(tx, {
        clinicId: auth.clinicId,
        branchId: warehouse.branchId,
        warehouseId: warehouse.id,
        kind: 'goods_receipt',
        supplierId: dto.supplierId ?? null,
        note: dto.note ?? null,
        staffId: auth.staffId,
        idempotencyKey: dto.idempotencyKey ?? null,
        lines: resolved,
      }),
    );
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: warehouse.branchId,
        action: 'STOCK_RECEIPT_POSTED',
        entityType: 'StockMovement',
        entityId: movement.id,
        metadata: {
          warehouseId: warehouse.id,
          supplierId: dto.supplierId ?? null,
          lines: resolved.map((l) => ({ productId: l.productId, lotId: l.lotId, qty: l.qty })),
        },
      },
      request,
    );
    return this.movementDetailInternal(movement.id);
  }

  // ── Tüketim (FEFO + bloklu parti koruması, kabul kriteri 3 ve 6) ──────────

  async createConsumption(auth: AuthContext, dto: CreateConsumptionDto, request: AuthRequest) {
    const warehouse = await this.requireWarehouse(auth, request, dto.warehouseId);
    const resolved = await this.resolveConsumptionLines(auth, warehouse, dto.lines);

    const movement = await this.prisma.$transaction(async (tx) =>
      this.postMovement(tx, {
        clinicId: auth.clinicId,
        branchId: warehouse.branchId,
        warehouseId: warehouse.id,
        kind: 'consumption',
        note: dto.note ?? null,
        staffId: auth.staffId,
        idempotencyKey: dto.idempotencyKey ?? null,
        lines: resolved,
      }),
    );
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: warehouse.branchId,
        action: 'STOCK_CONSUMED',
        entityType: 'StockMovement',
        entityId: movement.id,
        metadata: {
          warehouseId: warehouse.id,
          lines: resolved.map((l) => ({ productId: l.productId, lotId: l.lotId, qty: l.qty })),
        },
      },
      request,
    );
    return this.movementDetailInternal(movement.id);
  }

  /**
   * Tüketim satırlarını parti bazlı negatif satırlara çözer.
   * - lot takipli ürün + lotId verilmişse: parti seçilebilirlik denetimi
   *   (expired/quarantined/exhausted → LOT_BLOCKED, kabul kriteri 3).
   * - lotId verilmezse FEFO otomatik tahsis (birden çok partiye bölebilir).
   * - partisiz ürün: doğrudan negatif satır (lotId null).
   */
  private async resolveConsumptionLines(
    auth: AuthContext,
    warehouse: { id: string; branchId: string },
    lines: ConsumptionLineDto[],
  ): Promise<LedgerLineInput[]> {
    const resolved: LedgerLineInput[] = [];
    for (const line of lines) {
      const product = await this.requireProduct(auth, line.productId);
      const qty = round3(line.qty);
      if (qty <= 0) {
        throw new BadRequestException({ code: 'VALIDATION', message: 'Miktar 0’dan büyük olmalı' });
      }
      if (product.trackingType === 'none') {
        if (line.lotId) {
          throw new BadRequestException({
            code: STOCK_ERROR_CODES.PRODUCT_NOT_LOT_TRACKED,
            message: `Ürün ${product.code} parti takipli değildir`,
          });
        }
        resolved.push({ productId: product.id, lotId: null, qty: -qty, unitCost: 0 });
        continue;
      }
      if (line.lotId) {
        const lot = await this.prisma.inventoryLot.findFirst({
          where: { id: line.lotId, productId: product.id, clinicId: auth.clinicId },
        });
        if (!lot || lot.warehouseId !== warehouse.id) {
          throw new NotFoundException({
            code: STOCK_ERROR_CODES.LOT_NOT_FOUND,
            message: 'Parti bu depoda bulunamadı',
          });
        }
        const balance = await this.prisma.stockBalance.findFirst({
          where: { productId: product.id, warehouseId: warehouse.id, lotId: lot.id },
        });
        const fefoLot: FefoLot = {
          id: lot.id,
          lotCode: lot.lotCode,
          expiresAt: lot.expiresAt,
          status: lot.status,
          receivedAt: lot.receivedAt,
          qtyOnHand: balance?.qtyOnHand.toNumber() ?? 0,
        };
        const blocked = isLotSelectable(fefoLot);
        if (blocked) {
          throw new ConflictException({
            code: STOCK_ERROR_CODES.LOT_BLOCKED,
            message: `Parti ${lot.lotCode} tüketim için seçilemez (${blocked})`,
          });
        }
        resolved.push({
          productId: product.id,
          lotId: lot.id,
          qty: -qty,
          unitCost: lot.unitCost.toNumber(),
        });
        continue;
      }
      // FEFO otomatik tahsis — bloklu partiler hariç
      const lots = await this.prisma.inventoryLot.findMany({
        where: { productId: product.id, warehouseId: warehouse.id },
      });
      const balances = await this.prisma.stockBalance.findMany({
        where: { productId: product.id, warehouseId: warehouse.id, lotId: { not: null } },
      });
      const balanceByLot = new Map(balances.map((b) => [b.lotId!, b.qtyOnHand.toNumber()]));
      const fefoLots: FefoLot[] = lots.map((lot) => ({
        id: lot.id,
        lotCode: lot.lotCode,
        expiresAt: lot.expiresAt,
        status: lot.status,
        receivedAt: lot.receivedAt,
        qtyOnHand: balanceByLot.get(lot.id) ?? 0,
      }));
      let allocations;
      try {
        allocations = allocateFefo(fefoLots, qty);
      } catch (error) {
        if (error instanceof InsufficientStockError) {
          throw new ConflictException({
            code: STOCK_ERROR_CODES.INSUFFICIENT_STOCK,
            message: `Yetersiz seçilebilir stok: istenen ${error.requested}, mevcut ${error.available}`,
          });
        }
        throw error;
      }
      for (const allocation of allocations) {
        if (allocation.qty <= 0) continue;
        const lot = lots.find((l) => l.id === allocation.lotId)!;
        resolved.push({
          productId: product.id,
          lotId: allocation.lotId,
          qty: -allocation.qty,
          unitCost: lot.unitCost.toNumber(),
        });
      }
    }
    return resolved;
  }

  // ── Tedarikçi iadesi ──────────────────────────────────────────────────────

  async createSupplierReturn(
    auth: AuthContext,
    dto: CreateSupplierReturnDto,
    request: AuthRequest,
  ) {
    const warehouse = await this.requireWarehouse(auth, request, dto.warehouseId);
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, clinicId: auth.clinicId },
      select: { id: true },
    });
    if (!supplier) {
      throw new NotFoundException({
        code: STOCK_ERROR_CODES.SUPPLIER_NOT_FOUND,
        message: 'Tedarikçi bulunamadı',
      });
    }
    const resolved = await this.resolveConsumptionLines(auth, warehouse, dto.lines);
    const movement = await this.prisma.$transaction(async (tx) =>
      this.postMovement(tx, {
        clinicId: auth.clinicId,
        branchId: warehouse.branchId,
        warehouseId: warehouse.id,
        kind: 'supplier_return',
        supplierId: dto.supplierId,
        reason: dto.reason,
        staffId: auth.staffId,
        lines: resolved,
      }),
    );
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: warehouse.branchId,
        action: 'STOCK_RETURN_POSTED',
        entityType: 'StockMovement',
        entityId: movement.id,
        metadata: { supplierId: dto.supplierId, reason: dto.reason },
      },
      request,
    );
    return this.movementDetailInternal(movement.id);
  }

  // ── Manuel düzeltme (gerekçe + denetim, kabul kriteri 5) ──────────────────

  async createAdjustment(auth: AuthContext, dto: CreateAdjustmentDto, request: AuthRequest) {
    const warehouse = await this.requireWarehouse(auth, request, dto.warehouseId);
    const product = await this.requireProduct(auth, dto.productId);
    const delta = round3(dto.qtyDelta);
    if (delta === 0) {
      throw new BadRequestException({ code: 'VALIDATION', message: 'Düzeltme miktarı 0 olamaz' });
    }
    let lotId: string | null = null;
    if (product.trackingType === 'lot') {
      if (!dto.lotId) {
        throw new BadRequestException({
          code: STOCK_ERROR_CODES.PRODUCT_LOT_TRACKED,
          message: 'Parti takipli üründe düzeltme parti bazında yapılır',
        });
      }
      const lot = await this.prisma.inventoryLot.findFirst({
        where: { id: dto.lotId, productId: product.id, warehouseId: warehouse.id },
      });
      if (!lot) {
        throw new NotFoundException({
          code: STOCK_ERROR_CODES.LOT_NOT_FOUND,
          message: 'Parti bu depoda bulunamadı',
        });
      }
      lotId = lot.id;
    } else if (dto.lotId) {
      throw new BadRequestException({
        code: STOCK_ERROR_CODES.PRODUCT_NOT_LOT_TRACKED,
        message: 'Bu ürün parti takipli değildir',
      });
    }

    const movement = await this.prisma.$transaction(async (tx) =>
      this.postMovement(tx, {
        clinicId: auth.clinicId,
        branchId: warehouse.branchId,
        warehouseId: warehouse.id,
        kind: 'adjustment',
        reason: dto.reason,
        staffId: auth.staffId,
        lines: [{ productId: product.id, lotId, qty: delta, unitCost: 0 }],
      }),
    );
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: warehouse.branchId,
        action: 'STOCK_ADJUSTED',
        entityType: 'StockMovement',
        entityId: movement.id,
        metadata: { productId: product.id, lotId, qtyDelta: delta, reason: dto.reason },
      },
      request,
    );
    return this.movementDetailInternal(movement.id);
  }

  // ── Defter okuma (append-only, kabul kriteri 2 ve 7) ──────────────────────

  async listMovements(auth: AuthContext, query: ListMovementsQueryDto) {
    const branchIds = await this.accessibleBranchIds(auth);
    const where: Prisma.StockMovementWhereInput = {
      clinicId: auth.clinicId,
      ...(branchIds !== null ? { branchId: { in: branchIds } } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.from || query.to
        ? {
            postedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: endOfDay(new Date(query.to)) } : {}),
            },
          }
        : {}),
      ...(query.productId ? { lines: { some: { productId: query.productId } } } : {}),
    };
    const items = await this.prisma.stockMovement.findMany({
      where,
      orderBy: { postedAt: 'desc' },
      take: query.take ?? 50,
      include: {
        warehouse: { select: { id: true, name: true, branch: { select: { name: true } } } },
        supplier: { select: { id: true, name: true } },
        performedBy: { select: { id: true, firstName: true, lastName: true } },
        lines: {
          include: {
            product: { select: { id: true, code: true, name: true } },
            lot: { select: { id: true, lotCode: true, expiresAt: true } },
          },
        },
      },
    });
    return { items };
  }

  async movementDetail(auth: AuthContext, movementId: string) {
    return this.movementDetailInternal(movementId, auth);
  }

  private async movementDetailInternal(movementId: string, auth?: AuthContext) {
    const movement = await this.prisma.stockMovement.findUnique({
      where: { id: movementId },
      include: {
        warehouse: { select: { id: true, name: true, branch: { select: { name: true } } } },
        supplier: { select: { id: true, name: true } },
        performedBy: { select: { id: true, firstName: true, lastName: true } },
        lines: {
          include: {
            product: { select: { id: true, code: true, name: true } },
            lot: { select: { id: true, lotCode: true, expiresAt: true } },
          },
        },
      },
    });
    if (!movement) {
      throw new NotFoundException({ code: 'MOVEMENT_NOT_FOUND', message: 'Hareket bulunamadı' });
    }
    if (auth && movement.clinicId !== auth.clinicId) {
      throw new NotFoundException({ code: 'MOVEMENT_NOT_FOUND', message: 'Hareket bulunamadı' });
    }
    return movement;
  }

  // ── Bakiyeler ve uyarılar (kabul kriteri 2) ───────────────────────────────

  async listBalances(auth: AuthContext, query: ListBalancesQueryDto) {
    const branchFilter = await this.accessibleBranchFilter(auth);
    const where: Prisma.StockBalanceWhereInput = {
      clinicId: auth.clinicId,
      warehouse: branchFilter,
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      qtyOnHand: { not: 0 },
    };
    const balances = await this.prisma.stockBalance.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            trackingType: true,
            minStock: true,
            baseUnit: { select: { key: true, name: true } },
          },
        },
        warehouse: { select: { id: true, name: true, branch: { select: { name: true } } } },
        lot: { select: { id: true, lotCode: true, expiresAt: true, status: true } },
      },
      orderBy: [{ productId: 'asc' }, { warehouseId: 'asc' }],
    });
    let items = balances.map((b) => ({
      id: b.id,
      productId: b.productId,
      productCode: b.product.code,
      productName: b.product.name,
      trackingType: b.product.trackingType,
      unit: b.product.baseUnit.name,
      minStock: b.product.minStock.toNumber(),
      warehouseId: b.warehouseId,
      warehouseName: b.warehouse.name,
      branchName: b.warehouse.branch.name,
      lotId: b.lotId,
      lotCode: b.lot?.lotCode ?? null,
      expiresAt: b.lot?.expiresAt ?? null,
      lotStatus: b.lot?.status ?? null,
      qtyOnHand: b.qtyOnHand.toNumber(),
      lowStock: b.qtyOnHand.toNumber() < b.product.minStock.toNumber(),
    }));
    if (query.lowStock) items = items.filter((i) => i.lowStock);
    return { items };
  }

  /** Uyarılar: süresi geçen/yaklaşan partiler + düşük stok ürünleri. */
  async listAlerts(auth: AuthContext, expiryDays: number = 30) {
    const branchFilter = await this.accessibleBranchFilter(auth);
    const now = new Date();
    const horizon = new Date(now.getTime() + expiryDays * 24 * 3600 * 1000);

    const lots = await this.prisma.inventoryLot.findMany({
      where: { clinicId: auth.clinicId, warehouse: branchFilter },
      include: {
        product: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });
    const balances = await this.prisma.stockBalance.findMany({
      where: { clinicId: auth.clinicId, warehouse: branchFilter, lotId: { not: null } },
    });
    const balanceByLot = new Map(balances.map((b) => [b.lotId!, b.qtyOnHand.toNumber()]));

    const expiringLots = lots
      .filter((lot) => {
        if (!lot.expiresAt) return false;
        const qty = balanceByLot.get(lot.id) ?? 0;
        if (qty <= 0) return false;
        return lot.expiresAt.getTime() <= horizon.getTime();
      })
      .map((lot) => ({
        lotId: lot.id,
        lotCode: lot.lotCode,
        productId: lot.productId,
        productName: lot.product.name,
        warehouseId: lot.warehouseId,
        warehouseName: lot.warehouse.name,
        expiresAt: lot.expiresAt,
        expired: endOfDay(lot.expiresAt!).getTime() < now.getTime(),
        qtyOnHand: balanceByLot.get(lot.id) ?? 0,
        status: lot.status,
      }))
      .sort((a, b) => (a.expiresAt!.getTime() ?? 0) - (b.expiresAt!.getTime() ?? 0));

    const balancesAll = await this.prisma.stockBalance.findMany({
      where: { clinicId: auth.clinicId, warehouse: branchFilter },
      include: {
        product: { select: { id: true, code: true, name: true, minStock: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });
    const totals = new Map<string, { product: (typeof balancesAll)[number]['product']; total: number; warehouseId: string; warehouseName: string }>();
    for (const b of balancesAll) {
      const key = `${b.productId}:${b.warehouseId}`;
      const entry = totals.get(key) ?? {
        product: b.product,
        total: 0,
        warehouseId: b.warehouseId,
        warehouseName: b.warehouse.name,
      };
      entry.total += b.qtyOnHand.toNumber();
      totals.set(key, entry);
    }
    const lowStockProducts = [...totals.values()]
      .filter((e) => e.total < e.product.minStock.toNumber())
      .map((e) => ({
        productId: e.product.id,
        productCode: e.product.code,
        productName: e.product.name,
        warehouseId: e.warehouseId,
        warehouseName: e.warehouseName,
        total: round3(e.total),
        minStock: e.product.minStock.toNumber(),
      }));

    return { expiringLots, lowStockProducts };
  }

  // ── Transfer (iki aşamalı, kabul kriteri 4) ───────────────────────────────

  async listTransfers(auth: AuthContext, status?: string) {
    const branchIds = await this.accessibleBranchIds(auth);
    const transfers = await this.prisma.stockTransfer.findMany({
      where: {
        clinicId: auth.clinicId,
        // Not: OR içinde boş relation-nesnesi filtresi Prisma 6'da beklenmedik
        // sonuç üretiyor; scalar FK (fromBranchId/toBranchId) kullanılır.
        ...(branchIds !== null
          ? { OR: [{ fromBranchId: { in: branchIds } }, { toBranchId: { in: branchIds } }] }
          : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        fromWarehouse: { select: { id: true, name: true, branch: { select: { name: true } } } },
        toWarehouse: { select: { id: true, name: true, branch: { select: { name: true } } } },
        lines: {
          include: {
            product: { select: { id: true, code: true, name: true } },
            lot: { select: { id: true, lotCode: true, expiresAt: true } },
            receivedLot: { select: { id: true, lotCode: true } },
          },
        },
      },
    });
    return { items: transfers };
  }

  async transferDetail(auth: AuthContext, transferId: string) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id: transferId, clinicId: auth.clinicId },
      include: {
        fromWarehouse: { select: { id: true, name: true, branch: { select: { name: true } } } },
        toWarehouse: { select: { id: true, name: true, branch: { select: { name: true } } } },
        lines: {
          include: {
            product: { select: { id: true, code: true, name: true } },
            lot: { select: { id: true, lotCode: true, expiresAt: true } },
            receivedLot: { select: { id: true, lotCode: true } },
          },
        },
      },
    });
    if (!transfer) {
      throw new NotFoundException({
        code: STOCK_ERROR_CODES.TRANSFER_NOT_FOUND,
        message: 'Transfer bulunamadı',
      });
    }
    return transfer;
  }

  async createTransfer(auth: AuthContext, dto: CreateTransferDto, request: AuthRequest) {
    const from = await this.requireWarehouse(auth, request, dto.fromWarehouseId);
    const to = await this.prisma.warehouse.findUnique({
      where: { id: dto.toWarehouseId },
      select: { id: true, branchId: true, name: true, active: true },
    });
    if (!to || to.branchId !== from.branchId) {
      // Çok şubeli transfer: hedef şube kapsamı doğrulanır (kaynak şubeden kurulsun)
      if (!to) {
        throw new NotFoundException({
          code: STOCK_ERROR_CODES.WAREHOUSE_NOT_FOUND,
          message: 'Hedef depo bulunamadı',
        });
      }
    }
    if (from.id === to.id) {
      throw new BadRequestException({
        code: STOCK_ERROR_CODES.SAME_WAREHOUSE,
        message: 'Kaynak ve hedef depo aynı olamaz',
      });
    }
    // Hedef depo şubesine erişim yoksa transfer yalnızca dispatch edilebilir;
    // receive hedef şube yetkisiyle yapılır. Kurulum sırasında kaynak şube
    // kapsamı yeterlidir (Faz 07 kararı: iki aşamalı yetki).
    const branchAccessOk =
      auth.allBranches ||
      auth.branchIds.includes(to.branchId) ||
      request.branchId === to.branchId;
    if (!branchAccessOk && request.branchId && request.branchId !== from.branchId) {
      throw new ForbiddenException({ code: 'BRANCH_SCOPE', message: 'Şube erişiminiz yok' });
    }
    if (request.branchId && request.branchId !== from.branchId && request.branchId !== to.branchId) {
      throw new ForbiddenException({ code: 'BRANCH_SCOPE', message: 'Şube kapsamı dışı istek' });
    }

    // Satırlar: parti takipli üründe kaynak parti zorunlu ve seçilebilir olmalı
    const lines: { productId: string; lotId: string | null; qty: number }[] = [];
    for (const line of dto.lines) {
      const product = await this.requireProduct(auth, line.productId);
      const qty = round3(line.qty);
      if (qty <= 0) {
        throw new BadRequestException({ code: 'VALIDATION', message: 'Miktar 0’dan büyük olmalı' });
      }
      let lotId: string | null = null;
      if (product.trackingType === 'lot') {
        if (!line.lotId) {
          throw new BadRequestException({
            code: STOCK_ERROR_CODES.PRODUCT_LOT_TRACKED,
            message: `Ürün ${product.code} parti takiplidir — kaynak parti seçilmeli`,
          });
        }
        const lot = await this.prisma.inventoryLot.findFirst({
          where: { id: line.lotId, productId: product.id, warehouseId: from.id },
        });
        if (!lot) {
          throw new NotFoundException({
            code: STOCK_ERROR_CODES.LOT_NOT_FOUND,
            message: 'Kaynak parti bu depoda bulunamadı',
          });
        }
        lotId = lot.id;
      } else if (line.lotId) {
        throw new BadRequestException({
          code: STOCK_ERROR_CODES.PRODUCT_NOT_LOT_TRACKED,
          message: `Ürün ${product.code} parti takipli değildir`,
        });
      }
      lines.push({ productId: product.id, lotId, qty });
    }

    const code = await this.nextCode(auth.clinicId, 'TRF', 'stockTransfer');
    const transfer = await this.prisma.stockTransfer.create({
      data: {
        clinicId: auth.clinicId,
        code,
        fromBranchId: from.branchId,
        toBranchId: to.branchId,
        fromWarehouseId: from.id,
        toWarehouseId: to.id,
        note: dto.note ?? null,
        createdById: auth.staffId,
        lines: { create: lines },
      },
      include: { lines: true },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: from.branchId,
        action: 'STOCK_TRANSFER_CREATED',
        entityType: 'StockTransfer',
        entityId: transfer.id,
        metadata: { code: transfer.code, fromWarehouseId: from.id, toWarehouseId: to.id },
      },
      request,
    );
    return transfer;
  }

  /** Sevk: kaynak bakiyeyi düşer + transfer_out defter hareketi yazar. */
  async dispatchTransfer(auth: AuthContext, transferId: string, request: AuthRequest) {
    const transfer = await this.transferDetail(auth, transferId);
    if (transfer.status !== 'draft') {
      throw new ConflictException({
        code: STOCK_ERROR_CODES.TRANSFER_STATE,
        message: `Sevk yalnızca taslak transferde yapılabilir (durum: ${transfer.status})`,
      });
    }
    const from = await this.requireWarehouse(auth, request, transfer.fromWarehouseId);

    const ledgerLines: LedgerLineInput[] = [];
    for (const line of transfer.lines) {
      if (line.lotId) {
        const lot = await this.prisma.inventoryLot.findUnique({ where: { id: line.lotId } });
        if (lot) {
          ledgerLines.push({
            productId: line.productId,
            lotId: line.lotId,
            qty: -line.qty.toNumber(),
            unitCost: lot.unitCost.toNumber(),
          });
        }
      } else {
        ledgerLines.push({
          productId: line.productId,
          lotId: null,
          qty: -line.qty.toNumber(),
          unitCost: 0,
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await this.postMovement(tx, {
        clinicId: auth.clinicId,
        branchId: from.branchId,
        warehouseId: from.id,
        kind: 'transfer_out',
        refType: REF_TRANSFER,
        refId: transfer.id,
        note: `Transfer ${transfer.code} sevki`,
        staffId: auth.staffId,
        lines: ledgerLines,
      });
      await tx.stockTransfer.update({
        where: { id: transfer.id },
        data: {
          status: 'dispatched',
          dispatchedAt: new Date(),
          dispatchedByStaffId: auth.staffId,
        },
      });
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: from.branchId,
        action: 'STOCK_TRANSFER_DISPATCHED',
        entityType: 'StockTransfer',
        entityId: transfer.id,
        metadata: { code: transfer.code },
      },
      request,
    );
    return this.transferDetail(auth, transfer.id);
  }

  /** Teslim: hedef depoda parti açar/büyütür + transfer_in yazar. */
  async receiveTransfer(auth: AuthContext, transferId: string, request: AuthRequest) {
    const transfer = await this.transferDetail(auth, transferId);
    if (transfer.status !== 'dispatched') {
      throw new ConflictException({
        code: STOCK_ERROR_CODES.TRANSFER_STATE,
        message: `Teslim yalnızca sevk edilmiş transferde yapılabilir (durum: ${transfer.status})`,
      });
    }
    const to = await this.requireWarehouse(auth, request, transfer.toWarehouseId);

    const ledgerLines: LedgerLineInput[] = [];
    const receivedLotIds = new Map<string, string>();
    for (const line of transfer.lines) {
      if (line.lotId) {
        const sourceLot = await this.prisma.inventoryLot.findUnique({
          where: { id: line.lotId },
        });
        if (!sourceLot) continue;
        // Hedef depoda aynı kod: aynı SKT+maliyet ise birleştir, aksi hâlde yeni parti
        const existing = await this.prisma.inventoryLot.findUnique({
          where: {
            productId_warehouseId_lotCode: {
              productId: line.productId,
              warehouseId: to.id,
              lotCode: sourceLot.lotCode,
            },
          },
        });
        let targetLotId: string;
        if (existing) {
          const sameExpiry =
            (existing.expiresAt?.getTime() ?? null) === (sourceLot.expiresAt?.getTime() ?? null);
          const sameCost =
            existing.unitCost.toNumber() === sourceLot.unitCost.toNumber();
          if (!sameExpiry || !sameCost) {
            throw new ConflictException({
              code: STOCK_ERROR_CODES.LOT_CONFLICT,
              message: `Hedef depoda ${sourceLot.lotCode} kodu farklı özelliklerde kayıtlı`,
            });
          }
          targetLotId = existing.id;
        } else {
          const created = await this.prisma.inventoryLot.create({
            data: {
              clinicId: auth.clinicId,
              productId: line.productId,
              warehouseId: to.id,
              lotCode: sourceLot.lotCode,
              expiresAt: sourceLot.expiresAt,
              unitCost: sourceLot.unitCost,
              status: 'active',
              supplierId: sourceLot.supplierId,
            },
          });
          targetLotId = created.id;
        }
        receivedLotIds.set(line.id, targetLotId);
        ledgerLines.push({
          productId: line.productId,
          lotId: targetLotId,
          qty: line.qty.toNumber(),
          unitCost: sourceLot.unitCost.toNumber(),
        });
      } else {
        ledgerLines.push({
          productId: line.productId,
          lotId: null,
          qty: line.qty.toNumber(),
          unitCost: 0,
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await this.postMovement(tx, {
        clinicId: auth.clinicId,
        branchId: to.branchId,
        warehouseId: to.id,
        kind: 'transfer_in',
        refType: REF_TRANSFER,
        refId: transfer.id,
        note: `Transfer ${transfer.code} teslim`,
        staffId: auth.staffId,
        lines: ledgerLines,
      });
      for (const [lineId, receivedLotId] of receivedLotIds) {
        await tx.stockTransferLine.update({
          where: { id: lineId },
          data: { receivedLotId },
        });
      }
      await tx.stockTransfer.update({
        where: { id: transfer.id },
        data: {
          status: 'received',
          receivedAt: new Date(),
          receivedByStaffId: auth.staffId,
        },
      });
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: to.branchId,
        action: 'STOCK_TRANSFER_RECEIVED',
        entityType: 'StockTransfer',
        entityId: transfer.id,
        metadata: { code: transfer.code },
      },
      request,
    );
    return this.transferDetail(auth, transfer.id);
  }

  /** İptal: yalnız taslak; sevk edilmiş transfer telafi hareketiyle düzeltilir. */
  async cancelTransfer(auth: AuthContext, transferId: string, request: AuthRequest) {
    const transfer = await this.transferDetail(auth, transferId);
    if (transfer.status !== 'draft') {
      throw new ConflictException({
        code: STOCK_ERROR_CODES.TRANSFER_STATE,
        message: `Yalnızca taslak transfer iptal edilebilir (durum: ${transfer.status})`,
      });
    }
    const cancelled = await this.prisma.stockTransfer.update({
      where: { id: transfer.id },
      data: { status: 'cancelled' },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        action: 'STOCK_TRANSFER_CANCELLED',
        entityType: 'StockTransfer',
        entityId: transfer.id,
        metadata: { code: transfer.code },
      },
      request,
    );
    return cancelled;
  }

  // ── Sayım (kabul kriteri 5) ───────────────────────────────────────────────

  async listCounts(auth: AuthContext, status?: string) {
    const branchFilter = await this.accessibleBranchFilter(auth);
    const counts = await this.prisma.stockCount.findMany({
      where: {
        clinicId: auth.clinicId,
        warehouse: branchFilter,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        warehouse: { select: { id: true, name: true, branch: { select: { name: true } } } },
        completedBy: { select: { id: true, firstName: true, lastName: true } },
        lines: {
          include: {
            product: { select: { id: true, code: true, name: true } },
            lot: { select: { id: true, lotCode: true, expiresAt: true } },
          },
        },
      },
    });
    return { items: counts };
  }

  async countDetail(auth: AuthContext, countId: string) {
    const count = await this.prisma.stockCount.findFirst({
      where: { id: countId, clinicId: auth.clinicId },
      include: {
        warehouse: { select: { id: true, name: true, branch: { select: { name: true } } } },
        completedBy: { select: { id: true, firstName: true, lastName: true } },
        lines: {
          include: {
            product: { select: { id: true, code: true, name: true } },
            lot: { select: { id: true, lotCode: true, expiresAt: true } },
          },
        },
      },
    });
    if (!count) {
      throw new NotFoundException({
        code: STOCK_ERROR_CODES.COUNT_NOT_FOUND,
        message: 'Sayım bulunamadı',
      });
    }
    return count;
  }

  /** Sayım açılışı: mevcut bakiyeler beklenen miktar olarak dondurulur. */
  async createCount(auth: AuthContext, dto: CreateCountDto, request: AuthRequest) {
    const warehouse = await this.requireWarehouse(auth, request, dto.warehouseId);
    const balances = await this.prisma.stockBalance.findMany({
      where: { warehouseId: warehouse.id, qtyOnHand: { not: 0 } },
      include: { product: { select: { trackingType: true } } },
    });
    const code = await this.nextCode(auth.clinicId, 'SAY', 'stockCount');
    const count = await this.prisma.stockCount.create({
      data: {
        clinicId: auth.clinicId,
        code,
        branchId: warehouse.branchId,
        warehouseId: warehouse.id,
        note: dto.note ?? null,
        lines: {
          create: balances.map((b) => ({
            productId: b.productId,
            lotId: b.lotId,
            expectedQty: b.qtyOnHand,
          })),
        },
      },
      include: { lines: true },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: warehouse.branchId,
        action: 'STOCK_COUNT_CREATED',
        entityType: 'StockCount',
        entityId: count.id,
        metadata: { code: count.code, warehouseId: warehouse.id, lines: count.lines.length },
      },
      request,
    );
    return count;
  }

  /** Taslak sayımda sayılan miktar girilir (fark anlık gösterilir). */
  async updateCountLines(
    auth: AuthContext,
    countId: string,
    dto: UpdateCountLinesDto,
    request: AuthRequest,
  ) {
    const count = await this.countDetail(auth, countId);
    if (count.status !== 'draft') {
      throw new ConflictException({
        code: STOCK_ERROR_CODES.COUNT_STATE,
        message: `Yalnızca taslak sayımda satır güncellenebilir (durum: ${count.status})`,
      });
    }
    for (const line of dto.lines) {
      const existing = count.lines.find((l) => l.id === line.lineId);
      if (!existing) {
        throw new NotFoundException({
          code: STOCK_ERROR_CODES.COUNT_NOT_FOUND,
          message: `Sayım satırı bulunamadı: ${line.lineId}`,
        });
      }
      await this.prisma.stockCountLine.update({
        where: { id: existing.id },
        data: { countedQty: line.countedQty == null ? null : decimal3(line.countedQty) },
      });
    }
    return this.countDetail(auth, countId);
  }

  /**
   * Sayım tamamlama: gerekçe zorunlu (kabul kriteri 5). Her fark satırı için
   * bakiye = sayılan miktar olacak şekilde 'adjustment' hareketi yazılır ve
   * denetim kaydı üretilir.
   */
  async completeCount(auth: AuthContext, countId: string, dto: CompleteCountDto, request: AuthRequest) {
    const count = await this.countDetail(auth, countId);
    if (count.status !== 'draft') {
      throw new ConflictException({
        code: STOCK_ERROR_CODES.COUNT_STATE,
        message: `Yalnızca taslak sayım tamamlanabilir (durum: ${count.status})`,
      });
    }
    if (!dto.reason || dto.reason.trim().length < 3) {
      throw new BadRequestException({
        code: STOCK_ERROR_CODES.COUNT_REASON_REQUIRED,
        message: 'Sayım farkı için gerekçe zorunludur',
      });
    }

    const warehouse = count.warehouse;
    const movementLines: LedgerLineInput[] = [];
    const diffSummary: { productId: string; lotId: string | null; diff: number }[] = [];
    for (const line of count.lines) {
      if (line.countedQty === null) continue; // sayılmayan satır atlanır
      const current = await this.prisma.stockBalance.findFirst({
        where: { productId: line.productId, warehouseId: warehouse.id, lotId: line.lotId },
      });
      const counted = line.countedQty.toNumber();
      const currentQty = current?.qtyOnHand.toNumber() ?? 0;
      const delta = round3(counted - currentQty);
      if (delta === 0) continue;
      movementLines.push({ productId: line.productId, lotId: line.lotId, qty: delta, unitCost: 0 });
      diffSummary.push({
        productId: line.productId,
        lotId: line.lotId,
        diff: countDifference(line.expectedQty.toNumber(), counted) ?? 0,
      });
    }

    if (movementLines.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await this.postMovement(tx, {
          clinicId: auth.clinicId,
          branchId: count.branchId,
          warehouseId: warehouse.id,
          kind: 'adjustment',
          refType: REF_COUNT,
          refId: count.id,
          reason: dto.reason,
          staffId: auth.staffId,
          lines: movementLines,
        });
      });
    }
    await this.prisma.stockCount.update({
      where: { id: count.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        completedByStaffId: auth.staffId,
      },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: count.branchId,
        action: 'STOCK_COUNT_COMPLETED',
        entityType: 'StockCount',
        entityId: count.id,
        metadata: {
          code: count.code,
          reason: dto.reason,
          adjustedLines: diffSummary.length,
          diffs: diffSummary,
        },
      },
      request,
    );
    return this.countDetail(auth, countId);
  }

  /**
   * Parti durumu değiştirme (karantina → serbest veya tersi). Karantina
   * partisi tüketimden otomatik bloklanır; denetim kaydı yazılır.
   */
  async updateLotStatus(
    auth: AuthContext,
    lotId: string,
    status: 'active' | 'quarantined',
    request: AuthRequest,
  ) {
    const lot = await this.prisma.inventoryLot.findFirst({
      where: { id: lotId, clinicId: auth.clinicId },
      include: { warehouse: { select: { id: true, branchId: true, name: true } } },
    });
    if (!lot) {
      throw new NotFoundException({ code: STOCK_ERROR_CODES.LOT_NOT_FOUND, message: 'Parti bulunamadı' });
    }
    this.requireBranchAccess(auth, request, lot.warehouse.branchId);
    if (lot.status !== status) {
      await this.prisma.inventoryLot.update({ where: { id: lot.id }, data: { status } });
      await this.recordAudit(
        {
          clinicId: auth.clinicId,
          staffId: auth.staffId,
          branchId: lot.warehouse.branchId,
          action: status === 'quarantined' ? 'LOT_QUARANTINED' : 'LOT_RELEASED',
          entityType: 'InventoryLot',
          entityId: lot.id,
          metadata: { lotCode: lot.lotCode, productId: lot.productId },
        },
        request,
      );
    }
    return this.lotDetailInternal(lot.id);
  }

  private async lotDetailInternal(lotId: string) {
    const lot = await this.prisma.inventoryLot.findUnique({
      where: { id: lotId },
      include: {
        product: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });
    if (!lot) {
      throw new NotFoundException({ code: STOCK_ERROR_CODES.LOT_NOT_FOUND, message: 'Parti bulunamadı' });
    }
    const balance = await this.prisma.stockBalance.findFirst({
      where: { productId: lot.productId, warehouseId: lot.warehouseId, lotId: lot.id },
    });
    return {
      ...lot,
      qtyOnHand: balance?.qtyOnHand.toNumber() ?? 0,
    };
  }

  // ── Sıcaklık kayıtları ────────────────────────────────────────────────────

  async listTemperatureLogs(auth: AuthContext, query: { warehouseId?: string; take?: number }) {
    const branchFilter = await this.accessibleBranchFilter(auth);
    const items = await this.prisma.temperatureLog.findMany({
      where: {
        clinicId: auth.clinicId,
        warehouse: branchFilter,
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      },
      orderBy: { measuredAt: 'desc' },
      take: query.take ?? 50,
      include: {
        warehouse: { select: { id: true, name: true } },
        recordedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return { items };
  }

  async createTemperatureLog(
    auth: AuthContext,
    dto: CreateTemperatureLogDto,
    request: AuthRequest,
  ) {
    const warehouse = await this.requireWarehouse(auth, request, dto.warehouseId);
    const log = await this.prisma.temperatureLog.create({
      data: {
        clinicId: auth.clinicId,
        branchId: warehouse.branchId,
        warehouseId: warehouse.id,
        celsius: new Prisma.Decimal(dto.celsius.toFixed(2)),
        measuredAt: new Date(dto.measuredAt),
        note: dto.note ?? null,
        recordedByStaffId: auth.staffId,
      },
    });
    await this.recordAudit(
      {
        clinicId: auth.clinicId,
        staffId: auth.staffId,
        branchId: warehouse.branchId,
        action: 'TEMPERATURE_LOGGED',
        entityType: 'TemperatureLog',
        entityId: log.id,
        metadata: { warehouseId: warehouse.id, celsius: dto.celsius },
      },
      request,
    );
    return log;
  }

  // ── Yardımcılar ───────────────────────────────────────────────────────────

  /** Şube kapsamı filtresi: allBranches ise kısıt yok; değilse erişilen şubeler. */
  private async accessibleBranchIds(auth: AuthContext): Promise<string[] | null> {
    if (auth.allBranches) return null;
    return auth.branchIds;
  }

  private async accessibleBranchFilter(auth: AuthContext): Promise<Prisma.WarehouseWhereInput> {
    const branchIds = await this.accessibleBranchIds(auth);
    if (branchIds === null) return {};
    return { branchId: { in: branchIds } };
  }

  /** Sıralı belge kodu: TRF-0001 / SAY-0001 (klinik içinde tekil). */
  private async nextCode(
    clinicId: string,
    prefix: string,
    model: 'stockTransfer' | 'stockCount',
  ): Promise<string> {
    const count =
      model === 'stockTransfer'
        ? await this.prisma.stockTransfer.count({ where: { clinicId } })
        : await this.prisma.stockCount.count({ where: { clinicId } });
    let seq = count + 1;
    for (;;) {
      const code = `${prefix}-${String(seq).padStart(4, '0')}`;
      const exists =
        model === 'stockTransfer'
          ? await this.prisma.stockTransfer.findFirst({
              where: { clinicId, code },
              select: { id: true },
            })
          : await this.prisma.stockCount.findFirst({
              where: { clinicId, code },
              select: { id: true },
            });
      if (!exists) return code;
      seq += 1;
    }
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
