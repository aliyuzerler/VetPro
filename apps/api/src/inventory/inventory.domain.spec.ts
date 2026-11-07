import { describe, expect, it } from 'vitest';
import {
  allocateFefo,
  convertQty,
  countDifference,
  daysUntil,
  InsufficientStockError,
  isLotSelectable,
  round3,
  sortFefo,
  type FefoLot,
} from './inventory.domain';

/**
 * Faz 07 alan mantığı birim testleri — FEFO sıralama/tahsis, bloklu parti
 * seçilebilirlik kuralları ve sayım farkı hesabı.
 */

function lot(partial: Partial<FefoLot> & { id: string }): FefoLot {
  const now = new Date('2026-01-15T10:00:00Z');
  return {
    lotCode: partial.id,
    expiresAt: null,
    status: 'active',
    receivedAt: now,
    qtyOnHand: 10,
    ...partial,
  };
}

const NOW = new Date('2026-01-15T10:00:00Z');

describe('isLotSelectable', () => {
  it('süresi geçen parti bloklanır (gün sonu bazlı)', () => {
    const expired = lot({ id: 'l1', expiresAt: new Date('2026-01-14T23:59:59Z'), qtyOnHand: 5 });
    expect(isLotSelectable(expired, NOW)).toBe('expired');
  });

  it('son kullanma günü dahil kullanılabilir', () => {
    const today = lot({ id: 'l2', expiresAt: new Date('2026-01-15T08:00:00Z'), qtyOnHand: 5 });
    expect(isLotSelectable(today, NOW)).toBeNull();
  });

  it('karantina partisi bloklanır', () => {
    const quarantined = lot({ id: 'l3', status: 'quarantined', qtyOnHand: 5 });
    expect(isLotSelectable(quarantined, NOW)).toBe('quarantined');
  });

  it('stoğu tükenmiş parti bloklanır', () => {
    const empty = lot({ id: 'l4', qtyOnHand: 0 });
    expect(isLotSelectable(empty, NOW)).toBe('exhausted');
  });

  it('tarihsiz aktif parti seçilebilir', () => {
    const bulk = lot({ id: 'l5', expiresAt: null });
    expect(isLotSelectable(bulk, NOW)).toBeNull();
  });
});

describe('sortFefo', () => {
  it('en yakın son kullanma önce, tarihsiz en son', () => {
    const lots = [
      lot({ id: 'uzak', expiresAt: new Date('2027-01-01T00:00:00Z') }),
      lot({ id: 'tarihsiz', expiresAt: null }),
      lot({ id: 'yakin', expiresAt: new Date('2026-02-01T00:00:00Z') }),
    ];
    expect(sortFefo(lots).map((l) => l.id)).toEqual(['yakin', 'uzak', 'tarihsiz']);
  });

  it('eşit SKTte önce alınan parti önce gelir', () => {
    const first = lot({ id: 'ilk', expiresAt: new Date('2026-06-01T00:00:00Z'), receivedAt: new Date('2026-01-01T00:00:00Z') });
    const second = lot({ id: 'sonra', expiresAt: new Date('2026-06-01T00:00:00Z'), receivedAt: new Date('2026-01-05T00:00:00Z') });
    expect(sortFefo([second, first]).map((l) => l.id)).toEqual(['ilk', 'sonra']);
  });
});

describe('allocateFefo', () => {
  it('bloklu partileri atlayarak seçilebilir en yakın SKTten tahsis eder', () => {
    const lots = [
      lot({ id: 'expired', expiresAt: new Date('2026-01-01T00:00:00Z'), qtyOnHand: 20 }),
      lot({ id: 'yakin', expiresAt: new Date('2026-02-01T00:00:00Z'), qtyOnHand: 5 }),
      lot({ id: 'uzak', expiresAt: new Date('2026-08-01T00:00:00Z'), qtyOnHand: 10 }),
    ];
    const result = allocateFefo(lots, 12, NOW);
    const positive = result.filter((r) => r.qty > 0);
    expect(positive).toEqual([
      expect.objectContaining({ lotId: 'yakin', qty: 5 }),
      expect.objectContaining({ lotId: 'uzak', qty: 7 }),
    ]);
  });

  it('karantina partisi tahsise girmez', () => {
    const lots = [
      lot({ id: 'karantina', status: 'quarantined', qtyOnHand: 10 }),
      lot({ id: 'aktif', expiresAt: new Date('2026-05-01T00:00:00Z'), qtyOnHand: 4 }),
    ];
    const result = allocateFefo(lots, 4, NOW);
    expect(result.filter((r) => r.qty > 0).map((r) => r.lotId)).toEqual(['aktif']);
  });

  it('yetersiz stokta InsufficientStockError fırlatır ve yalnız seçilebilir miktarı sayar', () => {
    const lots = [
      lot({ id: 'expired', expiresAt: new Date('2026-01-01T00:00:00Z'), qtyOnHand: 100 }),
      lot({ id: 'karantina', status: 'quarantined', qtyOnHand: 50 }),
      lot({ id: 'aktif', qtyOnHand: 3 }),
    ];
    try {
      allocateFefo(lots, 5, NOW);
      expect.unreachable('hata bekleniyordu');
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientStockError);
      const e = error as InsufficientStockError;
      expect(e.available).toBe(3);
      expect(e.requested).toBe(5);
    }
  });

  it('tek partide tam karşılanabilen talep bölünmez', () => {
    const lots = [lot({ id: 'tek', qtyOnHand: 10 })];
    const result = allocateFefo(lots, 10, NOW);
    const positive = result.filter((r) => r.qty > 0);
    expect(positive).toHaveLength(1);
    expect(positive[0]!.qty).toBe(10);
  });
});

describe('countDifference', () => {
  it('fark = sayılan − beklenen', () => {
    expect(countDifference(10, 9)).toBe(-1);
    expect(countDifference(10, 12.5)).toBe(2.5);
  });

  it('sayılmayan satırda fark null', () => {
    expect(countDifference(10, null)).toBeNull();
  });
});

describe('convertQty ve round3', () => {
  it('birim dönüşümü 3 ondalığa yuvarlar', () => {
    expect(convertQty(2.5, 10)).toBe(25);
    expect(convertQty(1, 0.333333)).toBe(0.333);
  });

  it('geçersiz katsayı reddedilir', () => {
    expect(() => convertQty(1, 0)).toThrow();
    expect(() => convertQty(1, -2)).toThrow();
  });

  it('round3 ondalık kaymasını önler', () => {
    expect(round3(0.1 + 0.2)).toBe(0.3);
  });
});

describe('daysUntil', () => {
  it('son kullanmaya kalan günü hesaplar; geçmiş negatif', () => {
    const at = new Date('2026-01-15T10:00:00Z');
    expect(daysUntil(new Date('2026-01-20T10:00:00Z'), at)).toBe(5);
    expect(daysUntil(new Date('2026-01-10T10:00:00Z'), at)).toBeLessThan(0);
  });
});
