/**
 * Hizmet fiyatı çözümleme — Faz 06 kabul kriteri:
 * "Hizmet fiyat geçerlilik tarihleri ve branch override doğru çözülmeli."
 *
 * Kurallar:
 * 1. Aday satırlar: validFrom <= anlık zaman VE (validTo null veya validTo > anlık zaman).
 *    validTo = üst sınır hariç (open-closed değil, closed-open aralık) — aynı gün
 *    geçişlerinde çift fiyat seçilmez.
 * 2. Şube override (branchId eşit) genel fiyattan (branchId null) önce gelir.
 * 3. Aynı öncelik seviyesinde en yeni validFrom kazanır (fiyat güncellemesi).
 */

export type PriceRow = {
  id: string;
  branchId: string | null;
  /** Decimal|string|number hepsi kabul edilir — Number() ile normalize edilir. */
  amount: string | number | { toString(): string; toNumber(): number };
  validFrom: Date | string;
  validTo: Date | string | null;
};

export type ResolvedPrice = {
  priceId: string;
  amount: number;
  source: 'branch_override' | 'global';
  validFrom: Date;
  validTo: Date | null;
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Fiyat satırlarından geçerli fiyatı seçer. Saf fonksiyon — birim testlerle kaplanır.
 * Geçerli fiyat yoksa null döner (çağıran taraf SERVICE_PRICE_MISSING hatası üretir).
 */
export function resolvePrice(
  rows: readonly PriceRow[],
  branchId: string | null,
  at: Date = new Date(),
): ResolvedPrice | null {
  const candidates = rows.filter((row) => {
    const from = toDate(row.validFrom);
    if (from.getTime() > at.getTime()) return false;
    if (row.validTo !== null && row.validTo !== undefined) {
      const to = toDate(row.validTo);
      if (to.getTime() <= at.getTime()) return false;
    }
    return true;
  });

  const branchMatch = candidates.filter((row) => row.branchId === branchId && row.branchId !== null);
  const globalMatch = candidates.filter((row) => row.branchId === null);

  // Şube override önceliği: eşleşen şube satırı varsa genel fiyat yok sayılır
  const pool = branchMatch.length > 0 ? branchMatch : globalMatch;
  if (pool.length === 0) return null;

  const winner = pool.reduce((best, row) =>
    toDate(row.validFrom).getTime() > toDate(best.validFrom).getTime() ? row : best,
  );

  return {
    priceId: winner.id,
    amount: typeof winner.amount === 'object' ? winner.amount.toNumber() : Number(winner.amount),
    source: branchMatch.length > 0 ? 'branch_override' : 'global',
    validFrom: toDate(winner.validFrom),
    validTo: winner.validTo ? toDate(winner.validTo) : null,
  };
}
