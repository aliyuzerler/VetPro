import { describe, expect, it } from 'vitest';
import { CURRENT_PHASE_ID, getPhase, PHASES } from '../src';

describe('PHASES', () => {
  it('15 fazı 1’den 15’e kesintisiz tanımlar', () => {
    expect(PHASES).toHaveLength(15);
    expect(PHASES.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('faz başlıkları boş değil ve benzersiz', () => {
    const titles = PHASES.map((p) => p.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const title of titles) {
      expect(title.length).toBeGreaterThan(3);
    }
  });

  it('slug değerleri -build ile biter ve benzersizdir', () => {
    const slugs = PHASES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug.endsWith('-build')).toBe(true);
    }
  });

  it('CURRENT_PHASE_ID tanımlı bir faza işaret eder', () => {
    expect(getPhase(CURRENT_PHASE_ID)).toBeDefined();
  });
});
