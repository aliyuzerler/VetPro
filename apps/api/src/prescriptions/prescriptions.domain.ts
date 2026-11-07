/**
 * Reçete alan mantığı — saf fonksiyonlar (Faz 10).
 *
 * Doz yardımcısı aritmetiği, imza kapısı ve reçete numarası üretimi burada;
 * NestJS/Prisma bağımlılığı yoktur (birim testlenebilir).
 *
 * Kabul kriteri bağlamı:
 * - Doz yardımcısı yalnızca aritmetik öneri üretir: veterinerin girdiği
 *   ağırlık ve mg/kg ile hesaplar; formül ve birimler sonucun parçası olarak
 *   döner (görünürlük). Hiçbir ilaç/doz önerisi otomatik üretilmez —
 *   mg/kg değeri veri tabanından önerilmez, veteriner girişidir.
 * - Önerinin satıra kesinleşmesi için ayrıca açık veteriner onayı gerekir;
 *   onaysız doz satırı imzalamayı bloklar.
 */

export const PRESCRIPTION_ERROR_CODES = {
  NOT_FOUND: 'PRESCRIPTION_NOT_FOUND',
  SIGNED: 'PRESCRIPTION_SIGNED',
  VOIDED: 'PRESCRIPTION_VOIDED',
  EMPTY: 'PRESCRIPTION_EMPTY',
  DOSE_NOT_APPROVED: 'DOSE_NOT_APPROVED',
  LINE_NOT_FOUND: 'PRESCRIPTION_LINE_NOT_FOUND',
  LINE_NOT_DISPENSABLE: 'PRESCRIPTION_LINE_NOT_DISPENSABLE',
  DUPLICATE_CODE: 'PRESCRIPTION_DUPLICATE_CODE',
  PATIENT_MISMATCH: 'PRESCRIPTION_PATIENT_MISMATCH',
} as const;

/** Uygulama formu kataloğu — klinikçe düzenlenebilir serbest metin için 'diger'. */
export const PRESCRIPTION_FORMS = [
  'tablet',
  'sirup',
  'enjeksiyon',
  'merhem',
  'damla',
  'diger',
] as const;

/** Uygulama yolu kataloğu. */
export const PRESCRIPTION_ROUTES = [
  'oral',
  'deri_alti',
  'kas_ici',
  'damar_ici',
  'topikal',
  'diger',
] as const;

export interface DoseHelperInput {
  weightKg: number;
  mgPerKg: number;
  /** Günde kaç kez uygulanır — null/0 ise günlük toplam döndürülmez. */
  frequencyPerDay?: number | null;
  /** Kaç gün sürer — günlük doz olmadan kurs toplamı hesaplanamaz. */
  durationDays?: number | null;
}

export interface DoseHelperResult {
  /** Görünür formül metni — örn. '20 kg × 10 mg/kg'. */
  formula: string;
  /** Tek uygulama dozu (mg). */
  singleDose: number;
  doseUnit: 'mg';
  dailyDose: number | null;
  courseTotal: number | null;
  inputs: {
    weightKg: number;
    mgPerKg: number;
    frequencyPerDay: number | null;
    durationDays: number | null;
  };
}

const round3 = (value: number): number => Math.round((value + Number.EPSILON) * 1000) / 1000;

/** Doz yardımcısı — saf aritmetik: ağırlık × mg/kg (+ sıklık/süre türevleri). */
export function computeDoseSuggestion(input: DoseHelperInput): DoseHelperResult {
  const weightKg = round3(input.weightKg);
  const mgPerKg = round3(input.mgPerKg);
  const frequencyPerDay =
    input.frequencyPerDay != null &&
    Number.isFinite(input.frequencyPerDay) &&
    input.frequencyPerDay > 0
      ? Math.trunc(input.frequencyPerDay)
      : null;
  const durationDays =
    input.durationDays != null && Number.isFinite(input.durationDays) && input.durationDays > 0
      ? Math.trunc(input.durationDays)
      : null;
  const singleDose = round3(weightKg * mgPerKg);
  const dailyDose = frequencyPerDay != null ? round3(singleDose * frequencyPerDay) : null;
  const courseTotal =
    dailyDose != null && durationDays != null ? round3(dailyDose * durationDays) : null;
  return {
    formula: `${weightKg} kg × ${mgPerKg} mg/kg`,
    singleDose,
    doseUnit: 'mg',
    dailyDose,
    courseTotal,
    inputs: { weightKg, mgPerKg, frequencyPerDay, durationDays },
  };
}

/** İmza kapısı girdisi — doz önerisi içeren satırların onay durumunu taşır. */
export interface SignableLine {
  id: string;
  doseCalcSuggested: number | null;
  doseApproved: boolean;
}

export interface SignGate {
  ok: boolean;
  unapprovedLineIds: string[];
}

/**
 * İmza kapısı: doz önerisi (doseCalcSuggested) taşıyan her satır için açık
 * veteriner onayı (doseApproved) zorunludur. Onaylanmamış satır kimlikleri
 * dönülür — 409 DOSE_NOT_APPROVED yanıtı bu kimliklerle üretilir.
 */
export function canSignPrescription(lines: SignableLine[]): SignGate {
  const unapprovedLineIds = lines
    .filter((line) => line.doseCalcSuggested != null && !line.doseApproved)
    .map((line) => line.id);
  return { ok: unapprovedLineIds.length === 0, unapprovedLineIds };
}

/** Reçete numarası üretimi: 'REC-0001' biçiminde, son kodun ardılı. */
export function nextPrescriptionCode(lastCode: string | null | undefined): string {
  if (!lastCode) return 'REC-0001';
  const parsed = Number.parseInt(lastCode.replace(/^REC-/, ''), 10);
  const seq = Number.isFinite(parsed) ? parsed : 0;
  return `REC-${String(seq + 1).padStart(4, '0')}`;
}
