import { StatusChip } from '@/components/design-system/status-chip';
import { DOCUMENT_KIND_CATALOG, type DocumentKind } from '@/lib/api-types';

const TONES: Record<DocumentKind, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  exam_summary: 'info',
  vaccine_card: 'success',
  prescription: 'warning',
  consent: 'neutral',
  lab_report: 'info',
  discharge: 'danger',
};

/**
 * Belge türü rozeti — 6 belge türünü ayırt edilmiş renk + metinle gösterir.
 * Reçete warning: imza durumu belge başlığında ayrıca raporlanır.
 */
export function DocumentTypeBadge({ kind }: { kind: DocumentKind }) {
  const meta = DOCUMENT_KIND_CATALOG.find((entry) => entry.value === kind);
  return (
    <span data-testid={`belge-tur-${kind}`}>
      <StatusChip tone={TONES[kind]} label={meta?.label ?? kind} />
    </span>
  );
}
