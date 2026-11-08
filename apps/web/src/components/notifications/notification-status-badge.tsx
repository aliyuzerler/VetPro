import { StatusChip } from '@/components/design-system/status-chip';
import type { NotificationStatus } from '@/lib/api-types';

const LABELS: Record<NotificationStatus, string> = {
  queued: 'Kuyrukta',
  processing: 'İşleniyor',
  sent: 'Gönderildi',
  failed: 'Başarısız',
  dead_letter: 'Ölü Mektup',
  skipped: 'Atlandı',
};

/**
 * Bildirim durum rozeti — kuyruk yaşam döngüsü: queued → processing → sent |
 * failed | dead_letter | skipped. Retryable hata processing→queued'a geri döner;
 * ölü mektup operatör müdahalesi bekler. Durum yalnız renkle değil metinle
 * iletilir (erişilebilirlik kuralı).
 */
export function NotificationStatusBadge({ status }: { status: NotificationStatus }) {
  const tone =
    status === 'sent'
      ? 'success'
      : status === 'failed' || status === 'dead_letter'
        ? 'danger'
        : status === 'processing'
          ? 'warning'
          : status === 'queued'
            ? 'info'
            : 'neutral';
  return (
    <span data-testid={`bildirim-durum-${status}`}>
      <StatusChip tone={tone} label={LABELS[status]} />
    </span>
  );
}
