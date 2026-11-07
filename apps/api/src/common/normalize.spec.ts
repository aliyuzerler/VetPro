import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizeMicrochip, normalizePhone, nameKey } from './normalize';

describe('normalizePhone — TR formatları', () => {
  it('uluslararası biçimi 90 önekli rakamlara indirger', () => {
    expect(normalizePhone('+90 532 111 22 33')).toBe('905321112233');
  });

  it('başında 0 olan formatı ülke koduna tamamlar', () => {
    expect(normalizePhone('0532 111 22 33')).toBe('905321112233');
  });

  it('ülke kodu olmayan 10 haneli mobil numarayı tamamlar', () => {
    expect(normalizePhone('5321112233')).toBe('905321112233');
  });

  it('sabit hat 0216 biçimini de ülke koduna tamamlar', () => {
    expect(normalizePhone('0216 111 22 33')).toBe('902161112233');
  });

  it('zaten normalize değerde değişiklik yapmaz', () => {
    expect(normalizePhone('905321112233')).toBe('905321112233');
  });

  it('yabancı numara rakam olarak korunur (ülke kodu varsayılmaz)', () => {
    expect(normalizePhone('+49 151 23456789')).toBe('4915123456789');
  });

  it('fazla kısa/biçimsiz girdi rakamları döndürür (arama güvenliği bozulmaz)', () => {
    expect(normalizePhone('abc')).toBe('');
  });
});

describe('normalizeEmail / normalizeMicrochip / nameKey', () => {
  it('e-posta küçük harfe iner ve kenar boşlukları kırpılır', () => {
    expect(normalizeEmail('  Zeynep.Aksoy@Example.COM ')).toBe('zeynep.aksoy@example.com');
  });

  it('mikroçip boşluk/tire temizlenir ve büyük harfe çıkar', () => {
    expect(normalizeMicrochip('985-101 000 000 001')).toBe('985101000000001');
  });

  it('ad anahtarı çoklu boşluğu düzeltir ve TR küçük harf uygular', () => {
    expect(nameKey('  Zeynep   Aksoy ')).toBe('zeynep aksoy');
    expect(nameKey('İSMAİL')).toBe('ismail');
  });
});
