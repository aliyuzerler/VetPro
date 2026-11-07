/**
 * Hizmet → stok → ücret atomik iş akışı — alan mantığı (Faz 08, saf fonksiyonlar).
 *
 * Kabul kriterlerinin çekirdeği burada test edilir:
 * - Tüketim planı: ServiceConsumptionRule defaultQty × hizmet satır adedi;
 *   ürünü olmayan kural uyarı üretir (RULE_WITHOUT_PRODUCT).
 * - Tahsis politikası: 'fifo' → receivedAt; 'nearest_expiry' → SKT (FEFO);
 *   'manual' → otomatik tahsis yok (kullanıcı seçer), eksik kalan kısım kısa.
 * - Bloklu partiler (expired/quarantined/exhausted) hiçbir politikada seçilmez.
 * - Ücret toplamı: 2 ondalık, kuruş kaymasız; reversal satırları negatif yazılır
 *   ve orijinal satırlar değiştirilmez (append-only).
 * - Idempotency kararı: aynı anahtarla finalize tekrarı REPLAY (aynı sonuç),
 *   farklı anahtarla ikinci finalize CONFLICT, draft PROCEED.
 */

import { isLotSelectable, type LotBlockReason } from '../inventory/inventory.domain';

export const FINALIZATION_ERROR_CODES = {
  SERVICE_RECORD_NOT_FOUND: 'SERVICE_RECORD_NOT_FOUND',
  SERVICE_RECORD_FINALIZED: 'SERVICE_RECORD_FINALIZED',
  SERVICE_RECORD_REVERSED: 'SERVICE_RECORD_REVERSED',
  IDEMPOTENCY_KEY_CONFLICT: 'IDEMPOTENCY_KEY_CONFLICT',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  LOT_BLOCKED: 'LOT_BLOCKED',
  LOT_NOT_FOUND: 'LOT_NOT_FOUND',
  PRODUCT_NOT_LOT_TRACKED: 'PRODUCT_NOT_LOT_TRACKED',
  WAREHOUSE_NOT_IN_BRANCH: 'WAREHOUSE_NOT_IN_BRANCH',
  REQUIRED_CONSUMPTION_MISSING: 'REQUIRED_CONSUMPTION_MISSING',
  EMPTY_RECORD: 'EMPTY_RECORD',
} as const;

export type AllocationPolicy = 'fifo' | 'nearest_expiry' | 'manual';

/** ServiceConsumptionRule — Decimal alanlar çağrıda sayıya çözülmüş gelir. */
export interface ConsumptionRuleInput {
  id: string;
  serviceId: string;
  productId: string | null;
  defaultQty: number;
  unit: string | null;
  required: boolean;
  allocationPolicy: string;
  active: boolean;
  productName?: string | null;
}

export interface PlanLineInput {
  serviceId: string;
  qty: number;
  serviceName?: string;
}

export interface PlannedConsumption {
  ruleId: string;
  serviceId: string;
  productName: string | null;
  productId: string;
  /** defaultQty × hizmet satır adedi (3 ondalığa yuvarlanmış) */
  qty: number;
  required: boolean;
  allocationPolicy: AllocationPolicy;
  unit: string | null;
}

export type PlanIssueCode =
  | 'RULE_WITHOUT_PRODUCT'
  | 'DUPLICATE_PRODUCT_RULE'
  | 'INVALID_POLICY';

export interface PlanIssue {
  code: PlanIssueCode;
  message: string;
  serviceId?: string;
  ruleId?: string;
}

export function normalizePolicy(policy: string): AllocationPolicy {
  return policy === 'nearest_expiry' || policy === 'manual' ? policy : 'fifo';
}

/** 3 ondalığa yuvarlama — Decimal(12,3) sütunlarla tutarlı. */
export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** 2 ondalığa yuvarlama — Decimal(12,2) sütunlarla tutarlı. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Tüketim planını üretir: her hizmet satırı için o hizmetin aktif kuralları
 * defaultQty × satır adedi kadar malzeme ister. productId'si olmayan kural
 * (Faz 06 draft kuralı) uyarıyla atlanır; aynı ürün için birden çok kural
 * birleştirilmez — ilk aktif kural kazanır (DUPLICATE_PRODUCT_RULE uyarısı).
 */
export function planRuleConsumptions(
  rules: ConsumptionRuleInput[],
  lines: PlanLineInput[],
): { consumptions: PlannedConsumption[]; issues: PlanIssue[] } {
  const consumptions: PlannedConsumption[] = [];
  const issues: PlanIssue[] = [];
  const seen = new Set<string>(); // serviceId:productId — kural birleşimi

  for (const line of lines) {
    const lineRules = rules.filter((r) => r.serviceId === line.serviceId && r.active);
    for (const rule of lineRules) {
      if (!rule.productId) {
        issues.push({
          code: 'RULE_WITHOUT_PRODUCT',
          message: `Kural ${rule.id} ürünle ilişkili değil — tüketim planına alınmadı`,
          serviceId: rule.serviceId,
          ruleId: rule.id,
        });
        continue;
      }
      const key = `${rule.serviceId}:${rule.productId}`;
      if (seen.has(key)) {
        issues.push({
          code: 'DUPLICATE_PRODUCT_RULE',
          message: `Hizmet için aynı ürüne ikinci kural yoksayıldı (kural ${rule.id})`,
          serviceId: rule.serviceId,
          ruleId: rule.id,
        });
        continue;
      }
      seen.add(key);
      consumptions.push({
        ruleId: rule.id,
        serviceId: rule.serviceId,
        productId: rule.productId,
        productName: rule.productName ?? null,
        qty: round3(rule.defaultQty * line.qty),
        required: rule.required,
        allocationPolicy: normalizePolicy(rule.allocationPolicy),
        unit: rule.unit,
      });
    }
  }
  return { consumptions, issues };
}

