import { StatusChip } from '@/components/design-system/status-chip';

/**
 * Reçete durum rozeti — 'draft' | 'signed' | 'voided'.
 * Durum yalnız renkle değil ikon + metinle iletilir (erişilebilirlik kuralı).
 */
export function PrescriptionStatusBadge({
  status,
  code,
}: {
  status: 'draft' | 'signed' | 'voided';
  code?: string | null;
}) {
  const label =
    status === 'signed' ? 'İmzalı' : status === 'voided' ? 'İptal' : 'Taslak';
  const tone = status === 'signed' ? 'success' : status === 'voided' ? 'danger' : 'info';
  const testId =
    status === 'signed'
      ? 'recete-durum-imzali'
      : status === 'voided'
        ? 'recete-durum-iptal'
        : 'recete-durum-taslak';
  return (
    <span data-testid={testId}>
      <StatusChip tone={tone} label={code ? `${label} · ${code}` : label} />
    </span>
  );
}
