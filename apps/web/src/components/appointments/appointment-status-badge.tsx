import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AppointmentStatus } from '@/lib/api-types';

/** Durum etiketleri — design/DESIGN_SYSTEM.md ton kurallarına göre sınıf eşlemesi. */
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Planlandı',
  arrived: 'Geldi',
  waiting: 'Beklemede',
  in_consultation: 'Muayenede',
  completed: 'Tamamlandı',
  no_show: 'Gelmedi',
  cancelled: 'İptal Edildi',
};

const STATUS_CLASSES: Record<AppointmentStatus, string> = {
  scheduled: 'bg-brand-50 text-brand-800 border-brand-200',
  arrived: 'bg-amber-50 text-amber-800 border-amber-200',
  waiting: 'bg-violet-50 text-violet-800 border-violet-200',
  in_consultation: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  completed: 'bg-green-50 text-green-800 border-green-200',
  no_show: 'bg-red-50 text-red-800 border-red-200',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

/** Randevu durum rozeti — renk tek başına bilgi taşımaz, metin her zaman görünür. */
export function AppointmentStatusBadge({
  status,
  className,
}: {
  status: AppointmentStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn('text-xs font-medium', STATUS_CLASSES[status], className)}
    >
      {APPOINTMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
