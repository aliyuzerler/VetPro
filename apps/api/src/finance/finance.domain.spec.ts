import { describe, expect, it } from 'vitest';
import {
  autoAllocateFifo,
  buildStatement,
  chargeBalanceCents,
  chargeStatusAfterAllocation,
  closeSession,
  decidePaymentReplay,
  expectedCashCents,
  ownerBalanceCents,
  payableStatusAfterPayment,
  refundableCents,
  sumCents,
  validateExplicitAllocations,
  validatePayablePayment,
  validateRefund,
  type OpenChargeInput,
} from './finance.domain';

/**
 * Faz 09 alan mantığı birim testleri — kabul kriterlerinin saf çekirdeği:
 * kısmi ödeme/allocation bakiyesi, FIFO dağıtım, iade sınırı, kasa kapanış
 * farkı + açıklama zorunluluğu, idempotency kararı, cari ekstre ilişkisi,
 * Decimal (kuruş) hassasiyeti ve tedarikçi borcu kapatma.
 */

function charge(id: string, total: number, allocated: number, createdAt: Date): OpenChargeInput {
  return { id, totalCents: total, allocatedCents: allocated, createdAt };
}

describe('Faz 09 — bakiye hesabı', () => {
  it('ücret kalanı: total − dağıtılan (kuruş kaymasız)', () => {
    expect(chargeBalanceCents(45000, 20000)).toBe(25000);
    expect(chargeBalanceCents(45000, 45000)).toBe(0);
  });

  it('dağıtım ücreti aşarsa hata', () => {
    expect(() => chargeBalanceCents(45000, 46000)).toThrow();
  });

  it('0.1 + 0.2 kuruş kayması üretilmez (Decimal hassasiyeti)', () => {
    // 0.1 TL + 0.2 TL = 0.30 TL — number float toplamında 0.30000000000000004
    expect(sumCents(['0.1', '0.2'])).toBe(30);
    expect(chargeBalanceCents(30, sumCents(['0.1', '0.2']))).toBe(0);
  });

  it('sahip bakiyesi: ücret − tahsilat + iade', () => {
    expect(
      ownerBalanceCents({ chargeTotalCents: 90000, paymentTotalCents: 40000, refundTotalCents: 0 }),
    ).toBe(50000);
    expect(
      ownerBalanceCents({ chargeTotalCents: 90000, paymentTotalCents: 90000, refundTotalCents: 25000 }),
    ).toBe(25000);
  });

  it('dağıtım sonrası ücret durumu: paid / partial', () => {
    expect(chargeStatusAfterAllocation(45000, 45000)).toBe('paid');
    expect(chargeStatusAfterAllocation(45000, 20000)).toBe('partial');
  });
});

describe('Faz 09 — dağıtım planı', () => {
  const charges: OpenChargeInput[] = [
    charge('eski', 45000, 0, new Date('2026-11-01T10:00:00Z')),
    charge('yeni', 90000, 0, new Date('2026-11-05T10:00:00Z')),
  ];

  it('otomatik FIFO: en eski ücretten başlar', () => {
    const result = autoAllocateFifo(50000, charges);
    expect(result.plan).toEqual([
      { chargeId: 'eski', amountCents: 45000 },
      { chargeId: 'yeni', amountCents: 5000 },
    ]);
    expect(result.unallocatedCents).toBe(0);
  });

  it('kısmi ödeme: tutar tükenir, kalan ücret bakiyesi açık kalır', () => {
    const result = autoAllocateFifo(20000, charges);
    expect(result.plan).toEqual([{ chargeId: 'eski', amountCents: 20000 }]);
    expect(result.unallocatedCents).toBe(0);
  });

  it('tutar tüm ücretleri aşarsa fark ileri kredi kalır', () => {
    const result = autoAllocateFifo(150000, charges);
    expect(result.unallocatedCents).toBe(15000);
  });

  it('kapalı (paid) ücretler atlanır', () => {
    const paid = charge('kapali', 45000, 45000, new Date('2026-10-01T10:00:00Z'));
    const result = autoAllocateFifo(10000, [paid, ...charges]);
    expect(result.plan[0]?.chargeId).toBe('eski');
  });

  it('elle dağıtım: ücret bakiyesi aşılırsa reddedilir', () => {
    expect(() =>
      validateExplicitAllocations(100000, [{ chargeId: 'eski', amountCents: 50000 }], charges),
    ).toThrow();
  });

  it('elle dağıtım: tahsilatı aşan plan reddedilir', () => {
    expect(() =>
      validateExplicitAllocations(
        30000,
        [
          { chargeId: 'eski', amountCents: 20000 },
          { chargeId: 'yeni', amountCents: 20000 },
        ],
        charges,
      ),
    ).toThrow();
  });

  it('elle dağıtım: aynı ücrete ikinci dağıtım reddedilir', () => {
    expect(() =>
      validateExplicitAllocations(
        50000,
        [
          { chargeId: 'eski', amountCents: 20000 },
          { chargeId: 'eski', amountCents: 20000 },
        ],
        charges,
      ),
    ).toThrow();
  });

  it('elle dağıtım: geçerli plan + kalan ileri kredi', () => {
    const result = validateExplicitAllocations(
      60000,
      [{ chargeId: 'yeni', amountCents: 30000 }],
      charges,
    );
    expect(result.plan).toEqual([{ chargeId: 'yeni', amountCents: 30000 }]);
    expect(result.unallocatedCents).toBe(30000);
  });
});

