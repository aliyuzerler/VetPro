import { StatusChip } from '@/components/design-system/status-chip';
import type { SurgeryStatus } from '@/lib/api-types';

const LABELS: Record<SurgeryStatus, string> = {
  planned: 'Planlandı',
  prepped: 'Hazırlanıyor',
  in_surgery: 'Ameliyatta',
  recovery: 'İyileşmede',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
};

/**
 * Cerrahi olgu durum rozeti — planned → prepped → in_surgery → recovery →
 * completed; iptal yalnız ameliyat başlamadan önce.
 */
export function SurgeryStatusBadge({ status }: { status: SurgeryStatus }) {
  const tone =
    status === 'completed'
      ? 'success'
      : status === 'cancelled'
        ? 'danger'
        : status === 'in_surgery'
          ? 'warning'
          : 'info';
  return (
    <span data-testid={`cerrahi-durum-${status}`}>
      <StatusChip tone={tone} label={LABELS[status]} />
    </span>
  );
}
