import { describe, expect, it } from 'vitest';
import {
  allocateByPolicy,
  buildReversalChargeLines,
  decideIdempotency,
  normalizePolicy,
  planRuleConsumptions,
  round2,
  round3,
  sumChargeTotals,
  toChargeLine,
  type AllocLot,
  type ConsumptionRuleInput,
} from './service-finalization.domain';

const lot = (
  id: string,
  lotCode: string,
  qtyOnHand: number,
  opts: { receivedAt?: Date; expiresAt?: Date | null; status?: string } = {},
): AllocLot => ({
  lotId: id,
  lotCode,
  qtyOnHand,
  status: opts.status ?? 'active',
  receivedAt: opts.receivedAt ?? new Date('2026-01-01T00:00:00Z'),
  expiresAt: opts.expiresAt === undefined ? new Date('2027-06-01T00:00:00Z') : opts.expiresAt,
});

const rule = (over: Partial<ConsumptionRuleInput>): ConsumptionRuleInput => ({
  id: 'rule-1',
  serviceId: 'svc-1',
  productId: 'prod-1',
  defaultQty: 1,
  unit: 'doz',
  required: false,
  allocationPolicy: 'fifo',
  active: true,
  productName: 'Kuduz Aşısı',
  ...over,
});

describe('service-finalization.domain (Faz 08)', () => {
  describe('planRuleConsumptions', () => {
    it('defaultQty × hizmet satır adedi ile tüketim üretir', () => {
      const { consumptions, issues } = planRuleConsumptions(
        [rule({ defaultQty: 1.5 })],
        [{ serviceId: 'svc-1', qty: 2 }],
      );
      expect(issues).toHaveLength(0);
      expect(consumptions).toHaveLength(1);
      expect(consumptions[0]).toMatchObject({
        productId: 'prod-1',
        qty: 3,
        allocationPolicy: 'fifo',
        required: false,
      });
    });

    it('birden çok hizmet satırı ve kuralı çaprazlanır', () => {
      const rules = [
        rule({ id: 'r-a', serviceId: 'svc-1', productId: 'prod-a', defaultQty: 1 }),
        rule({ id: 'r-b', serviceId: 'svc-2', productId: 'prod-b', defaultQty: 2, required: true }),
      ];
      const { consumptions } = planRuleConsumptions(rules, [
        { serviceId: 'svc-1', qty: 1 },
        { serviceId: 'svc-2', qty: 3 },
      ]);
      expect(consumptions).toHaveLength(2);
      expect(consumptions[1]).toMatchObject({ productId: 'prod-b', qty: 6, required: true });
    });

    it('ürünsüz kural (Faz 06 draft) uyarıyla atlanır', () => {
      const { consumptions, issues } = planRuleConsumptions(
        [rule({ productId: null })],
        [{ serviceId: 'svc-1', qty: 1 }],
      );
      expect(consumptions).toHaveLength(0);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.code).toBe('RULE_WITHOUT_PRODUCT');
    });

    it('aynı hizmet+ürün için ikinci kural yoksayılır ve uyarı verir', () => {
      const { consumptions, issues } = planRuleConsumptions(
        [rule({ id: 'r-1' }), rule({ id: 'r-2', defaultQty: 9 })],
        [{ serviceId: 'svc-1', qty: 1 }],
      );
      expect(consumptions).toHaveLength(1);
      expect(consumptions[0]!.ruleId).toBe('r-1');
      expect(issues).toHaveLength(1);
      expect(issues[0]!.code).toBe('DUPLICATE_PRODUCT_RULE');
    });

    it('pasif kural plana girmez', () => {
      const { consumptions } = planRuleConsumptions(
        [rule({ active: false })],
        [{ serviceId: 'svc-1', qty: 1 }],
      );
      expect(consumptions).toHaveLength(0);
    });

    it('hizmet satırı olmayan kural tüketim üretmez', () => {
      const { consumptions } = planRuleConsumptions([rule({})], []);
      expect(consumptions).toHaveLength(0);
    });
  });

  describe('allocateByPolicy', () => {
    it('fifo: alınma sırasına göre böler', () => {
      const lots = [
        lot('l-2', 'B', 2, { receivedAt: new Date('2026-02-01T00:00:00Z') }),
        lot('l-1', 'A', 1, { receivedAt: new Date('2026-01-01T00:00:00Z') }),
      ];
      const { allocations, shortfall } = allocateByPolicy(lots, 3, 'fifo');
      expect(shortfall).toBe(0);
      expect(allocations).toEqual([
        { lotId: 'l-1', lotCode: 'A', qty: 1, blockReason: null },
        { lotId: 'l-2', lotCode: 'B', qty: 2, blockReason: null },
      ]);
    });

    it('nearest_expiry: SKT yakını önce (FEFO)', () => {
      const lots = [
        lot('l-far', 'UZAK', 5, { expiresAt: new Date('2028-12-01T00:00:00Z') }),
        lot('l-near', 'YAKIN', 2, { expiresAt: new Date('2027-05-01T00:00:00Z') }),
      ];
      const { allocations } = allocateByPolicy(lots, 3, 'nearest_expiry');
      expect(allocations[0]!.lotId).toBe('l-near');
      expect(allocations[0]!.qty).toBe(2);
      expect(allocations[1]!.lotId).toBe('l-far');
      expect(allocations[1]!.qty).toBe(1);
    });

    it('süresi geçmiş ve karantina partileri hiçbir politikada seçilmez', () => {
      const lots = [
        lot('l-exp', 'GECTI', 10, { expiresAt: new Date('2020-01-01T00:00:00Z') }),
        lot('l-q', 'KARANTINA', 10, { status: 'quarantined' }),
        lot('l-ok', 'IYI', 4),
      ];
      const { allocations, shortfall } = allocateByPolicy(lots, 3, 'fifo');
      expect(allocations).toHaveLength(1);
      expect(allocations[0]!.lotId).toBe('l-ok');
      expect(shortfall).toBe(0);
    });

    it('tükenmiş parti (qtyOnHand 0) atlanır', () => {
      const lots = [lot('l-0', 'BOS', 0), lot('l-1', 'DOLU', 1)];
      const { allocations } = allocateByPolicy(lots, 1, 'fifo');
      expect(allocations).toEqual([{ lotId: 'l-1', lotCode: 'DOLU', qty: 1, blockReason: null }]);
    });

    it('seçilebilir stok yetersizse shortfall raporlanır (INSUFFICIENT girdisi)', () => {
      const lots = [lot('l-1', 'A', 2)];
      const { allocations, shortfall } = allocateByPolicy(lots, 5, 'nearest_expiry');
      expect(allocations).toHaveLength(1);
      expect(allocations[0]!.qty).toBe(2);
      expect(shortfall).toBe(3);
    });

    it('manual politika otomatik tahsis yapmaz — kullanıcı seçimi beklenir', () => {
      const lots = [lot('l-1', 'A', 10)];
      const { allocations, shortfall } = allocateByPolicy(lots, 2, 'manual');
      expect(allocations).toHaveLength(0);
      expect(shortfall).toBe(2);
    });

    it('geçmiş zaman kesitiyle değerlendirme (at parametresi) çalışır', () => {
      const lots = [lot('l-1', 'A', 5, { expiresAt: new Date('2026-03-10T00:00:00Z') })];
      const before = allocateByPolicy(lots, 1, 'fifo', new Date('2026-03-01T00:00:00Z'));
      const after = allocateByPolicy(lots, 1, 'fifo', new Date('2026-04-01T00:00:00Z'));
      expect(before.allocations).toHaveLength(1);
      expect(after.allocations).toHaveLength(0);
      expect(after.shortfall).toBe(1);
    });

    it('0 ihtiyaç boş tahsis döner', () => {
      const { allocations, shortfall } = allocateByPolicy([lot('l-1', 'A', 5)], 0, 'fifo');
      expect(allocations).toHaveLength(0);
      expect(shortfall).toBe(0);
    });
  });

  describe('ücret satırları', () => {
    it('toChargeLine: qty × unitPrice − discount + tax net tutar', () => {
      const line = toChargeLine({
        description: 'Kuduz Asısı',
        qty: 2,
        unitPrice: 520,
        discount: 40,
        tax: 0,
      });
      expect(line.total).toBe(1000);
      expect(line.taxAmount).toBe(0);
    });

    it('toChargeLine: 2 ondalık yuvarlama kuruş kaymasız', () => {
      const line = toChargeLine({ description: 'x', qty: 3, unitPrice: 33.335, discount: 0, tax: 0 });
      expect(line.total).toBe(100.01);
    });

    it('sumChargeTotals: satır toplamlarını netleştirir', () => {
      const total = sumChargeTotals([{ total: 450.0 }, { total: 1000.0 }, { total: -450.0 }]);
      expect(total).toBe(1000);
    });

    it('buildReversalChargeLines: orijinalin işaretli tersi, açıklama işaretli', () => {
      const rev = buildReversalChargeLines([
        { description: 'Kuduz Asısı', qty: 1, unitPrice: 520, taxAmount: 0, total: 520 },
        { description: 'Eldiven', qty: 2, unitPrice: 85, taxAmount: 10, total: 180 },
      ]);
      expect(rev[0]).toEqual({
        description: 'İptal — Kuduz Asısı',
        qty: -1,
        unitPrice: 520,
        taxAmount: -0,
        total: -520,
      });
      expect(rev[1]!.qty).toBe(-2);
      expect(rev[1]!.taxAmount).toBe(-10);
      expect(sumChargeTotals([...rev])).toBe(-700);
    });
  });

  describe('decideIdempotency', () => {
    it('draft kayıt PROCEED', () => {
      expect(decideIdempotency({ status: 'draft', idempotencyKey: null }, 'k-1')).toBe('PROCEED');
    });

    it('finalized + aynı anahtar → REPLAY (mobil tekrarı duplicate yaratmaz)', () => {
      expect(
        decideIdempotency({ status: 'finalized', idempotencyKey: 'k-1' }, 'k-1'),
      ).toBe('REPLAY');
    });

    it('finalized + farklı anahtar → CONFLICT', () => {
      expect(
        decideIdempotency({ status: 'finalized', idempotencyKey: 'k-1' }, 'k-2'),
      ).toBe('CONFLICT');
    });

    it('finalized + anahtar yok → CONFLICT', () => {
      expect(decideIdempotency({ status: 'finalized', idempotencyKey: 'k-1' }, null)).toBe(
        'CONFLICT',
      );
    });
  });

  describe('yardımcılar', () => {
    it('normalizePolicy bilinmeyeni fifo yapar', () => {
      expect(normalizePolicy('fifo')).toBe('fifo');
      expect(normalizePolicy('nearest_expiry')).toBe('nearest_expiry');
      expect(normalizePolicy('manual')).toBe('manual');
      expect(normalizePolicy('bilinmeyen')).toBe('fifo');
    });

    it('round3 ve round2 Decimal hassasiyetiyle yuvarlar', () => {
      expect(round3(1.0005)).toBe(1.001);
      expect(round3(0.1 + 0.2)).toBe(0.3);
      expect(round2(10.005)).toBe(10.01);
    });
  });
});
