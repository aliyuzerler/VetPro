import { describe, expect, it } from 'vitest';
import { findKennelConflict, isActiveStayStatus, validateObservation } from './hospital.domain';

const K1 = '11111111-1111-1111-1111-111111111111';
const K2 = '22222222-2222-2222-2222-222222222222';

describe('Kennel çakışma kontrolü (kabul kriteri 4)', () => {
  const active = {
    id: 'aaaa1111-0000-0000-0000-000000000001',
    kennelId: K1,
    admittedAt: new Date('2026-11-07T09:00:00.000Z'),
    dischargedAt: null,
  };

  it('aynı kennelde açık uçlu aktif yatışla çakışır', () => {
    const conflict = findKennelConflict(
      { kennelId: K1, admittedAt: new Date('2026-11-08T10:00:00.000Z'), dischargedAt: null },
      [active],
    );
    expect(conflict?.id).toBe(active.id);
  });

  it('taburculuk tarihi sonrası kabul çakışmaz', () => {
    const discharged = { ...active, dischargedAt: new Date('2026-11-08T08:00:00.000Z') };
    const conflict = findKennelConflict(
      { kennelId: K1, admittedAt: new Date('2026-11-08T10:00:00.000Z'), dischargedAt: null },
      [discharged],
    );
    expect(conflict).toBeNull();
  });

  it('farklı kennel çakışmaz', () => {
    const conflict = findKennelConflict(
      { kennelId: K2, admittedAt: new Date('2026-11-08T10:00:00.000Z'), dischargedAt: null },
      [active],
    );
    expect(conflict).toBeNull();
  });

  it('kendi penceresiyle karşılaştırılmaz (transfer senaryosu)', () => {
    const conflict = findKennelConflict(
      { kennelId: K1, admittedAt: new Date('2026-11-08T10:00:00.000Z'), dischargedAt: null },
      [active],
      active.id,
    );
    expect(conflict).toBeNull();
  });

  it('bitiş tarihli aday pencere aktif yatışla kesişir', () => {
    const conflict = findKennelConflict(
      {
        kennelId: K1,
        admittedAt: new Date('2026-11-06T00:00:00.000Z'),
        dischargedAt: new Date('2026-11-08T12:00:00.000Z'),
      },
      [active],
    );
    expect(conflict?.id).toBe(active.id);
  });
});

describe('Aktif yatış durumu', () => {
  it('admitted ve transferred aktif, discharged değil', () => {
    expect(isActiveStayStatus('admitted')).toBe(true);
    expect(isActiveStayStatus('transferred')).toBe(true);
    expect(isActiveStayStatus('discharged')).toBe(false);
  });
});

describe('Gözlem doğrulaması', () => {
  it('vital türünde ölçüm veya not beklenir', () => {
    expect(validateObservation('vital', { tempC: 38.5 })).toBe(true);
    expect(validateObservation('vital', { notes: 'Nabız düzenli' })).toBe(true);
    expect(validateObservation('vital', {})).toBe(false);
    expect(validateObservation('note', { notes: 'Yem yedi' })).toBe(true);
    expect(validateObservation('note', {})).toBe(false);
  });
});
