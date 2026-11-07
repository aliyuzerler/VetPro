import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service';

describe('PasswordService (scrypt)', () => {
  const service = new PasswordService();

  it('hash beklenen formatta üretilir', () => {
    const hash = service.hash('VetCore2026!');
    const parts = hash.split(':');
    expect(parts[0]).toBe('scrypt');
    expect(parts).toHaveLength(6);
    expect(parts[1]).toBe('16384');
    expect(parts[2]).toBe('8');
    expect(parts[3]).toBe('1');
  });

  it('doğru parolayı doğrular', () => {
    const hash = service.hash('VetCore2026!');
    expect(service.verify('VetCore2026!', hash)).toBe(true);
  });

  it('yanlış parolayı reddeder', () => {
    const hash = service.hash('VetCore2026!');
    expect(service.verify('yanlis-parola', hash)).toBe(false);
  });

  it('aynı parolanin hashleri farklıdır (rastgele tuz)', () => {
    expect(service.hash('ayni-parola')).not.toBe(service.hash('ayni-parola'));
  });

  it('bozuk hash formatında false döner, istisna atmaz', () => {
    expect(service.verify('x', 'bCrypt:bozuk')).toBe(false);
    expect(service.verify('x', 'scrypt:abc:def')).toBe(false);
    expect(service.verify('x', 'scrypt:N:R:P:zzzz:zzzz')).toBe(false);
    expect(service.verify('x', '')).toBe(false);
  });
});
