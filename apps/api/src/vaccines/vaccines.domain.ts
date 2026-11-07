/**
 * Aşı alan mantığı — saf fonksiyonlar (Faz 10).
 *
 * Aşı takvimi klinik protokolüyle (VaccineProtocol) yapılandırılır: takvim
 * girdileri yalnızca kliniğin kendi protokol satırlarından türetilir — sabit
 * evrensel takvim yoktur (kabul kriteri 5).
 */

export const VACCINE_ERROR_CODES = {
  PROTOCOL_NOT_FOUND: 'VACCINE_PROTOCOL_NOT_FOUND',
  DUPLICATE_NAME: 'VACCINE_PROTOCOL_DUPLICATE_NAME',
  EVENT_NOT_FOUND: 'VACCINE_EVENT_NOT_FOUND',
  LOT_EXPIRED: 'LOT_EXPIRED',
  LOT_BLOCKED: 'LOT_BLOCKED',
  LOT_NOT_FOUND: 'VACCINE_LOT_NOT_FOUND',
  LOT_REQUIRED: 'VACCINE_LOT_REQUIRED',
  PATIENT_NOT_FOUND: 'VACCINE_PATIENT_NOT_FOUND',
  REMINDER_DUPLICATE: 'VACCINE_REMINDER_DUPLICATE',
  REMINDER_NOT_FOUND: 'VACCINE_REMINDER_NOT_FOUND',
  REMINDER_ALREADY_SENT: 'VACCINE_REMINDER_ALREADY_SENT',
} as const;

export const REMINDER_KINDS = ['booster_due', 'first_dose', 'custom'] as const;

export const DAY_MS = 86_400_000;

/** Gün sayısı ekleme — UTC tabanlı takvim aritmetiği. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Tarih bölümü (YYYY-MM-DD) — @db.Date alanları ve pencere karşılaştırmaları için. */
export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Gün başlangıcı (00:00 UTC). */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export interface ScheduleInput {
  /** Hasta doğum tarihi — ilk doz yaş hesabı için. */
  birthDate: Date | null;
  firstDoseAgeDays: number;
  boosterIntervalDays: number;
  /** Aynı protokol/ürün için kayıtlı son aşı. */
  lastAdministeredAt: Date | null;
  /** Bugün (karşılaştırma tabanı; testlerde sabitlenebilir). */
  today: Date;
}

export interface ScheduleEntry {
  dueAt: Date;
  basis: 'first_dose' | 'booster';
}

/**
 * Protokol takvim girdisi: son aşı varsa tekrar vadesi (son aşı + aralık),
 * yoksa ilk doz yaşı (doğum + firstDoseAgeDays). Protokolsüz hasta için
 * girdi üretilmez — evrensel varsayım yoktur.
 */
export function computeScheduleEntry(input: ScheduleInput): ScheduleEntry | null {
  if (input.lastAdministeredAt) {
    return {
      dueAt: addDays(input.lastAdministeredAt, input.boosterIntervalDays),
      basis: 'booster',
    };
  }
  if (input.birthDate) {
    return { dueAt: addDays(input.birthDate, input.firstDoseAgeDays), basis: 'first_dose' };
  }
  return null;
}

export type DueClass = 'overdue' | 'due_soon' | 'later';

/**
 * Vade sınıflandırması: gecikmiş (bugünden önce), yaklaşan (bugün..bugün+lead),
 * sonrası. leadDays protokolün reminderLeadDays'idir.
 */
export function classifyDue(dueAt: Date, today: Date, leadDays: number): DueClass {
  const todayKey = dateKey(today);
  const dueKey = dateKey(dueAt);
  if (dueKey < todayKey) return 'overdue';
  if (dueKey <= dateKey(addDays(today, Math.max(leadDays, 0)))) return 'due_soon';
  return 'later';
}

/** Aşı lotu uygulama için uygun mu? — doz hesabı dışında yalnız durum denetimi. */
export function vaccineLotIssue(
  lot: { status: string; expiresAt: Date | null },
  at: Date = new Date(),
): 'expired' | 'quarantined' | null {
  if (lot.status !== 'active') return 'quarantined';
  if (lot.expiresAt && lot.expiresAt.getTime() < at.getTime()) return 'expired';
  return null;
}
