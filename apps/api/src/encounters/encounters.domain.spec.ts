import { describe, expect, it } from 'vitest';
import {
  canTransition,
  acceptsAddendum,
  isEditable,
  InvalidEncounterTransitionError,
  VITAL_KIND_KEYS,
  vitalUnitFor,
  computeLineTotal,
} from './encounters.domain';

describe('encounters.domain (Faz 06)', () => {
  describe('durum makinesi', () => {
    it('draft → in_progress → signed → closed zinciri geçerlidir', () => {
      expect(canTransition('draft', 'in_progress')).toBe(true);
      expect(canTransition('in_progress', 'signed')).toBe(true);
      expect(canTransition('signed', 'closed')).toBe(true);
    });

    it('draft ve in_progress doğrudan imzalanabilir', () => {
      expect(canTransition('draft', 'signed')).toBe(true);
    });

    it("voided yalnızca draft/in_progress'ten alınabilir", () => {
      expect(canTransition('draft', 'voided')).toBe(true);
      expect(canTransition('in_progress', 'voided')).toBe(true);
      expect(canTransition('signed', 'voided')).toBe(false);
      expect(canTransition('closed', 'voided')).toBe(false);
    });

    it('geriye yönlü geçişler reddedilir', () => {
      expect(canTransition('signed', 'in_progress')).toBe(false);
      expect(canTransition('signed', 'draft')).toBe(false);
      expect(canTransition('closed', 'signed')).toBe(false);
      expect(canTransition('in_progress', 'draft')).toBe(false);
    });

    it('terminal durumlar geçiş yapamaz', () => {
      expect(canTransition('closed', 'closed')).toBe(false);
      expect(canTransition('voided', 'draft')).toBe(false);
    });

    it('isEditable yalnız draft/in_progress için true', () => {
      expect(isEditable('draft')).toBe(true);
      expect(isEditable('in_progress')).toBe(true);
      expect(isEditable('signed')).toBe(false);
      expect(isEditable('closed')).toBe(false);
      expect(isEditable('voided')).toBe(false);
    });

    it('acceptsAddendum yalnız signed/closed için true', () => {
      expect(acceptsAddendum('signed')).toBe(true);
      expect(acceptsAddendum('closed')).toBe(true);
      expect(acceptsAddendum('draft')).toBe(false);
      expect(acceptsAddendum('in_progress')).toBe(false);
      expect(acceptsAddendum('voided')).toBe(false);
    });

    it('InvalidEncounterTransitionError anlamlı mesaj taşır', () => {
      const err = new InvalidEncounterTransitionError('signed', 'draft');
      expect(err.message).toContain('signed');
      expect(err.message).toContain('draft');
    });
  });

  describe('vital kataloğu', () => {
    it('kind anahtarları tekildir', () => {
      expect(new Set(VITAL_KIND_KEYS).size).toBe(VITAL_KIND_KEYS.length);
    });

    it('sıcaklık ve ağırlık birimleri tanımlıdır', () => {
      expect(vitalUnitFor('temp')).toBe('°C');
      expect(vitalUnitFor('weight')).toBe('kg');
    });

    it('bilinmeyen kind null döner', () => {
      expect(vitalUnitFor('unknown')).toBeNull();
    });
  });

  describe('hizmet satırı tutarı', () => {
    it('qty * birim fiyat - indirim + vergi', () => {
      expect(computeLineTotal('2', '450', '0', '0')).toBe('900.00');
    });

    it('indirim ve vergi birlikte uygulanır', () => {
      expect(computeLineTotal(3, 100, 50, 30)).toBe('280.00');
    });

    it('yuvarlama 2 ondalığa yapılır', () => {
      expect(computeLineTotal(1, '10.555', 0, 0)).toBe('10.56');
      expect(computeLineTotal(3, '33.333', 0, 0)).toBe('100.00');
    });
  });
});
