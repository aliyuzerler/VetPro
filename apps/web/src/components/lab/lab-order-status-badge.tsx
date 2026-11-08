import { StatusChip } from '@/components/design-system/status-chip';
import type { LabOrderStatus } from '@/lib/api-types';

const LABELS: Record<LabOrderStatus, string> = {
  ordered: 'İstendi',
  sample_collected: 'Numune Alındı',
  in_progress: 'Analizde',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
};

/**
 * Lab sipariş durum rozeti — yaşam döngüsü: ordered → sample_collected →
 * in_progress → completed (iptal her aktif durumdan mümkün). Durum yalnız
 * renkle değil metinle iletilir (erişilebilirlik kuralı).
 */
export function LabOrderStatusBadge({ status }: { status: LabOrderStatus }) {
  const tone =
    status === 'completed'
      ? 'success'
      : status === 'cancelled'
        ? 'danger'
        : status === 'in_progress'
          ? 'warning'
          : 'info';
  return (
    <span
      data-testid={`lab-durum-${status}`}
    >
      <StatusChip tone={tone} label={LABELS[status]} />
    </span>
  );
}
