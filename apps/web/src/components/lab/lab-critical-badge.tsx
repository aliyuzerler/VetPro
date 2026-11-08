import { AlertTriangle } from 'lucide-react';
import { StatusChip } from '@/components/design-system/status-chip';

const FLAG_LABELS: Record<string, string> = {
  critical_low: 'Kritik düşük',
  critical_high: 'Kritik yüksek',
};

/**
 * Kritik lab sonucu uyarı rozeti — yetkili klinisyen ekranında uyarı üretir
 * (kabul kriteri). Onaylanmamış sonuçta ikon + metin ile vurgulanır.
 */
export function LabCriticalBadge({
  flag,
  acknowledged,
}: {
  flag: string;
  acknowledged: boolean;
}) {
  if (acknowledged) {
    return (
      <span data-testid="lab-kritik-onayli">
        <StatusChip tone="neutral" label="Kritik · Onaylandı" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" data-testid="lab-kritik-acik">
      <AlertTriangle className="size-4 text-destructive" aria-hidden />
      <StatusChip tone="danger" label={FLAG_LABELS[flag] ?? 'Kritik'} />
    </span>
  );
}
