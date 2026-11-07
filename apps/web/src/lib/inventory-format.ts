/**
 * Faz 07 istemci yardımcıları — API Decimal alanları string olarak gelir;
 * görüntüleme ve fark hesabı için küçük yardımcılar.
 */

/** API'den gelen Decimal string'ini sayıya çevirir (null/boş → 0). */
export function decimalToNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  return Number(value);
}

/** Sayım farkı: counted − expected; sayılmayan satırda null. */
export function countDifference(expected: number, counted: number | null): number | null {
  if (counted === null) return null;
  return round3(counted - expected);
}

/** 3 ondalığa yuvarlama (miktar alanları Decimal(12,3)). */
export function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/** Para görüntüleme: tr-TR, 2 ondalık. */
export function formatMoney(value: string | number | null | undefined): string {
  return decimalToNumber(value).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Miktar görüntüleme: gereksiz sıfırları kısaltır. */
export function formatQty(value: string | number | null | undefined): string {
  const n = decimalToNumber(value);
  return Number.isInteger(n) ? String(n) : n.toLocaleString('tr-TR', { maximumFractionDigits: 3 });
}
