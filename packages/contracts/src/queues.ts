/**
 * BullMQ kuyruk adları. API ve worker bu sabitleri paylaşır;
 * kuyruk adları kod içinde yalnızca buradan kullanılmalıdır.
 */
export const QUEUE_NAMES = {
  notifications: 'vetcore.notifications',
  reports: 'vetcore.reports',
  exports: 'vetcore.exports',
  documents: 'vetcore.documents',
  backups: 'vetcore.backends',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const ALL_QUEUE_NAMES: readonly QueueName[] = Object.values(QUEUE_NAMES);
