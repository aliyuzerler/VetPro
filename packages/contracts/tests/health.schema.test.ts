import { describe, expect, it } from 'vitest';
import { HealthCheckSchema, HealthResponseSchema, ALL_QUEUE_NAMES, QUEUE_NAMES } from '../src';

describe('HealthResponseSchema', () => {
  const valid = {
    status: 'ok',
    service: 'vetcore-api',
    version: '0.1.0',
    environment: 'test',
    uptimeSeconds: 3.2,
    timestamp: '2026-01-01T00:00:00.000Z',
    checks: [{ name: 'api', status: 'ok', latencyMs: 1 }],
  };

  it('geçerli yanıtı kabul eder', () => {
    expect(HealthResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('geçersiz status değerini reddeder', () => {
    expect(HealthResponseSchema.safeParse({ ...valid, status: 'unknown' }).success).toBe(false);
  });

  it('eksik checks alanını reddeder', () => {
    const { checks: _omitted, ...withoutChecks } = valid;
    expect(HealthResponseSchema.safeParse(withoutChecks).success).toBe(false);
  });

  it('negatif latency değerini reddeder', () => {
    const parsed = HealthCheckSchema.safeParse({
      name: 'database',
      status: 'ok',
      latencyMs: -5,
    });
    expect(parsed.success).toBe(false);
  });

  it('degraded durumu ile kontrol detayını kabul eder', () => {
    const parsed = HealthCheckSchema.safeParse({
      name: 'database',
      status: 'degraded',
      detail: 'bağlantı gecikmeli',
    });
    expect(parsed.success).toBe(true);
  });
});

describe('QUEUE_NAMES', () => {
  it('tüm kuyruk adları vetcore. öneki taşır ve tekrarsızdır', () => {
    const names = Object.values(QUEUE_NAMES);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name.startsWith('vetcore.')).toBe(true);
    }
  });

  it('ALL_QUEUE_NAMES listesi kuyruk adlarıyla eşleşir', () => {
    expect(ALL_QUEUE_NAMES).toEqual(Object.values(QUEUE_NAMES));
  });
});
