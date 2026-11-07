import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  evaluateSchedulePolicy,
  InvalidTransitionError,
  localDayRange,
  pickConflictingAppointment,
  wallClock,
  type ScheduleBlockLike,
} from './appointments.domain';

/**
 * Faz 05 alan mantığı birim testleri. Saat dilimi kabul kriteri (Europe/Istanbul)
 * sabit instant'larla doğrulanır — sistem saatine bağımlılık yoktur.
 */

/** Europe/Istanbul sabit UTC+03 → 2026-11-09 09:00 yerel = 06:00Z (Pazartesi). */
const TZ = 'Europe/Istanbul';

describe('wallClock — Europe/Istanbul saat dilimi çözümlemesi', () => {
  it('2026-11-09T06:00Z → Pazartesi 09:00 (UTC+3)', () => {
    const wall = wallClock(new Date('2026-11-09T06:00:00Z'), TZ);
    expect(wall.weekday).toBe(1);
    expect(wall.minutes).toBe(9 * 60);
    expect(wall.dayISO).toBe('2026-11-09');
  });

  it('2026-11-08T20:59Z → Pazar 23:59', () => {
    const wall = wallClock(new Date('2026-11-08T20:59:00Z'), TZ);
    expect(wall.weekday).toBe(0);
    expect(wall.minutes).toBe(23 * 60 + 59);
    expect(wall.dayISO).toBe('2026-11-08');
  });

  it('2026-11-08T21:00Z → gün sınırı atlar: Pazartesi 00:00', () => {
    const wall = wallClock(new Date('2026-11-08T21:00:00Z'), TZ);
    expect(wall.weekday).toBe(1);
    expect(wall.minutes).toBe(0);
    expect(wall.dayISO).toBe('2026-11-09');
  });

  it('gece yarısı hourCycle h23 ile 24:00 değil 00:00 döner', () => {
    const wall = wallClock(new Date('2026-11-09T21:00:00Z'), TZ);
    expect(wall.minutes).toBe(0);
  });

  it('Cuma akşamı 18:00 → 1080 dakika', () => {
    // 2026-11-13 Cuma; 18:00 yerel = 15:00Z
    const wall = wallClock(new Date('2026-11-13T15:00:00Z'), TZ);
    expect(wall.weekday).toBe(5);
    expect(wall.minutes).toBe(1080);
  });
});

describe('localDayRange — yerel günün UTC aralığı', () => {
  it('2026-11-09 gün aralığı 21:00Z (önceki gün) — 21:00Z (aynı gün)', () => {
    const { start, end } = localDayRange('2026-11-09', TZ);
    expect(start.toISOString()).toBe('2026-11-08T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-09T21:00:00.000Z');
  });

  it('gün aralığı içindeki randevu yerel günü eşleşir', () => {
    const { start, end } = localDayRange('2026-11-09', TZ);
    const inside = new Date('2026-11-09T06:00:00Z'); // yerel 09:00
    expect(inside >= start && inside < end).toBe(true);
  });
});

