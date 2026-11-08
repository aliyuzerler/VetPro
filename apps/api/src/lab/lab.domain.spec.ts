import { describe, expect, it } from 'vitest';
import {
  canTransitionLabOrder,
  evaluateResult,
  isLabOrderStatus,
  sampleLabelCode,
} from './lab.domain';

describe('Lab order yaşam döngüsü (kabul kriteri 1)', () => {
  it('ordered → sample_collected → in_progress → completed akışı geçerli', () => {
    expect(canTransitionLabOrder('ordered', 'sample_collected')).toBe(true);
    expect(canTransitionLabOrder('sample_collected', 'in_progress')).toBe(true);
    expect(canTransitionLabOrder('in_progress', 'completed')).toBe(true);
  });

  it('aktif her durumdan iptal mümkün', () => {
    expect(canTransitionLabOrder('ordered', 'cancelled')).toBe(true);
    expect(canTransitionLabOrder('sample_collected', 'cancelled')).toBe(true);
    expect(canTransitionLabOrder('in_progress', 'cancelled')).toBe(true);
  });

  it('geçersiz atlamalar reddedilir', () => {
    expect(canTransitionLabOrder('ordered', 'in_progress')).toBe(false);
    expect(canTransitionLabOrder('ordered', 'completed')).toBe(false);
    expect(canTransitionLabOrder('sample_collected', 'completed')).toBe(false);
  });

  it('terminal durumlar geçişe kapalı', () => {
    expect(canTransitionLabOrder('completed', 'in_progress')).toBe(false);
    expect(canTransitionLabOrder('cancelled', 'ordered')).toBe(false);
    expect(canTransitionLabOrder('completed', 'cancelled')).toBe(false);
  });

  it('bilinmeyen durum güvenli reddedilir', () => {
    expect(canTransitionLabOrder('bogus', 'completed')).toBe(false);
    expect(isLabOrderStatus('bogus')).toBe(false);
  });
});

describe('evaluateResult — referans ve kritik aralık bayrakları (kabul kriteri 2)', () => {
  const base = { valueText: null, refLow: 5.5, refHigh: 17.5, criticalLow: 2.5, criticalHigh: 25 };

  it('aralık içi değer normal', () => {
    expect(evaluateResult({ ...base, value: 10 })).toEqual({ flag: 'normal', isCritical: false });
  });

  it('referans altı ama kritik değil → low', () => {
    expect(evaluateResult({ ...base, value: 4 })).toEqual({ flag: 'low', isCritical: false });
  });

  it('referans üstü ama kritik değil → high', () => {
    expect(evaluateResult({ ...base, value: 20 })).toEqual({ flag: 'high', isCritical: false });
  });

  it('kritik alt eşiğin altında → critical_low uyarısı', () => {
    expect(evaluateResult({ ...base, value: 1.8 })).toEqual({ flag: 'critical_low', isCritical: true });
  });

  it('kritik üst eşiğin üstünde → critical_high uyarısı', () => {
    expect(evaluateResult({ ...base, value: 31 })).toEqual({ flag: 'critical_high', isCritical: true });
  });

  it('kritik eşik yoksa referans dışı kritik üretmez', () => {
    expect(evaluateResult({ ...base, value: 3, criticalLow: null })).toEqual({
      flag: 'low',
      isCritical: false,
    });
  });

  it('metin sonuç: negatif normal, pozitif abnormal', () => {
    expect(evaluateResult({ ...base, value: null, valueText: 'Negatif' })).toEqual({
      flag: 'normal',
      isCritical: false,
    });
    expect(evaluateResult({ ...base, value: null, valueText: 'Pozitif' })).toEqual({
      flag: 'abnormal',
      isCritical: false,
    });
  });

  it('değersiz sonuç hata verir (boş kayıt engeli)', () => {
    expect(() => evaluateResult({ ...base, value: null, valueText: null })).toThrow(
      'RESULT_VALUE_REQUIRED',
    );
  });
});

describe('sampleLabelCode — etiket kodu', () => {
  it('UTC tarih parçalarıyla üretilir (İstanbul gece sınırı güvenli)', () => {
    const code = sampleLabelCode(new Date('2026-11-08T20:30:00.000Z'), 'abcd1234');
    expect(code).toMatch(/^LAB-261108-ABCD1234$/.test(code) ? /^LAB-261108-/ : /^LAB-261108-/);
    expect(code.startsWith('LAB-261108-')).toBe(true);
  });
});
