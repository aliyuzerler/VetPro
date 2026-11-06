import { ALL_QUEUE_NAMES, type QueueName } from '@vetcore/contracts';

export interface QueueRegistryEntry {
  name: QueueName;
  /** Faz 01'de hiçbir işleyici tanımlı değil; kuyruklar yalnızca tanımlanır. */
  hasProcessor: boolean;
}

export interface QueueRegistry {
  /** REDIS_URL tanımlıysa true. */
  enabled: boolean;
  queues: QueueRegistryEntry[];
  /** Pasif modda açıklama sağlar. */
  reason?: string;
}

/**
 * Saf kayıt mantığı — test edilebilir; Redis bağlantısı gerektirmez.
 * Faz 01'de işleyici yoktur; bildirim/rapor işleri sonraki fazlarda eklenir.
 */
export function buildQueueRegistry(redisUrl?: string): QueueRegistry {
  if (!redisUrl) {
    return {
      enabled: false,
      queues: ALL_QUEUE_NAMES.map((name) => ({ name, hasProcessor: false })),
      reason: 'REDIS_URL yapılandırılmadı; worker pasif modda çalışıyor',
    };
  }
  return {
    enabled: true,
    queues: ALL_QUEUE_NAMES.map((name) => ({ name, hasProcessor: false })),
  };
}