describe('evaluateSchedulePolicy — çalışma saati politikası', () => {
  // Hekim çalışma saatleri: Pazartesi 09:00–18:00 (540–1080)
  const blocks: ScheduleBlockLike[] = [
    { id: 'b1', kind: 'working', staffId: 'vet', weekday: 1, startMin: 540, endMin: 1080, note: null },
    { id: 'b2', kind: 'blocked', staffId: 'vet', weekday: 1, startMin: 720, endMin: 780, note: 'Öğle arası' },
  ];
  /** Yerel saati UTC instant'a çevirir (Europe/Istanbul sabit +03). */
  const at = (day: string, hour: number, minute: number): Date =>
    new Date(Date.parse(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`) - 3 * 60 * 60_000);

  it('çalışma saatleri içinde → ok', () => {
    const verdict = evaluateSchedulePolicy({
      blocks,
      staffId: 'vet',
      start: at('2026-11-09', 10, 0),
      end: at('2026-11-09', 10, 20),
      timeZone: TZ,
    });
    expect(verdict.verdict).toBe('ok');
  });

  it('açılıştan önce → outside', () => {
    const verdict = evaluateSchedulePolicy({
      blocks,
      staffId: 'vet',
      start: at('2026-11-09', 8, 30),
      end: at('2026-11-09', 8, 50),
      timeZone: TZ,
    });
    expect(verdict.verdict).toBe('outside');
  });

  it('kapanıştan sonra → outside', () => {
    const verdict = evaluateSchedulePolicy({
      blocks,
      staffId: 'vet',
      start: at('2026-11-09', 17, 50),
      end: at('2026-11-09', 18, 10),
      timeZone: TZ,
    });
    expect(verdict.verdict).toBe('outside');
  });

  it('tanımlı olmayan gün (Pazar) → outside', () => {
    // 2026-11-08 Pazar
    const verdict = evaluateSchedulePolicy({
      blocks,
      staffId: 'vet',
      start: at('2026-11-08', 10, 0),
      end: at('2026-11-08', 10, 20),
      timeZone: TZ,
    });
    expect(verdict.verdict).toBe('outside');
  });

  it("personel engeliyle çakışma → blocked (override edilmez)", () => {
    const verdict = evaluateSchedulePolicy({
      blocks,
      staffId: 'vet',
      start: at('2026-11-09', 12, 0),
      end: at('2026-11-09', 12, 30),
      timeZone: TZ,
    });
    expect(verdict.verdict).toBe('blocked');
    if (verdict.verdict === 'blocked') expect(verdict.note).toBe('Öğle arası');
  });

  it('gece yarısını aşan randevu → outside', () => {
    const verdict = evaluateSchedulePolicy({
      blocks,
      staffId: 'vet',
      start: at('2026-11-09', 23, 50),
      end: at('2026-11-10', 0, 10),
      timeZone: TZ,
    });
    expect(verdict.verdict).toBe('outside');
  });

  it('politika yok → ok (serbest rezervasyon)', () => {
    const verdict = evaluateSchedulePolicy({
      blocks: [],
      staffId: 'newvet',
      start: at('2026-11-09', 3, 0),
      end: at('2026-11-09', 3, 20),
      timeZone: TZ,
    });
    expect(verdict.verdict).toBe('ok');
  });

  it('personel bloğu yoksa şube düzeyi çalışma saatine düşer', () => {
    const branchBlocks: ScheduleBlockLike[] = [
      { id: 's1', kind: 'working', staffId: null, weekday: 1, startMin: 480, endMin: 1140, note: null },
    ];
    const inside = evaluateSchedulePolicy({
      blocks: branchBlocks,
      staffId: 'newvet',
      start: at('2026-11-09', 8, 30),
      end: at('2026-11-09', 8, 50),
      timeZone: TZ,
    });
    expect(inside.verdict).toBe('ok');
    const outside = evaluateSchedulePolicy({
      blocks: branchBlocks,
      staffId: 'newvet',
      start: at('2026-11-09', 19, 30),
      end: at('2026-11-09', 19, 50),
      timeZone: TZ,
    });
    expect(outside.verdict).toBe('outside');
  });

  it('personelin kendi bloğu varsa şube varsayılanı yerine geçer', () => {
    const mixed: ScheduleBlockLike[] = [
      { id: 's1', kind: 'working', staffId: null, weekday: 1, startMin: 480, endMin: 1140, note: null },
      { id: 'v1', kind: 'working', staffId: 'vet', weekday: 1, startMin: 540, endMin: 1080, note: null },
    ];
    const verdict = evaluateSchedulePolicy({
      blocks: mixed,
      staffId: 'vet',
      start: at('2026-11-09', 8, 30), // şube saati açık ama hekim saati dışı
      end: at('2026-11-09', 8, 50),
      timeZone: TZ,
    });
    expect(verdict.verdict).toBe('outside');
  });
});

describe('durum makinesi — geçersiz sıralar reddedilir', () => {
  it('scheduled → arrived → waiting → in_consultation → completed zinciri geçerli', () => {
    expect(assertTransition('scheduled', 'arrived')).toBe('arrived');
    expect(assertTransition('arrived', 'waiting')).toBe('waiting');
    expect(assertTransition('waiting', 'in_consultation')).toBe('in_consultation');
    expect(assertTransition('in_consultation', 'completed')).toBe('completed');
  });

  it('scheduled → in_consultation (check-in atlama) reddedilir', () => {
    expect(() => assertTransition('scheduled', 'in_consultation')).toThrow(InvalidTransitionError);
  });

  it('completed sonrası her geçiş reddedilir', () => {
    expect(() => assertTransition('completed', 'waiting')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('completed', 'cancelled')).toThrow(InvalidTransitionError);
  });

  it('geri yönlü geçiş reddedilir', () => {
    expect(() => assertTransition('waiting', 'arrived')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('in_consultation', 'waiting')).toThrow(InvalidTransitionError);
  });

  it('arrived → completed (beklemede geçmeden tamamlama) reddedilir', () => {
    expect(() => assertTransition('arrived', 'completed')).toThrow(InvalidTransitionError);
  });

  it('aktif aşamadan cancelled/no_show çıkışı her aşamada mümkün', () => {
    expect(() => assertTransition('scheduled', 'cancelled')).not.toThrow();
    expect(() => assertTransition('arrived', 'no_show')).not.toThrow();
    expect(() => assertTransition('waiting', 'cancelled')).not.toThrow();
    expect(() => assertTransition('in_consultation', 'cancelled')).toThrow(InvalidTransitionError);
  });
});

describe('pickConflictingAppointment — çakışma seçimi', () => {
  const candidates = [
    { staffId: 'vetA', roomId: 'room1' },
    { staffId: 'vetB', roomId: 'room2' },
    { staffId: 'vetC', roomId: null },
  ];

  it('aynı hekim çakışır', () => {
    const conflict = pickConflictingAppointment(candidates, { staffId: 'vetB' });
    expect(conflict).toBeDefined();
    expect(conflict?.staffId).toBe('vetB');
  });

  it('aynı oda çakışır', () => {
    const conflict = pickConflictingAppointment(candidates, { staffId: 'vetX', roomId: 'room1' });
    expect(conflict?.roomId).toBe('room1');
  });

  it('farklı hekim ve oda çakışmaz', () => {
    expect(pickConflictingAppointment(candidates, { staffId: 'vetX', roomId: 'room9' })).toBeUndefined();
  });

  it('oda atanmamışsa oda çakışması sayılmaz', () => {
    expect(pickConflictingAppointment(candidates, { staffId: 'vetX' })).toBeUndefined();
  });
});