/** Tahsis adayı parti — bakiye projeksiyonundan çözülmüş kalan miktarla. */
export interface AllocLot {
  lotId: string;
  lotCode: string;
  expiresAt: Date | null;
  status: string;
  receivedAt: Date;
  qtyOnHand: number;
}

export interface LotAllocation {
  lotId: string;
  lotCode: string;
  qty: number;
  blockReason: LotBlockReason | null;
}

export interface AllocationResult {
  allocations: LotAllocation[];
  /** Seçilebilir stok yetmediğinde kalan miktar (>0 ise finalize reddedilir). */
  shortfall: number;
}

/**
 * Politikaya göre lot tahsisi: bloklu partiler elenir, kalanlar sıralanır
 * ('fifo' → receivedAt artan; 'nearest_expiry' → SKT artan, tarihsiz sona),
 * tek parti yetmezse birden çok partiye bölünür. 'manual' otomatik tahsis
 * yapmaz — dialogda kullanıcı parti seçer, tüm ihtiyaç kısa sayılır.
 */
export function allocateByPolicy(
  lots: AllocLot[],
  needed: number,
  policy: AllocationPolicy,
  at: Date = new Date(),
): AllocationResult {
  if (needed <= 0) return { allocations: [], shortfall: 0 };
  if (policy === 'manual') {
    return { allocations: [], shortfall: needed };
  }
  const selectable = lots
    .map((lot) => ({ lot, reason: isLotSelectable({ ...lot, id: lot.lotId }, at) }))
    .filter((x) => x.reason === null)
    .map((x) => x.lot);
  const sorted = [...selectable].sort((a, b) => {
    if (policy === 'nearest_expiry') {
      const aExp = a.expiresAt ? a.expiresAt.getTime() : Number.POSITIVE_INFINITY;
      const bExp = b.expiresAt ? b.expiresAt.getTime() : Number.POSITIVE_INFINITY;
      if (aExp !== bExp) return aExp - bExp;
    }
    return a.receivedAt.getTime() - b.receivedAt.getTime();
  });
  const allocations: LotAllocation[] = [];
  let remaining = round3(needed);
  for (const lot of sorted) {
    if (remaining <= 0) break;
    const take = round3(Math.min(remaining, lot.qtyOnHand));
    if (take <= 0) continue;
    allocations.push({ lotId: lot.lotId, lotCode: lot.lotCode, qty: take, blockReason: null });
    remaining = round3(remaining - take);
  }
  return { allocations, shortfall: remaining > 0 ? remaining : 0 };
}

/** Ücret satırı girişi — ServiceRecordLine'dan dondurulmuş değerler. */
export interface ChargeLineInput {
  description: string;
  qty: number;
  unitPrice: number;
  discount: number;
  tax: number;
}

export interface ChargeLineTotals {
  description: string;
  qty: number;
  unitPrice: number;
  taxAmount: number;
  total: number;
}

/**
 * Hizmet satırından ücret satırı: qty × unitPrice − discount + tax.
 * (ServiceRecordLine.lineTotal ile aynı formül — computeLineTotal.) İndirim
 * satır düzeyinde kalır; ChargeLine'da ayrı sütun tutulmaz, net tutar yazılır.
 */
export function toChargeLine(line: ChargeLineInput): ChargeLineTotals {
  const total = round2(Number(line.qty) * Number(line.unitPrice) - Number(line.discount) + Number(line.tax));
  return {
    description: line.description,
    qty: line.qty,
    unitPrice: line.unitPrice,
    taxAmount: round2(line.tax),
    total,
  };
}

/** Charge satırlarından net toplam — reversal sonrası yeniden hesap için. */
export function sumChargeTotals(lines: { total: number }[]): number {
  return round2(lines.reduce((acc, l) => acc + Number(l.total), 0));
}

export interface ReversalChargeLine {
  description: string;
  qty: number;
  unitPrice: number;
  taxAmount: number;
  total: number;
}

/**
 * Reversal ücret satırları: orijinal satırların aynısının işaretli tersi.
 * Orijinal satırlar silinmez/üzerine yazılmaz (append-only ilkesi); toplam
 * tamamen tersine çevriliyorsa satır toplamları net sıfır verir.
 */
export function buildReversalChargeLines(
  lines: { description: string; qty: number; unitPrice: number; taxAmount: number; total: number }[],
): ReversalChargeLine[] {
  return lines.map((l) => ({
    description: `İptal — ${l.description}`,
    qty: -l.qty,
    unitPrice: l.unitPrice,
    taxAmount: -l.taxAmount,
    total: -l.total,
  }));
}

export type IdempotencyDecision = 'PROCEED' | 'REPLAY' | 'CONFLICT';

/**
 * Idempotency kararı — mobil tekrar denemeleri duplicate yaratmamalı:
 * - Kayıt finalized VE aynı anahtar → REPLAY (aynı yanıt döner, yeni post yok)
 * - Kayıt finalized VE farklı (veya eksik) anahtar → CONFLICT
 * - Kayıt draft → PROCEED
 */
export function decideIdempotency(
  record: { status: string; idempotencyKey: string | null },
  requestKey: string | null,
): IdempotencyDecision {
  if (record.status !== 'finalized') return 'PROCEED';
  return requestKey !== null && record.idempotencyKey === requestKey ? 'REPLAY' : 'CONFLICT';
}
