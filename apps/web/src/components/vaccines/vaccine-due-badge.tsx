import { AlertTriangle, CalendarClock, CircleCheck } from 'lucide-react';
import { StatusChip } from '@/components/design-system/status-chip';

/**
 * Aşı vade rozeti — yaklaşan/geciken/sonrası sınıflandırması.
 * Durum ikon + metinle iletilir (yalnız renk değil).
 */
export function VaccineDueBadge({ classification }: { classification: 'overdue' | 'due_soon' | 'later' }) {
  const label =
    classification === 'overdue' ? 'Gecikmiş' : classification === 'due_soon' ? 'Yaklaşan' : 'İleri tarih';
  const testId =
    classification === 'overdue'
      ? 'asi-vade-gecikmis'
      : classification === 'due_soon'
        ? 'asi-vade-yaklasan'
        : 'asi-vade-ileri';
  return (
    <span data-testid={testId}>
      <StatusChip
        tone={classification === 'overdue' ? 'danger' : classification === 'due_soon' ? 'warning' : 'neutral'}
        label={label}
      />
    </span>
  );
}

export const VACCINE_DUE_ICONS = { AlertTriangle, CalendarClock, CircleCheck };
