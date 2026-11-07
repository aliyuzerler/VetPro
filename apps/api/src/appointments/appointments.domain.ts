/**
 * Faz 05 — Randevu alan mantığı (saf fonksiyonlar; birim testlidir).
 *
 * Saat dilimi: klinik saat dilimi (Clinic.timezone, varsayılan Europe/Istanbul)
 * UTC instants olarak saklanır; gün/hafta sınırları ve çalışma saatleri KLINİK
 * yerel saatinde hesaplanır. Europe/Istanbul 2016'dan beri sabit UTC+03'tür,
 * ancak Intl tabanlı yardımcılar genel DST'li bölgeleri de doğru işler.
 *
 * Durum makinesi: ileri yönlü — scheduled → arrived → waiting → in_consultation
 * → completed; her aktif aşamadan cancelled/no_show çıkışı mümkündür. Geçersiz
 * sırada geçiş alan seviyesinde reddedilir (kabul kriteri).
 */

export const APPOINTMENT_STATUSES = [
  'scheduled',
  'arrived',
  'waiting',
  'in_consultation',
  'completed',
  'no_show',
  'cancelled',
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Çakışma kontrolünde sayılan aktif randevu durumları (kabul kriteri 1). */
export const ACTIVE_STATUSES: readonly AppointmentStatus[] = [
  'scheduled',
  'arrived',
  'waiting',
  'in_consultation',
];

/** İleri yönlü durum makinesi — anahtar mevcut durum, değer izinli sonraki durumlar. */
export const ALLOWED_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  scheduled: ['arrived', 'cancelled', 'no_show'],
  arrived: ['waiting', 'in_consultation', 'cancelled', 'no_show'],
  waiting: ['in_consultation', 'cancelled', 'no_show'],
  in_consultation: ['completed'],
  completed: [],
  no_show: [],
  cancelled: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: AppointmentStatus,
    public readonly to: AppointmentStatus,
  ) {
    super(`Geçersiz durum geçişi: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

/** Geçişi doğrular; geçersizse InvalidTransitionError fırlatır. */
export function assertTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): AppointmentStatus {
  if (from === to) {
    throw new InvalidTransitionError(from, to);
  }
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
  return to;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type WallClock = {
  /** 0 = Pazar ... 6 = Cumartesi (ScheduleBlock.weekday ile aynı konvansiyon) */
  weekday: number;
  /** Gün içi dakika: 09:30 → 570 */
  minutes: number;
  /** Yerel takvim günü: 'YYYY-MM-DD' (gece yarısı atlama kontrolü için) */
  dayISO: string;
};

/**
 * UTC instant'ı hedef saat dilimindeki duvar saati parçalarına çevirir.
 * Intl tabanlıdır (Node 22 full-ICU); hourCycle 'h23' ile gece yarısı 24:00
 * değil 00:00 döner.
 */
export function wallClock(date: Date, timeZone: string): WallClock {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  const weekday = WEEKDAY_INDEX[value('weekday')] ?? -1;
  const hour = Number(value('hour'));
  const minute = Number(value('minute'));
  const year = value('year');
  const month = value('month');
  const day = value('day');
  if (weekday < 0 || Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error(`Saat dilimi çözümlenemedi: ${timeZone}`);
  }
  return {
    weekday,
    minutes: hour * 60 + minute,
    dayISO: `${year}-${month}-${day}`,
  };
}

export type ScheduleBlockLike = {
  id: string;
  /** 'working' | 'blocked' */
  kind: string;
  staffId: string | null;
  weekday: number;
  startMin: number;
  endMin: number;
  note: string | null;
};

export type SchedulePolicyVerdict =
  | { verdict: 'ok' }
  | { verdict: 'blocked'; blockId: string; note: string | null }
  | { verdict: 'outside' };

/**
 * Çalışma saati politikası (kabul kriteri 2):
 * - personelin 'blocked' bloğu (veya şube düzeyi) randevu aralığıyla kesişiyorsa
 *   → 'blocked' (hard engel; override edilmez)
 * - personelin herhangi bir günü için 'working' bloğu tanımlıysa o bloklar esastır;
 *   tanımlı gün yoksa şube düzeyi 'working' bloklarına düşer; şube düzeyi de yoksa
 *   politika tanımsızdır → 'ok' (serbest rezervasyon)
 * - politika aktifken randevu aralığı çalışma bloğu dışındaysa → 'outside'
 *   (appointment.override yetkisiyle gerekçeli override edilebilir)
 * - randevu yerel gece yarısını aşarsa → 'outside' (günler arası randevu desteklenmez)
 */
export function evaluateSchedulePolicy(input: {
  blocks: ScheduleBlockLike[];
  staffId: string;
  start: Date;
  end: Date;
  timeZone: string;
}): SchedulePolicyVerdict {
  const startWall = wallClock(input.start, input.timeZone);
  const endWall = wallClock(input.end, input.timeZone);
  if (startWall.dayISO !== endWall.dayISO) {
    return { verdict: 'outside' };
  }
  const staffBlocked = input.blocks.filter(
    (block) =>
      block.kind === 'blocked' &&
      block.weekday === startWall.weekday &&
      (block.staffId === input.staffId || block.staffId === null),
  );
  for (const block of staffBlocked) {
    if (startWall.minutes < block.endMin && endWall.minutes > block.startMin) {
      return { verdict: 'blocked', blockId: block.id, note: block.note };
    }
  }

  const staffWorking = input.blocks.filter(
    (block) => block.kind === 'working' && block.staffId === input.staffId,
  );
  const branchWorking = input.blocks.filter(
    (block) => block.kind === 'working' && block.staffId === null,
  );
  const workingPool = staffWorking.length > 0 ? staffWorking : branchWorking;
  if (workingPool.length === 0) {
    return { verdict: 'ok' }; // Politika tanımlı değil — kısıt yok
  }
  const dayBlocks = workingPool.filter((block) => block.weekday === startWall.weekday);
  const covering = dayBlocks.find(
    (block) => startWall.minutes >= block.startMin && endWall.minutes <= block.endMin,
  );
  if (!covering) {
    return { verdict: 'outside' };
  }
  return { verdict: 'ok' };
}

/**
 * Çakışma taraması (kabul kriteri 1): aynı hekim VEYA aynı oda için aktif
 * randevulardan biri çakışıyorsa döner. Hekim çakışması şubeler arası sayılır
 * (bir hekim iki yerde olamaz); oda çakışması yalnızca randevuya oda atanmışsa.
 */
export function pickConflictingAppointment<
  T extends { staffId: string | null; roomId: string | null },
>(candidates: T[], input: { staffId: string; roomId?: string | null }): T | undefined {
  return candidates.find(
    (candidate) =>
      candidate.staffId === input.staffId ||
      (input.roomId !== undefined &&
        input.roomId !== null &&
        candidate.roomId === input.roomId),
  );
}

/**
 * Klinik yerel takvim gününün UTC aralığı: [gün başlangıcı, gün sonu).
 * Gun başlangıcı önce öğle anının ofsetiyle hesaplanır (DST'li bölgelerde de
 * doğru); Europe/Istanbul (sabit +03) için 00:00Z-180min = önceki gün 21:00Z.
 */
export function localDayRange(dayISO: string, timeZone: string): { start: Date; end: Date } {
  const noonUtc = new Date(`${dayISO}T12:00:00Z`);
  const wall = wallClock(noonUtc, timeZone);
  const offsetMinutes = wall.minutes - 12 * 60;
  const start = new Date(Date.parse(`${dayISO}T00:00:00Z`) - offsetMinutes * 60_000);
  const end = new Date(start.getTime() + 24 * 60 * 60_000);
  return { start, end };
}

/** Şu anki takvim günü (klinik yerel saatinde) — 'YYYY-MM-DD'. */
export function todayISO(timeZone: string, now: Date = new Date()): string {
  return wallClock(now, timeZone).dayISO;
}
