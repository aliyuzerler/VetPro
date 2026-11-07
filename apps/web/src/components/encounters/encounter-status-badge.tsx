import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { EncounterStatus } from '@/lib/api-types';

/** Muayene durum etiketleri — renk tek başına bilgi taşımaz (a11y kuralı). */
export const ENCOUNTER_STATUS_LABELS: Record<EncounterStatus, string> = {
  draft: 'Taslak',
  in_progress: 'Devam Ediyor',
  signed: 'İmzalandı',
  closed: 'Kapatıldı',
  voided: 'İptal Edildi',
};

const STATUS_CLASSES: Record<EncounterStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  in_progress: 'bg-brand-50 text-brand-800 border-brand-200',
  signed: 'bg-green-50 text-green-800 border-green-200',
  closed: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  voided: 'bg-red-50 text-red-800 border-red-200',
};

/** Muayene durum rozeti — imza kilidi görsel olarak da görünür. */
export function EncounterStatusBadge({
  status,
  className,
}: {
  status: EncounterStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn('text-xs font-medium', STATUS_CLASSES[status], className)}
    >
      {ENCOUNTER_STATUS_LABELS[status]}
    </Badge>
  );
}
