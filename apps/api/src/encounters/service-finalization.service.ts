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
import { StockService } from '../inventory/stock.service';
import { isLotSelectable } from '../inventory/inventory.domain';
import {
  FINALIZATION_ERROR_CODES,
  allocateByPolicy,
  buildReversalChargeLines,
  decideIdempotency,
  planRuleConsumptions,
  round2,
  round3,
  sumChargeTotals,
  toChargeLine,
  type AllocationPolicy,
  type AllocLot,
  type ConsumptionRuleInput,
} from './service-finalization.domain';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import type { ConsumptionInputDto, FinalizeServiceRecordDto } from './encounters.dto';

const RECORD_DETAIL_INCLUDE = {
  lines: {
    orderBy: { id: 'asc' as const },
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
  performedBy: { select: { id: true, firstName: true, lastName: true } },
  reversedBy: { select: { id: true, firstName: true, lastName: true } },
  charge: {
    include: {
      lines: { orderBy: { createdAt: 'asc' as const } },
    },
  },
} satisfies Prisma.ServiceRecordInclude;

/** Kesinleşmede tüketime dönüşen çözümlü satır — deftere yazılacak biçim. */
interface ResolvedConsumption {
  productId: string;
  warehouseId: string;
  lotId: string | null;
  qty: number;
  unitCost: number;
}

/** Kesinleştirme önizlemesinde parti seçeneği — API sözleşmesinin parçası. */
export interface PreviewLotOption {
  lotId: string;
  lotCode: string;
  warehouseId: string;
  expiresAt: Date | null;
  qtyOnHand: number;
  unitCost: number;
  blockReason: string | null;
}

/**
 * Hizmet → stok → ücret atomik iş akışı — Faz 08 çekirdek orkestrasyonu.
 *
 * Kabul kriterleri burada uygulanır:
 * 1. Başarılı finalize: klinik kayıt (finalized) + stok defter hareketi +
 *    ücret/satır + denetim + bakiye projeksiyonu TEK transaction'da.
 * 2. Stok yazım hatası (koşullu azaltım) tüm işlemi geri alır.
 * 3. Aynı idempotency key ile tekrar çağrı REPLAY döner — duplicate hareket/
 *    ücret yaratılmaz (mobil retry).
 * 4. Eş zamanlı isteklerde son ürün en fazla bir kez tüketilir (koşullu
 *    azaltım + FOR UPDATE satır kilidi).
 * 5. Lot no, SKT ve kaynak hizmet kaydı hareket üzerinde izlenir.
 * 6. Reversal orijinal hareketi/satırları silmeden ters hareket + negatif
 *    ücret satırı yazar; tam iadede ücret void olur.
 * 7. Yetkisiz kullanıcı finalize/reversal yapamaz (inventory.consume).
 */
@Injectable()
export class ServiceFinalizationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StockService) private readonly stock: StockService,
  ) {}

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

  private async recordDetail(recordId: string) {
    const record = await this.prisma.serviceRecord.findUnique({
      where: { id: recordId },
      include: RECORD_DETAIL_INCLUDE,
    });
    if (!record) {
      throw new NotFoundException({
        code: FINALIZATION_ERROR_CODES.SERVICE_RECORD_NOT_FOUND,
        message: 'Hizmet kaydı bulunamadı',
      });
    }
    return record;
  }

  private requireConsumePermission(auth: AuthContext): void {
    if (!auth.permissions.includes('inventory.consume')) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message:
          'Stok tüketimi gerektiren kesinleştirme/iptal için inventory.consume izni gerekir',
      });
    }
  }

  // ── Preview ───────────────────────────────────────────────────────────────

  /**
   * Kesinleştirme önizlemesi: kural planı + depo/parti seçenekleri + otomatik
   * tahsis önerisi + ücek önizlemesi. Kullanıcı bu veriyi düzenleyip finalize
   * gövdesinde onaylar (build prompt: gerçek miktar/depo/lot onayı).
   */
  async previewConsumption(
    auth: AuthContext,
    encounterId: string,
    recordId: string,
    request: AuthRequest,
  ) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, clinicId: auth.clinicId },
      select: { id: true, branchId: true, ownerId: true, patientId: true, status: true },
    });
    if (!encounter) {
      throw new NotFoundException({ code: 'ENCOUNTER_NOT_FOUND', message: 'Muayene bulunamadı' });
    }
    this.requireBranchAccess(auth, request, encounter.branchId);

    const record = await this.prisma.serviceRecord.findFirst({
      where: { id: recordId, encounterId: encounter.id },
      include: {
        lines: { include: { service: { select: { id: true, name: true, code: true } } } },
      },
    });
    if (!record) {
      throw new NotFoundException({
        code: FINALIZATION_ERROR_CODES.SERVICE_RECORD_NOT_FOUND,
        message: 'Hizmet kaydı bulunamadı',
      });
    }
    if (record.status !== 'draft') {
      throw new ConflictException({
        code: FINALIZATION_ERROR_CODES.SERVICE_RECORD_FINALIZED,
        message: 'Hizmet kaydı zaten kesinleşmiş',
      });
    }

    const plan = await this.buildAutoPlan(auth.clinicId, encounter.branchId, record);
    const chargeLines = record.lines.map((line) =>
      toChargeLine({
        description: line.service.name,
        qty: Number(line.qty),
        unitPrice: Number(line.unitPrice),
        discount: Number(line.discount),
        tax: Number(line.tax),
      }),
    );

    return {
      record: { id: record.id, status: record.status },
      consumptions: plan.consumptions,
      issues: plan.issues,
      charge: { lines: chargeLines, total: sumChargeTotals(chargeLines) },
    };
  }

  /** Şubenin aktif depoları (eski önce — determinizm). */
  private async branchWarehouses(clinicId: string, branchId: string) {
    return this.prisma.warehouse.findMany({
      where: { branch: { clinicId, id: branchId }, active: true },
      orderBy: { createdAt: 'asc' as const },
      select: { id: true, name: true },
    });
  }

  /**
   * Otomatik tüketim planı: kurallar → satır çaprazı → ürün/depolar/partiler.
   * Her ürün için seçilebilir stoğu en yüksek depo önerilir; politika fifo/
   * nearest_expiry ise parti tahsisi önerilir; manual ise kullanıcıya bırakılır.
   */
  private async buildAutoPlan(
    clinicId: string,
    branchId: string,
    record: { id: string; lines: { serviceId: string; qty: Prisma.Decimal; service: { name: string } }[] },
  ) {
    const serviceIds = [...new Set(record.lines.map((l) => l.serviceId))];
    const rules = await this.prisma.serviceConsumptionRule.findMany({
      where: { serviceId: { in: serviceIds }, active: true },
      include: { product: { select: { id: true, code: true, name: true, trackingType: true } } },
      orderBy: { createdAt: 'asc' as const },
    });

    const { consumptions, issues } = planRuleConsumptions(
      rules.map((r): ConsumptionRuleInput => ({
        id: r.id,
        serviceId: r.serviceId,
        productId: r.productId,
        defaultQty: Number(r.defaultQty),
        unit: r.unit,
        required: r.required,
        allocationPolicy: r.allocationPolicy,
        active: r.active,
        productName: r.product?.name ?? null,
      })),
      record.lines.map((l) => ({ serviceId: l.serviceId, qty: Number(l.qty), serviceName: l.service.name })),
    );
    if (consumptions.length === 0) {
      return { consumptions: [], issues };
    }

    const productIds = [...new Set(consumptions.map((c) => c.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, clinicId },
      select: { id: true, code: true, name: true, trackingType: true },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    const warehouses = await this.branchWarehouses(clinicId, branchId);
    const lotRows = productIds.length
      ? await this.prisma.inventoryLot.findMany({
          where: { productId: { in: productIds }, warehouse: { branch: { clinicId, id: branchId } } },
          select: {
            id: true,
            lotCode: true,
            productId: true,
            warehouseId: true,
            expiresAt: true,
            status: true,
            receivedAt: true,
            unitCost: true,
            balances: { select: { qtyOnHand: true } },
          },
        })
      : [];

    const now = new Date();
    const lotsByProduct = new Map<string, AllocLot[]>();
    const optionByProduct = new Map<string, PreviewLotOption[]>();
    for (const lot of lotRows) {
      const qtyOnHand = Number(lot.balances[0]?.qtyOnHand ?? 0);
      const reason = isLotSelectable(
        {
          id: lot.id,
          lotCode: lot.lotCode,
          expiresAt: lot.expiresAt,
          status: lot.status,
          receivedAt: lot.receivedAt,
          qtyOnHand,
        },
        now,
      );
      const list = optionByProduct.get(lot.productId) ?? [];
      list.push({
        lotId: lot.id,
        lotCode: lot.lotCode,
        warehouseId: lot.warehouseId,
        expiresAt: lot.expiresAt,
        qtyOnHand,
        unitCost: Number(lot.unitCost),
        blockReason: reason,
      });
      optionByProduct.set(lot.productId, list);
      if (reason === null) {
        const alloc = lotsByProduct.get(lot.productId) ?? [];
        alloc.push({
          lotId: lot.id,
          lotCode: lot.lotCode,
          expiresAt: lot.expiresAt,
          status: lot.status,
          receivedAt: lot.receivedAt,
          qtyOnHand,
        });
        lotsByProduct.set(lot.productId, alloc);
      }
    }

    const previewLines = consumptions.map((c) => {
      const product = productById.get(c.productId);
      const options = optionByProduct.get(c.productId) ?? [];
      const selectableByWarehouse = new Map<string, number>();
      for (const opt of options) {
        if (opt.blockReason === null) {
          selectableByWarehouse.set(
            opt.warehouseId,
            (selectableByWarehouse.get(opt.warehouseId) ?? 0) + opt.qtyOnHand,
          );
        }
      }
      let suggestedWarehouseId: string | null = null;
      let best = -1;
      for (const wh of warehouses) {
        const stock = selectableByWarehouse.get(wh.id) ?? 0;
        if (stock > best) {
          best = stock;
          suggestedWarehouseId = wh.id;
        }
      }
      if (suggestedWarehouseId === null && warehouses.length > 0) {
        suggestedWarehouseId = warehouses[0]!.id;
      }
      const warehouseLots = lotsByProduct.get(c.productId) ?? [];
      const allocation: { allocations: { lotId: string; lotCode: string; qty: number }[]; shortfall: number } =
        suggestedWarehouseId === null
          ? { allocations: [], shortfall: c.qty }
          : allocateByPolicy(
              warehouseLots.filter((l) => l.qtyOnHand > 0),
              c.qty,
              c.allocationPolicy as AllocationPolicy,
              now,
            );
      const totalSelectable = [...selectableByWarehouse.values()].reduce((a, b) => a + b, 0);
      const warning =
        allocation.shortfall > 0
          ? `Seçilebilir stok yetersiz: gereken ${c.qty}, mevcut ${totalSelectable}`
          : null;
      return {
        ruleId: c.ruleId,
        productId: c.productId,
        productCode: product?.code ?? null,
        productName: product?.name ?? c.productName,
        trackingType: product?.trackingType ?? 'none',
        unit: c.unit,
        qty: c.qty,
        required: c.required,
        allocationPolicy: c.allocationPolicy,
        suggestedWarehouseId,
        suggestedAllocations: allocation.allocations,
        shortfall: allocation.shortfall,
        warning,
        lots: options.sort((a, b) => a.lotCode.localeCompare(b.lotCode)),
      };
    });

    return { consumptions: previewLines, issues };
  }

  // ── Finalize ──────────────────────────────────────────────────────────────

  /**
   * Atomik kesinleştirme — kabul kriterleri 1/2/3/4 burada uygulanır.
   * Tüketim çözümlemesi işlem DIŞINDA planlanır (hızlı doğrulama + 409'lar),
   * defter yazımı işlem İÇİNDE koşullu azaltımla yapılır: plan ile yazım
   * arasında stok değişirse transaction tamamen geri döner.
   */
  async finalizeServiceRecord(
    auth: AuthContext,
    encounterId: string,
    recordId: string,
    dto: FinalizeServiceRecordDto,
    headerKey: string | null,
    request: AuthRequest,
  ) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, clinicId: auth.clinicId },
      select: { id: true, branchId: true, ownerId: true, patientId: true },
    });
    if (!encounter) {
      throw new NotFoundException({ code: 'ENCOUNTER_NOT_FOUND', message: 'Muayene bulunamadı' });
    }
    this.requireBranchAccess(auth, request, encounter.branchId);

    const record = await this.prisma.serviceRecord.findFirst({
      where: { id: recordId, encounterId: encounter.id },
      include: {
        lines: {
          orderBy: { id: 'asc' as const },
          include: { service: { select: { id: true, name: true, code: true } } },
        },
      },
    });
    if (!record) {
      throw new NotFoundException({
        code: FINALIZATION_ERROR_CODES.SERVICE_RECORD_NOT_FOUND,
        message: 'Hizmet kaydı bulunamadı',
      });
    }

    const requestKey = dto.idempotencyKey ?? headerKey ?? null;
    if (headerKey && !dto.idempotencyKey && !/^[0-9a-f-]{36}$/i.test(headerKey)) {
      throw new BadRequestException({
        code: 'VALIDATION',
        message: 'Idempotency-Key başlığı UUID olmalı',
      });
    }
    const decision = decideIdempotency(record, requestKey);
    if (decision === 'REPLAY') {
      // Mobil tekrar denemesi: aynı anahtar → aynı yanıt, yeni post yok.
      return this.recordDetail(record.id);
    }
    if (decision === 'CONFLICT') {
      throw new ConflictException({
        code: FINALIZATION_ERROR_CODES.SERVICE_RECORD_FINALIZED,
        message: 'Hizmet kaydı zaten kesinleşmiş',
      });
    }

    // Tüketim satırlarını çöz: açık onaylı girdi ya da kural planı.
    const resolved = dto.consumptions?.length
      ? await this.resolveExplicitConsumptions(auth.clinicId, encounter.branchId, dto.consumptions)
      : await this.resolveAutoConsumptions(auth.clinicId, encounter.branchId, record);
    if (resolved.length > 0) {
      this.requireConsumePermission(auth);
    }

    await this.prisma.$transaction(async (tx) => {
      // Satır kilidi: aynı kayıt üzerinde finalize/reversal yarışını serileştirir.
      const locked = await tx.$queryRaw<Array<{ status: string; idempotency_key: string | null }>>(
        Prisma.sql`SELECT status, idempotency_key FROM "service_records" WHERE id = ${record.id}::uuid FOR UPDATE`,
      );
      const lockedRecord = locked[0];
      if (!lockedRecord) {
        throw new NotFoundException({
          code: FINALIZATION_ERROR_CODES.SERVICE_RECORD_NOT_FOUND,
          message: 'Hizmet kaydı bulunamadı',
        });
      }
      const innerDecision = decideIdempotency(
        { status: lockedRecord.status, idempotencyKey: lockedRecord.idempotency_key },
        requestKey,
      );
      if (innerDecision === 'REPLAY') return;
      if (innerDecision === 'CONFLICT') {
        throw new ConflictException({
          code: FINALIZATION_ERROR_CODES.SERVICE_RECORD_FINALIZED,
          message: 'Hizmet kaydı zaten kesinleşmiş',
        });
      }

      // 1) Stok defter hareketi — depo bazında gruplanır (hareket tek depoludur);
      //    koşullu azaltım; yetersiz stok tüm işlemi geri alır.
      const movementIds: string[] = [];
      if (resolved.length > 0) {
        const byWarehouse = new Map<string, ResolvedConsumption[]>();
        for (const r of resolved) {
          const list = byWarehouse.get(r.warehouseId) ?? [];
          list.push(r);
          byWarehouse.set(r.warehouseId, list);
        }
        for (const [warehouseId, lines] of byWarehouse) {
          const movement = await this.stock.postServiceRecordMovement(tx, {
            clinicId: auth.clinicId,
            branchId: encounter.branchId,
            warehouseId,
            serviceRecordId: record.id,
            kind: 'service_consumption',
            note: dto.note ?? null,
            staffId: auth.staffId,
            lines: lines.map((r) => ({
              productId: r.productId,
              lotId: r.lotId,
              qty: -r.qty,
              unitCost: r.unitCost,
            })),
          });
          movementIds.push(movement.id);
        }
      }

      // 2) Ücret + satırları — fiyatlar ServiceRecordLine'dan dondurulur.
      const chargeLines = record.lines.map((line) =>
        toChargeLine({
          description: line.service.name,
          qty: Number(line.qty),
          unitPrice: Number(line.unitPrice),
          discount: Number(line.discount),
          tax: Number(line.tax),
        }),
      );
      const charge = await tx.charge.create({
        data: {
          clinicId: auth.clinicId,
          branchId: encounter.branchId,
          encounterId: encounter.id,
          serviceRecordId: record.id,
          ownerId: encounter.ownerId,
          patientId: encounter.patientId,
          status: 'open',
          currency: 'TRY',
          total: sumChargeTotals(chargeLines),
          note: dto.note ?? null,
          createdById: auth.staffId,
          lines: {
            create: chargeLines.map((l) => ({
              sourceType: 'service',
              sourceId: record.id,
              description: l.description,
              qty: new Prisma.Decimal(l.qty.toFixed(3)),
              unitPrice: new Prisma.Decimal(l.unitPrice.toFixed(2)),
              taxAmount: new Prisma.Decimal(l.taxAmount.toFixed(2)),
              total: new Prisma.Decimal(l.total.toFixed(2)),
            })),
          },
        },
      });

      // 3) Kaydı kesinleştir.
      await tx.serviceRecord.update({
        where: { id: record.id },
        data: {
          status: 'finalized',
          performedByStaffId: auth.staffId,
          finalizedAt: new Date(),
          idempotencyKey: requestKey,
        },
      });

      // 4) Denetim — aynı transaction içinde (kabul kriteri 1).
      await this.audit.record(
        {
          clinicId: auth.clinicId,
          staffId: auth.staffId,
          branchId: encounter.branchId,
          action: 'SERVICE_RECORD_FINALIZED',
          entityType: 'ServiceRecord',
          entityId: record.id,
          metadata: {
            encounterId: encounter.id,
            chargeId: charge.id,
            chargeTotal: sumChargeTotals(chargeLines),
            stockMovementIds: movementIds,
            consumptionLines: resolved.map((r) => ({
              productId: r.productId,
              lotId: r.lotId,
              warehouseId: r.warehouseId,
              qty: -r.qty,
            })),
          },
        },
        tx,
      );
    });

    return this.recordDetail(record.id);
  }

  /** Açık onaylı tüketim satırları — ürün/depo/parti doğrulamaları. */
  private async resolveExplicitConsumptions(
    clinicId: string,
    branchId: string,
    inputs: ConsumptionInputDto[],
  ): Promise<ResolvedConsumption[]> {
    const resolved: ResolvedConsumption[] = [];
    for (const input of inputs) {
      const product = await this.prisma.product.findFirst({
        where: { id: input.productId, clinicId },
        select: { id: true, trackingType: true },
      });
      if (!product) {
        throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Ürün bulunamadı' });
      }
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: input.warehouseId, branch: { clinicId, id: branchId }, active: true },
        select: { id: true },
      });
      if (!warehouse) {
        throw new BadRequestException({
          code: FINALIZATION_ERROR_CODES.WAREHOUSE_NOT_IN_BRANCH,
          message: 'Depo bu şubede bulunamadı',
        });
      }
      const qty = round3(input.qty);
      if (product.trackingType === 'none') {
        if (input.lotId) {
          throw new BadRequestException({
            code: FINALIZATION_ERROR_CODES.PRODUCT_NOT_LOT_TRACKED,
            message: 'Ürün parti takipli değildir',
          });
        }
        resolved.push({ productId: product.id, warehouseId: warehouse.id, lotId: null, qty, unitCost: 0 });
        continue;
      }
      if (!input.lotId) {
        throw new BadRequestException({
          code: 'PRODUCT_LOT_TRACKED',
          message: 'Parti takipli ürün için parti seçilmelidir',
        });
      }
      const lot = await this.prisma.inventoryLot.findFirst({
        where: { id: input.lotId, productId: product.id, warehouseId: warehouse.id },
      });
      if (!lot) {
        throw new NotFoundException({
          code: FINALIZATION_ERROR_CODES.LOT_NOT_FOUND,
          message: 'Parti bu depoda bulunamadı',
        });
      }
      const blocked = isLotSelectable({
        id: lot.id,
        lotCode: lot.lotCode,
        expiresAt: lot.expiresAt,
        status: lot.status,
        receivedAt: lot.receivedAt,
        qtyOnHand: 1,
      });
      if (blocked === 'expired' || blocked === 'quarantined') {
        throw new ConflictException({
          code: FINALIZATION_ERROR_CODES.LOT_BLOCKED,
          message: `Parti ${lot.lotCode} tüketim için seçilemez (${blocked})`,
        });
      }
      resolved.push({
        productId: product.id,
        warehouseId: warehouse.id,
        lotId: lot.id,
        qty,
        unitCost: Number(lot.unitCost),
      });
    }
    return resolved;
  }

  /** Kural tabanlı otomatik tüketim — preview önerisiyle aynı mantık. */
  private async resolveAutoConsumptions(
    clinicId: string,
    branchId: string,
    record: { id: string; lines: { serviceId: string; qty: Prisma.Decimal; service: { name: string } }[] },
  ): Promise<ResolvedConsumption[]> {
    const plan = await this.buildAutoPlan(clinicId, branchId, record);
    const resolved: ResolvedConsumption[] = [];
    for (const line of plan.consumptions) {
      if (line.allocationPolicy === 'manual') {
        throw new ConflictException({
          code: FINALIZATION_ERROR_CODES.REQUIRED_CONSUMPTION_MISSING,
          message: `${line.productName ?? line.productId} için parti seçimi gerekli (manual politika) — tüketim satırlarını açık gönderin`,
        });
      }
      if (line.shortfall > 0) {
        throw new ConflictException({
          code: FINALIZATION_ERROR_CODES.INSUFFICIENT_STOCK,
          message: line.warning ?? 'Seçilebilir stok yetersiz',
        });
      }
      for (const alloc of line.suggestedAllocations) {
        const lot = line.lots.find((l) => l.lotId === alloc.lotId);
        resolved.push({
          productId: line.productId,
          warehouseId: line.suggestedWarehouseId!,
          lotId: alloc.lotId,
          qty: alloc.qty,
          unitCost: lot?.unitCost ?? 0,
        });
      }
    }
    return resolved;
  }

  // ── Reversal ──────────────────────────────────────────────────────────────

  /**
   * Kesinleşmiş hizmet kaydının iptali — kabul kriteri 6: orijinal hareket ve
   * ücret satırları SİLİNMEZ; ters stok hareketi (stoğa iade) ve negatif ücret
   * düzeltme satırları yazılır. Tam iadede ücret toplamı 0'a iner ve void olur.
   */
  async reverseServiceRecord(
    auth: AuthContext,
    encounterId: string,
    recordId: string,
    reason: string,
    request: AuthRequest,
  ) {
    this.requireConsumePermission(auth);
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, clinicId: auth.clinicId },
      select: { id: true, branchId: true },
    });
    if (!encounter) {
      throw new NotFoundException({ code: 'ENCOUNTER_NOT_FOUND', message: 'Muayene bulunamadı' });
    }
    this.requireBranchAccess(auth, request, encounter.branchId);

    const record = await this.prisma.serviceRecord.findFirst({
      where: { id: recordId, encounterId: encounter.id },
      select: { id: true, status: true, reversedAt: true, branchId: true },
    });
    if (!record) {
      throw new NotFoundException({
        code: FINALIZATION_ERROR_CODES.SERVICE_RECORD_NOT_FOUND,
        message: 'Hizmet kaydı bulunamadı',
      });
    }
    if (record.status !== 'finalized') {
      throw new ConflictException({
        code: FINALIZATION_ERROR_CODES.SERVICE_RECORD_FINALIZED,
        message: 'Yalnızca kesinleşmiş kayıt iptal edilebilir',
      });
    }
    if (record.reversedAt) {
      throw new ConflictException({
        code: FINALIZATION_ERROR_CODES.SERVICE_RECORD_REVERSED,
        message: 'Hizmet kaydı zaten iptal edilmiş',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ status: string; reversed_at: Date | null }>>(
        Prisma.sql`SELECT status, reversed_at FROM "service_records" WHERE id = ${record.id}::uuid FOR UPDATE`,
      );
      const lockedRecord = locked[0];
      if (!lockedRecord || lockedRecord.status !== 'finalized' || lockedRecord.reversed_at) {
        throw new ConflictException({
          code: lockedRecord?.reversed_at
            ? FINALIZATION_ERROR_CODES.SERVICE_RECORD_REVERSED
            : FINALIZATION_ERROR_CODES.SERVICE_RECORD_FINALIZED,
          message: 'Hizmet kaydı iptal durumu değişti',
        });
      }

      // 1) Ters stok hareketi — her orijinal hareket için pozitif iade
      //    (finalize depo bazında çok hareket açabiliryor).
      const originals = await tx.stockMovement.findMany({
        where: { refType: 'ServiceRecord', refId: record.id, kind: 'service_consumption' },
        include: { lines: true },
      });
      const reversalMovementIds: string[] = [];
      for (const original of originals) {
        const reversal = await this.stock.postServiceRecordMovement(tx, {
          clinicId: auth.clinicId,
          branchId: encounter.branchId,
          warehouseId: original.warehouseId,
          serviceRecordId: record.id,
          kind: 'service_reversal',
          note: reason,
          staffId: auth.staffId,
          lines: original.lines.map((l) => ({
            productId: l.productId,
            lotId: l.lotId,
            qty: Number(l.qty) * -1, // negatif tüketim → pozitif iade
            unitCost: Number(l.unitCost),
          })),
        });
        reversalMovementIds.push(reversal.id);
      }

      // 2) Ücret düzeltmesi — negatif satırlar, orijinal satırlar korunur.
      const charge = await tx.charge.findUnique({
        where: { serviceRecordId: record.id },
        include: { lines: true },
      });
      let chargeId: string | null = null;
      let newTotal: number | null = null;
      let chargeStatus: string | null = null;
      if (charge) {
        const serviceLines = charge.lines.filter((l) => l.sourceType === 'service');
        const reversalLines = buildReversalChargeLines(
          serviceLines.map((l) => ({
            description: l.description,
            qty: Number(l.qty),
            unitPrice: Number(l.unitPrice),
            taxAmount: Number(l.taxAmount),
            total: Number(l.total),
          })),
        );
        newTotal = sumChargeTotals([
          ...charge.lines.map((l) => ({ total: Number(l.total) })),
          ...reversalLines,
        ]);
        chargeStatus = Math.abs(newTotal) < 0.005 ? 'void' : 'open';
        const updated = await tx.charge.update({
          where: { id: charge.id },
          data: {
            total: new Prisma.Decimal(newTotal.toFixed(2)),
            status: chargeStatus,
            lines: {
              create: reversalLines.map((l) => ({
                sourceType: 'service_reversal',
                sourceId: record.id,
                description: l.description,
                qty: new Prisma.Decimal(l.qty.toFixed(3)),
                unitPrice: new Prisma.Decimal(l.unitPrice.toFixed(2)),
                taxAmount: new Prisma.Decimal(l.taxAmount.toFixed(2)),
                total: new Prisma.Decimal(l.total.toFixed(2)),
              })),
            },
          },
        });
        chargeId = updated.id;
      }

      // 3) Kaydı işaretle — orijinal veriler aynen kalır.
      await tx.serviceRecord.update({
        where: { id: record.id },
        data: { reversedAt: new Date(), reversedByStaffId: auth.staffId },
      });

      // 4) Denetim.
      await this.audit.record(
        {
          clinicId: auth.clinicId,
          staffId: auth.staffId,
          branchId: encounter.branchId,
          action: 'SERVICE_RECORD_REVERSED',
          entityType: 'ServiceRecord',
          entityId: record.id,
          metadata: {
            encounterId: encounter.id,
            reason,
            reversalStockMovementIds: reversalMovementIds,
            chargeId,
            chargeTotalAfter: newTotal,
            chargeStatusAfter: chargeStatus,
          },
        },
        tx,
      );
    });

    return this.recordDetail(record.id);
  }
}
