/**
 * Faz 11 — Laboratuvar alan mantığı: sipariş yaşam döngüsü, sonuç bayrakları
 * ve numune etiket kodu. Saf fonksiyonlar; API katmanı yalnızca orchestration.
 */

export const LAB_ORDER_STATUSES = [
  'ordered',
  'sample_collected',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type LabOrderStatus = (typeof LAB_ORDER_STATUSES)[number];

/**
 * Kabul kriteri: Lab order status lifecycle doğru olmalı.
 * Sipariş numune toplanmadan başlanamaz; sonuç yalnız analiz sürerken girilir;
 * terminal durumlardan çıkış yoktur; iptal yalnız aktif durumlarda mümkündür.
 */
export const LAB_ORDER_TRANSITIONS: Record<LabOrderStatus, readonly LabOrderStatus[]> = {
  ordered: ['sample_collected', 'cancelled'],
  sample_collected: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function isLabOrderStatus(value: string): value is LabOrderStatus {
  return (LAB_ORDER_STATUSES as readonly string[]).includes(value);
}

export function canTransitionLabOrder(from: string, to: string): boolean {
  if (!isLabOrderStatus(from) || !isLabOrderStatus(to)) return false;
  return LAB_ORDER_TRANSITIONS[from].includes(to);
}

export const LAB_RESULT_FLAGS = [
  'normal',
  'low',
  'high',
  'critical_low',
  'critical_high',
  'abnormal',
] as const;
export type LabResultFlag = (typeof LAB_RESULT_FLAGS)[number];

export interface ResultRefRange {
  value: number | null;
  valueText: string | null;
  refLow: number | null;
  refHigh: number | null;
  criticalLow: number | null;
  criticalHigh: number | null;
}

export interface EvaluatedResult {
  flag: LabResultFlag;
  isCritical: boolean;
}

/**
 * Kabul kriteri: Kritik laboratuvar sonucu uyarı üretmeli.
 * Sayısal sonuç: kritik eşikler önceliklidir, sonra referans dışı, sonra normal.
 * Metin sonuç: 'negatif' değilse abnormal kabul edilir (kalitatif testlerde
 * referans aralığı katalogda yoktur). Değer boşsa sonuç girilemez.
 */
export function evaluateResult(input: ResultRefRange): EvaluatedResult {
  if (input.value === null && !input.valueText?.trim()) {
    throw new Error('RESULT_VALUE_REQUIRED');
  }
  if (input.value !== null) {
    const value = input.value;
    if (input.criticalLow !== null && value < input.criticalLow) {
      return { flag: 'critical_low', isCritical: true };
    }
    if (input.criticalHigh !== null && value > input.criticalHigh) {
      return { flag: 'critical_high', isCritical: true };
    }
    if (input.refLow !== null && value < input.refLow) return { flag: 'low', isCritical: false };
    if (input.refHigh !== null && value > input.refHigh) {
      return { flag: 'high', isCritical: false };
    }
    return { flag: 'normal', isCritical: false };
  }
  const text = input.valueText!.trim().toLowerCase();
  return { flag: text === 'negatif' ? 'normal' : 'abnormal', isCritical: false };
}

/**
 * Numune etiket kodu — LAB-YYMMDD-XXXX; tarih UTC parçalarından (İstanbul
 * gece yarısı sınırında determinizm — bkz. Faz 10 QA bulgusu).
 */
export function sampleLabelCode(now: Date, nonce: string): string {
  const y = now.getUTCFullYear().toString().slice(2);
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const suffix = nonce.replaceAll('-', '').slice(0, 4).toUpperCase();
  return `LAB-${y}${m}${d}-${suffix}`;
}
