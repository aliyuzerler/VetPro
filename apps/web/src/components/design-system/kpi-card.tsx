import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * KPI kartı — design/DESIGN_SYSTEM.md > Components > KPI cards.
 * Tek başlık değeri, etiket ve kompakt bağlam; keyfi renk dolgusu kullanılmaz.
 */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  className,
}: {
  label: string;
  /** Para/miktar değeri tabular numerals ile gösterilir */
  value: string;
  hint?: string;
  icon: LucideIcon;
  trend?: { direction: 'up' | 'down' | 'flat'; text: string };
  className?: string;
}) {
  return (
    <Card className={cn('min-w-0 shadow-card', className)}>
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <span className="flex size-8 items-center justify-center rounded-md bg-brand-50 text-brand-700">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="tnum text-2xl font-bold tracking-tight text-foreground">{value}</span>
          {trend && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-xs font-medium',
                trend.direction === 'up' && 'text-status-success',
                trend.direction === 'down' && 'text-status-danger',
                trend.direction === 'flat' && 'text-muted-foreground',
              )}
            >
              {trend.direction === 'up' && <ArrowUpRight className="size-3" aria-hidden="true" />}
              {trend.direction === 'down' && (
                <ArrowDownRight className="size-3" aria-hidden="true" />
              )}
              {trend.direction === 'flat' && <Minus className="size-3" aria-hidden="true" />}
              {trend.text}
            </span>
          )}
        </div>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  );
}
