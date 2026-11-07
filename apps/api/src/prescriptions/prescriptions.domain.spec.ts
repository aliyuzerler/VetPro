import { describe, expect, it } from 'vitest';
import {
  canSignPrescription,
  computeDoseSuggestion,
  nextPrescriptionCode,
} from './prescriptions.domain';

describe('computeDoseSuggestion — doz yardımcısı (kabul kriteri 2)', () => {
  it('ağırlık × mg/kg aritmetiğini uygular ve formülü görünür döndürür', () => {
    const result = computeDoseSuggestion({ weightKg: 20, mgPerKg: 10 });
    expect(result.formula).toBe('20 kg × 10 mg/kg');
    expect(result.singleDose).toBe(200);
    expect(result.doseUnit).toBe('mg');
    expect(result.dailyDose).toBeNull();
    expect(result.courseTotal).toBeNull();
  });

  it('sıklık ve süre verildiğinde günlük ve kurs toplamını türetir', () => {
    const result = computeDoseSuggestion({
      weightKg: 12.5,
      mgPerKg: 8,
      frequencyPerDay: 2,
      durationDays: 7,
    });
    expect(result.singleDose).toBe(100);
    expect(result.dailyDose).toBe(200);
    expect(result.courseTotal).toBe(1400);
    expect(result.inputs).toEqual({
      weightKg: 12.5,
      mgPerKg: 8,
      frequencyPerDay: 2,
      durationDays: 7,
    });
  });

  it('ondalık girdileri 3 haneye yuvarlar', () => {
    const result = computeDoseSuggestion({ weightKg: 4.1666, mgPerKg: 2.5 });
    expect(result.inputs.weightKg).toBe(4.167);
    expect(result.singleDose).toBe(10.418);
  });

  it('geçersiz sıklık/süre girdilerini yok sayar (0/negatif)', () => {
    const result = computeDoseSuggestion({
      weightKg: 10,
      mgPerKg: 5,
      frequencyPerDay: 0,
      durationDays: -3,
    });
    expect(result.dailyDose).toBeNull();
    expect(result.courseTotal).toBeNull();
  });
});

describe('canSignPrescription — imza kapısı (kabul kriteri 2)', () => {
  it('doz önerisi taşımayan satırlar onaysız imzayı bloklamaz', () => {
    const gate = canSignPrescription([
      { id: 'l1', doseCalcSuggested: null, doseApproved: false },
    ]);
    expect(gate.ok).toBe(true);
    expect(gate.unapprovedLineIds).toEqual([]);
  });

  it('onaysız doz önerisi imzalamayı bloklar ve satır kimliğini döndürür', () => {
    const gate = canSignPrescription([
      { id: 'l1', doseCalcSuggested: null, doseApproved: false },
      { id: 'l2', doseCalcSuggested: 200, doseApproved: false },
    ]);
    expect(gate.ok).toBe(false);
    expect(gate.unapprovedLineIds).toEqual(['l2']);
  });

  it('onaylı doz önerisi imzaya izin verir', () => {
    const gate = canSignPrescription([
      { id: 'l2', doseCalcSuggested: 200, doseApproved: true },
    ]);
    expect(gate.ok).toBe(true);
  });
});

describe('nextPrescriptionCode — reçete numarası', () => {
  it('kodsuz kliniğe ilk numarayı verir', () => {
    expect(nextPrescriptionCode(null)).toBe('REC-0001');
  });

  it('son kodun ardılını üretir', () => {
    expect(nextPrescriptionCode('REC-0007')).toBe('REC-0008');
    expect(nextPrescriptionCode('REC-9999')).toBe('REC-10000');
  });

  it('bozuk kodu 0 sayar', () => {
    expect(nextPrescriptionCode('REC-')).toBe('REC-0001');
  });
});
