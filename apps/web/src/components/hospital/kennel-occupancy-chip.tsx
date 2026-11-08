import { StatusChip } from '@/components/design-system/status-chip';

/**
 * Kennel doluluk rozeti — yatış panosunda kafes durumunu iletir.
 * Dolu kafeslerde yatan hasta adı metinle taşınır (yalnız renk değil).
 */
export function KennelOccupancyChip({
  occupied,
  active,
  size,
  patientName,
}: {
  occupied: boolean;
  active: boolean;
  size: string;
  patientName?: string | null;
}) {
  const sizeLabel = size === 'large' ? 'Büyük' : size === 'small' ? 'Küçük' : 'Orta';
  if (!active) {
    return <StatusChip tone="neutral" label={`Pasif · ${sizeLabel}`} />;
  }
  return occupied ? (
    <span data-testid="kennel-dolu">
      <StatusChip tone="warning" label={`Dolu · ${patientName ?? 'Hasta'} · ${sizeLabel}`} />
    </span>
  ) : (
    <span data-testid="kennel-bos">
      <StatusChip tone="success" label={`Boş · ${sizeLabel}`} />
    </span>
  );
}
