import { describe, expect, it } from 'vitest';
import { buildQueueRegistry } from './queue-registry';

describe('buildQueueRegistry', () => {
  it('REDIS_URL tanımlıysa etkin ve tüm kuyruklar tanımlıdır', () => {
    const registry = buildQueueRegistry('redis://localhost:6379');
    expect(registry.enabled).toBe(true);
    expect(registry.reason).toBeUndefined();
    expect(registry.queues.length).toBeGreaterThan(0);
    expect(registry.queues.every((q) => q.hasProcessor === false)).toBe(true);
  });

  it('REDIS_URL tanımsızsa pasif mod raporlanır', () => {
    const registry = buildQueueRegistry(undefined);
    expect(registry.enabled).toBe(false);
    expect(registry.reason).toContain('pasif');
    expect(registry.queues.length).toBeGreaterThan(0);
  });

  it('boş string REDIS_URL pasif moda düşer', () => {
    const registry = buildQueueRegistry('');
    expect(registry.enabled).toBe(false);
  });
});
