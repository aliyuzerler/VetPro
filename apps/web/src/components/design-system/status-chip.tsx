import { AlertTriangle, CircleCheck, CircleX, Info, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Durum rozeti — design/DESIGN_SYSTEM.md > Components > Status chips.
 * Kısıtlı semantik zemin + okunabilir metin. Durum ASLA yalnızca renkle iletilmez:
 * her rozet ikon + metin taşır (rules/ui-ux.md, rules/accessibility.md).
 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_STYLES: Record<StatusTone, { chip: string; dot: string; icon: LucideIcon }> = {
  success: {
    chip: 'bg-[var(--status-success-bg)] text-status-success',
    dot: 'bg-status-success',
    icon: CircleCheck,
  },
  warning: {
    chip: 'bg-[var(--status-warning-bg)] text-status-warning',
    dot: 'bg-status-warning',
    icon: AlertTriangle,
  },
  danger: {
    chip: 'bg-[var(--status-danger-bg)] text-status-danger',
    dot: 'bg-status-danger',
    icon: CircleX,
  },
  info: {
    chip: 'bg-[var(--status-info-bg)] text-status-info',
    dot: 'bg-status-info',
    icon: Info,
  },
  neutral: {
    chip: 'bg-muted text-muted-foreground',
    dot: 'bg-neutral-500',
    icon: Info,
  },
};

export function StatusChip({
  tone,
  label,
  className,
}: {
  tone: StatusTone;
  label: string;
  className?: string;
}) {
  const style = TONE_STYLES[tone];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        'inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        style.chip,
        className,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', style.dot)} aria-hidden="true" />
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
