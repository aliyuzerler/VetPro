import { StatusChip } from '@/components/design-system/status-chip';

/**
 * Entegrasyon modu rozeti — sandbox/canlı ayrımı. Canlı yetkili entegrasyon
 * yoksa sandbox rozeti gösterilir ve UI ayrıca uyarı şeridi raporlar.
 */
export function IntegrationModeBadge({ mode }: { mode: 'sandbox' | 'live' }) {
  return (
    <span data-testid={`entegrasyon-mod-${mode}`}>
      <StatusChip
        tone={mode === 'live' ? 'success' : 'neutral'}
        label={mode === 'live' ? 'Canlı' : 'Sandbox'}
      />
    </span>
  );
}
