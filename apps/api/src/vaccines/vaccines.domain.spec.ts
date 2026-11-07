import { describe, expect, it } from 'vitest';
import {
  addDays,
  classifyDue,
  computeScheduleEntry,
  dateKey,
  vaccineLotIssue,
} from './vaccines.domain';

const DAY = 86_400_000;

describe('computeScheduleEntry — protokol takvimi (kabul kriteri 5)', () => {
  const today = new Date('2026-11-10T00:00:00.000Z');

  it('son aşı varsa tekrar vadesini protokol aralığından üretir', () => {
    const entry = computeScheduleEntry({
      birthDate: new Date('2024-01-01'),
      firstDoseAgeDays: 60,
      boosterIntervalDays: 180,
      lastAdministeredAt: new Date('2026-06-01T10:00:00.000Z'),
      today,
    });
    expect(entry?.basis).toBe('booster');
    expect(dateKey(entry!.dueAt)).toBe('2026-11-28');
  });

  it('aşı yoksa ilk doz yaşını doğum tarihinden hesaplar', () => {
    const entry = computeScheduleEntry({
      birthDate: new Date('2026-09-01T00:00:00.000Z'),
      firstDoseAgeDays: 60,
      boosterIntervalDays: 180,
      lastAdministeredAt: null,
      today,
    });
    expect(entry?.basis).toBe('first_dose');
    expect(dateKey(entry!.dueAt)).toBe('2026-10-31');
  });

  it('doğum tarihi de aşı da yoksa girdi üretmez (evrensel varsayım yok)', () => {
    const entry = computeScheduleEntry({
      birthDate: null,
      firstDoseAgeDays: 60,
      boosterIntervalDays: 180,
      lastAdministeredAt: null,
      today,
    });
    expect(entry).toBeNull();
  });
});

describe('classifyDue — yaklaşan/geciken sınıflandırma', () => {
  const today = new Date('2026-11-10T12:00:00.000Z');

  it('vadesi geçeni overdue işaretler', () => {
    expect(classifyDue(new Date('2026-11-09'), today, 14)).toBe('overdue');
  });

  it('lead penceresi içindekini due_soon işaretler', () => {
    expect(classifyDue(new Date('2026-11-10'), today, 14)).toBe('due_soon');
    expect(classifyDue(new Date('2026-11-24'), today, 14)).toBe('due_soon');
  });

  it('pencere dışındakini later işaretler', () => {
    expect(classifyDue(new Date('2026-11-25'), today, 14)).toBe('later');
  });
});

describe('vaccineLotIssue — parti durumu (kabul kriteri 4)', () => {
  const at = new Date('2026-11-10T12:00:00.000Z');

  it('süresi geçmiş partiyi expired işaretler', () => {
    expect(vaccineLotIssue({ status: 'active', expiresAt: new Date(at.getTime() - DAY) }, at)).toBe(
      'expired',
    );
  });

  it('karantinalı partiyi quarantined işaretler', () => {
    expect(
      vaccineLotIssue({ status: 'quarantined', expiresAt: new Date(at.getTime() + 30 * DAY) }, at),
    ).toBe('quarantined');
  });

  it('geçerli partiyi sorunsuz kabul eder', () => {
    expect(
      vaccineLotIssue({ status: 'active', expiresAt: new Date(at.getTime() + 30 * DAY) }, at),
    ).toBeNull();
  });
});

describe('addDays / dateKey', () => {
  it('gün aritmetiği UTC üzerinden yapılır', () => {
    expect(dateKey(addDays(new Date('2026-11-10T23:59:59.000Z'), 1))).toBe('2026-11-11');
    expect(dateKey(addDays(new Date('2026-12-31T00:00:00.000Z'), 1))).toBe('2027-01-01');
  });
});