describe('Faz 09 — iade', () => {
  it('iade edilebilir tutar: tahsilat − toplam iade', () => {
    expect(refundableCents(50000, 20000)).toBe(30000);
    expect(refundableCents(50000, 50000)).toBe(0);
  });

  it('iade kalanı aşarsa reddedilir', () => {
    expect(() => validateRefund(50000, 40000, 20000, 'yanlış tahsilat')).toThrow();
  });

  it('gerekçe zorunlu', () => {
    expect(() => validateRefund(50000, 0, 10000, '  ')).toThrow();
  });

  it('geçerli kısmi iade kabul edilir', () => {
    expect(() => validateRefund(50000, 20000, 25000, 'hizmet iptali')).not.toThrow();
  });
});

describe('Faz 09 — kasa oturumu', () => {
  it('beklenen tutar: açılış + giriş − çıkış', () => {
    expect(expectedCashCents({ openingFloatCents: 50000, inCents: 30000, outCents: 10000 })).toBe(70000);
  });

  it('kapanış: fark hesaplanır (sayım − beklenen)', () => {
    const result = closeSession({
      openingFloatCents: 50000,
      inCents: 45000,
      outCents: 0,
      countedCents: 94000,
      differenceNote: '1 TL bozuk para eksiği',
    });
    expect(result.expectedCents).toBe(95000);
    expect(result.differenceCents).toBe(-1000);
  });

  it('fark ≠ 0 iken açıklama zorunlu (kabul kriteri)', () => {
    expect(() =>
      closeSession({
        openingFloatCents: 50000,
        inCents: 45000,
        outCents: 0,
        countedCents: 94000,
        differenceNote: '   ',
      }),
    ).toThrow();
  });

  it('fark = 0 iken açıklama opsiyoneldir', () => {
    const result = closeSession({
      openingFloatCents: 50000,
      inCents: 45000,
      outCents: 0,
      countedCents: 95000,
      differenceNote: '',
    });
    expect(result.differenceCents).toBe(0);
  });
});

describe('Faz 09 — idempotency kararı', () => {
  it('aynı anahtar REPLAY döner (mobil retry)', () => {
    const decision = decidePaymentReplay(
      { idempotencyKey: 'key-1', id: 'p1' },
      'key-1',
      (payment) => `replay:${payment.id}`,
    );
    expect(decision).toEqual({ decision: 'replay', result: 'replay:p1' });
  });

  it('kayıtsız istek PROCEED', () => {
    expect(decidePaymentReplay(null, 'key-1', () => 'x')).toEqual({ decision: 'proceed' });
  });

  it('anahtarsız tekrar (elle tahsilat) PROCEED', () => {
    expect(decidePaymentReplay({ idempotencyKey: null, id: 'p2' }, undefined, () => 'x')).toEqual({
      decision: 'proceed',
    });
  });
});

describe('Faz 09 — cari ekstre', () => {
  it('ücret(+), tahsilat(−), iade(+) ilişkisi ve koşan bakiye (kabul kriteri)', () => {
    const result = buildStatement([
      {
        id: 'c1',
        kind: 'charge',
        amount: '450.00',
        occurredAt: new Date('2026-11-01T09:00:00Z'),
        description: 'Genel muayene',
      },
      {
        id: 'p1',
        kind: 'payment',
        amount: '200.00',
        occurredAt: new Date('2026-11-02T09:00:00Z'),
        description: 'Tahsilat (cash)',
      },
      {
        id: 'c2',
        kind: 'charge',
        amount: '150.00',
        occurredAt: new Date('2026-11-03T09:00:00Z'),
        description: 'Aşı',
      },
      {
        id: 'r1',
        kind: 'refund',
        amount: '50.00',
        occurredAt: new Date('2026-11-04T09:00:00Z'),
        description: 'İade (cash) — hizmet iptali',
      },
    ]);
    expect(result.rows.map((row) => row.direction)).toEqual(['+', '-', '+', '+']);
    expect(result.rows.map((row) => row.runningBalance)).toEqual(['450.00', '250.00', '400.00', '450.00']);
    expect(result.closingBalance).toBe('450.00');
  });

  it('satırlar kronolojik sıralanır (girdi sırasından bağımsız)', () => {
    const result = buildStatement([
      {
        id: 'p1',
        kind: 'payment',
        amount: '100.00',
        occurredAt: new Date('2026-11-05T09:00:00Z'),
        description: '',
      },
      {
        id: 'c1',
        kind: 'charge',
        amount: '100.00',
        occurredAt: new Date('2026-11-01T09:00:00Z'),
        description: '',
      },
    ]);
    expect(result.rows[0]?.kind).toBe('charge');
    expect(result.closingBalance).toBe('0.00');
  });
});

describe('Faz 09 — tedarikçi borcu', () => {
  it('kısmi ödeme sonrası durum open kalır', () => {
    expect(payableStatusAfterPayment(100000, 40000)).toBe('open');
  });

  it('bakiye kapanınca settled olur', () => {
    expect(payableStatusAfterPayment(100000, 100000)).toBe('settled');
    expect(payableStatusAfterPayment(100000, 120000)).toBe('settled');
  });

  it('kapalı borca tekrar ödeme reddedilir', () => {
    expect(() => validatePayablePayment('settled', 100000, 100000, 1000)).toThrow();
  });

  it('ödeme kalanı aşarsa reddedilir', () => {
    expect(() => validatePayablePayment('open', 100000, 80000, 30000)).toThrow();
  });

  it('geçerli kısmi ödeme kabul edilir', () => {
    expect(() => validatePayablePayment('open', 100000, 40000, 60000)).not.toThrow();
  });
});
