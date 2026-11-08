/**
 * Faz 11 — Yatış alan mantığı: kennel çakışma kontrolü ve yatış durum
 * kuralları. Saf fonksiyonlar; çakışma penceresi [admittedAt, dischargedAt)
 * — taburcu olmayan yatış açık uçlu (∞) kabul edilir.
 */

export const HOSPITAL_STAY_STATUSES = ['admitted', 'transferred', 'discharged'] as const;
export type HospitalStayStatus = (typeof HOSPITAL_STAY_STATUSES)[number];

/** Aktif yatış = kennel işgal eden yatış (taburculuk ya da iptal yok). */
export function isActiveStayStatus(status: string): boolean {
  return status === 'admitted' || status === 'transferred';
}

export interface StayWindow {
  kennelId: string;
  id: string;
  admittedAt: Date;
  dischargedAt: Date | null;
}

/**
 * Kabul kriteri: kennel çakışması kontrol edilmeli.
 * Aday pencere [admittedAt, dischargedAt|null) ile aynı kenneldeki aktif
 * yatışlardan herhangi biri kesişiyorsa çakışma vardır. ownStayId transfer
 * kontrolünde kendini dışlar.
 */
export function findKennelConflict(
  candidate: { kennelId: string; admittedAt: Date; dischargedAt: Date | null },
  activeStays: StayWindow[],
  ownStayId?: string,
): StayWindow | null {
  const end = candidate.dischargedAt ?? null;
  for (const stay of activeStays) {
    if (stay.id === ownStayId) continue;
    if (stay.kennelId !== candidate.kennelId) continue;
    const stayEnd = stay.dischargedAt ?? null;
    // Klasik aralık kesişimi: start_a < end_b && start_b < end_a (null = ∞)
    const overlaps =
      candidate.admittedAt < (stayEnd ?? farFuture()) && stay.admittedAt < (end ?? farFuture());
    if (overlaps) return stay;
  }
  return null;
}

function farFuture(): Date {
  return new Date('2999-12-31T00:00:00.000Z');
}

/** Yatış içi gözlem doğrulaması — vital türünde en az bir ölçüm beklenir. */
export function validateObservation(kind: string, input: { tempC?: number | null; weightKg?: number | null; heartRate?: number | null; respRate?: number | null; notes?: string | null }): boolean {
  if (kind === 'note') return Boolean(input.notes?.trim());
  return (
    input.tempC != null ||
    input.weightKg != null ||
    input.heartRate != null ||
    input.respRate != null ||
    Boolean(input.notes?.trim())
  );
}
