import { describe, expect, it } from 'vitest';
import { EnvSchema, parseEnv } from './env';

describe('env doğrulama', () => {
  it('boş kaynak varsayılanlarla çözümlenir', () => {
    const env = parseEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.CLINIC_TIMEZONE).toBe('Europe/Istanbul');
    expect(env.DEFAULT_LOCALE).toBe('tr-TR');
    expect(env.DATABASE_URL).toContain('postgresql://');
  });

  it('geçersiz PORT değerini reddeder', () => {
    expect(() => parseEnv({ PORT: 'not-a-number' })).toThrow(/PORT/);
  });

  it('geçersiz NODE_ENV değerini reddeder', () => {
    expect(() => parseEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('PORT değerini sayıya çevirir', () => {
    const env = parseEnv({ PORT: '5000' });
    expect(env.PORT).toBe(5000);
    expect(typeof env.PORT).toBe('number');
  });
});
