import { describe, expect, it } from 'vitest';
import {
  allChecklistItemsDone,
  buildDefaultChecklist,
  canTransitionSurgery,
  checklistItemSummary,
} from './surgery.domain';

describe('Cerrahi olgu yaşam döngüsü (kabul kriteri 3 akışı)', () => {
  it('planned → prepped → in_surgery → recovery → completed akışı geçerli', () => {
    expect(canTransitionSurgery('planned', 'prepped')).toBe(true);
    expect(canTransitionSurgery('prepped', 'in_surgery')).toBe(true);
    expect(canTransitionSurgery('in_surgery', 'recovery')).toBe(true);
    expect(canTransitionSurgery('recovery', 'completed')).toBe(true);
  });

  it('ameliyat başlamadan iptal mümkün, başladıktan sonra değil', () => {
    expect(canTransitionSurgery('planned', 'cancelled')).toBe(true);
    expect(canTransitionSurgery('prepped', 'cancelled')).toBe(true);
    expect(canTransitionSurgery('in_surgery', 'cancelled')).toBe(false);
    expect(canTransitionSurgery('recovery', 'cancelled')).toBe(false);
  });

  it('geriye geçiş ve atlamalar reddedilir', () => {
    expect(canTransitionSurgery('planned', 'in_surgery')).toBe(false);
    expect(canTransitionSurgery('in_surgery', 'prepped')).toBe(false);
    expect(canTransitionSurgery('completed', 'recovery')).toBe(false);
  });
});

describe('Kontrol listesi kuralları', () => {
  it('varsayılan pre listesinde tüm maddeler işaretsiz üretilir', () => {
    const items = buildDefaultChecklist('pre');
    expect(items.length).toBe(5);
    expect(items.every((i) => !i.done)).toBe(true);
    expect(allChecklistItemsDone(items)).toBe(false);
  });

  it('tüm maddeler işaretlenmeden ameliyat başlamaz', () => {
    const items = buildDefaultChecklist('pre');
    expect(allChecklistItemsDone(items)).toBe(false);
    const done = items.map((i, idx) => ({ ...i, done: idx < 4 }));
    expect(allChecklistItemsDone(done)).toBe(false);
    const allDone = items.map((i) => ({ ...i, done: true }));
    expect(allChecklistItemsDone(allDone)).toBe(true);
  });

  it('boş liste tamamlanmış sayılmaz', () => {
    expect(allChecklistItemsDone([])).toBe(false);
    expect(allChecklistItemsDone(null)).toBe(false);
  });

  it('özet sayacı doğru hesaplar', () => {
    const items = [
      { label: 'a', done: true },
      { label: 'b', done: false },
      { label: 'c', done: true },
    ];
    expect(checklistItemSummary(items)).toEqual({ total: 3, done: 2 });
  });
});
