/**
 * Stok alan mantığı — saf fonksiyonlar (Faz 07).
 *
 * Kabul kriterlerinin çekirdeği burada test edilir:
 * - Expired/karantina partileri tüketim için seçilemez (isLotSelectable).
 * - FEFO önerisi: en yakın son kullanma tarihi önce, tarihsiz en son (sortFefo).
 * - Lot bazlı tahsis: tek partide yetersizse birden çok partiye bölünür
 *   (allocateFefo) — yalnızca seçilebilir partiler üzerinden.
 * - Sayım farkı: counted − expected (decimal, kuruş kaymasız).
 */

export interface FefoLot {
  id: string;
  lotCode: string;
  expiresAt: Date | null;
  status: string;
  receivedAt: Date;
  /** Bu partinin tüketilebilir kalan miktarı (bakiye projeksiyonundan) */
  qtyOnHand: number;
}

export type LotBlockReason = 'expired' | 'quarantined' | 'exhausted';

/**
 * Lot tüketim için seçilebilir mi? Süresi dolmuş (gün sonu karşılaştırması),
 * karantinadaki veya stoğu tükenmiş partiler seçilemez.
 */
export function isLotSelectable(lot: FefoLot, at: Date = new Date()): LotBlockReason | null {
  if (lot.qtyOnHand <= 0) return 'exhausted';
  if (lot.status === 'quarantined') return 'quarantined';
  if (lot.expiresAt && endOfDay(lot.expiresAt).getTime() < at.getTime()) return 'expired';
  return null;
}

/** Gün sonuna (23:59:59.999) normalize eder — son kullanma günü dahil kullanılabilir. */
export function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

/** FEFO sıralaması: SKT yakını önce; tarihsizler sona; eşitlikte önce alınan önce. */
export function sortFefo<T extends FefoLot>(lots: T[]): T[] {
  return [...lots].sort((a, b) => {
    const aTime = a.expiresAt ? a.expiresAt.getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.expiresAt ? b.expiresAt.getTime() : Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    return a.receivedAt.getTime() - b.receivedAt.getTime();
  });
}

export interface FefoAllocation {
  lotId: string;
  lotCode: string;
  qty: number;
  blockReason: LotBlockReason | null;
}

export class InsufficientStockError extends Error {
  constructor(
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(`Yetersiz stok: istenen ${requested}, seçilebilir ${available}`);
    this.name = 'InsufficientStockError';
  }
}

/**
 * FEFO tahsis: seçilebilir partilerden başlayarak istenen miktarı böler.
 * Toplam seçilebilir miktar yetersizse InsufficientStockError fırlatır.
 */
export function allocateFefo(
  lots: FefoLot[],
  requestedQty: number,
  at: Date = new Date(),
): FefoAllocation[] {
  const allocations: FefoAllocation[] = [];
  let remaining = requestedQty;
  for (const lot of sortFefo(lots)) {
    if (remaining <= 0) break;
    const blockReason = isLotSelectable(lot, at);
    if (blockReason) {
      // Bloklu partiler tahsise girmez; yanıt bilgilendirme için taşınır
      if (lot.qtyOnHand > 0) {
        allocations.push({ lotId: lot.id, lotCode: lot.lotCode, qty: 0, blockReason });
      }
      continue;
    }
    const take = Math.min(lot.qtyOnHand, remaining);
    if (take <= 0) continue;
    allocations.push({ lotId: lot.id, lotCode: lot.lotCode, qty: take, blockReason: null });
    remaining -= take;
  }
  if (remaining > 0.0000001) {
    const available = lots
      .filter((lot) => isLotSelectable(lot, at) === null)
      .reduce((sum, lot) => sum + Math.max(0, lot.qtyOnHand), 0);
    throw new InsufficientStockError(requestedQty, available);
  }
  return allocations.filter((a) => a.qty > 0 || a.blockReason !== null);
}

/** Sayım farkı: counted − expected. counted null ise fark hesaplanmaz (null). */
export function countDifference(expected: number, counted: number | null): number | null {
  if (counted === null) return null;
  return round3(counted - expected);
}

/** 3 ondalığa yuvarlama (miktar alanları Decimal(12,3)). */
export function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/**
 * Birim dönüşümü: qty fromUnit = qty × factor toUnit.
 * factor <= 0 geçersizdir; sonuç 3 ondalığa yuvarlanır.
 */
export function convertQty(qty: number, factor: number): number {
  if (factor <= 0) throw new Error('Dönüşüm katsayısı pozitif olmalı');
  return round3(qty * factor);
}

/** Son kullanmaya kalan gün (gün sonu bazlı, negatif = süresi geçmiş). */
export function daysUntil(expiresAt: Date, at: Date = new Date()): number {
  const ms = endOfDay(expiresAt).getTime() - at.getTime();
  return Math.floor(ms / (24 * 3600 * 1000));
}
