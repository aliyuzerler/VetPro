'use client';

import { CircleX, Inbox, Lock, RefreshCw, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Durum görünümleri — rules/ui-ux.md: "Every screen has loading, empty, error,
 * success and unauthorized states." Boş durum bir sonraki yararlı eylemi açıklar;
 * hata durumu her zaman yeniden deneme yolu sunar (DESIGN_SYSTEM.md > Interaction).
 */
function StateShell({
  icon: Icon,
  title,
  description,
  action,
  tone,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  tone: 'muted' | 'danger';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card px-6 py-8 text-center',
        className,
      )}
    >
      <span
        className={cn(
          'flex size-10 items-center justify-center rounded-full',
          tone === 'danger'
            ? 'bg-[var(--status-danger-bg)] text-status-danger'
            : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold">{title}</span>
      <span className="max-w-sm text-xs text-muted-foreground">{description}</span>
      {action && <span className="mt-1">{action}</span>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <StateShell
      icon={Inbox}
      title={title}
      description={description}
      action={action}
      tone="muted"
      className={className}
    />
  );
}

export function ErrorState({
  title,
  description,
  onRetry,
  className,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <StateShell
      icon={CircleX}
      title={title}
      description={description}
      tone="danger"
      className={className}
      action={
        onRetry ? (
          <Button variant="outline" size="sm" className="min-h-9 gap-1.5" onClick={onRetry}>
            <RefreshCw className="size-3.5" aria-hidden="true" /> Tekrar dene
          </Button>
        ) : undefined
      }
    />
  );
}

export function UnauthorizedState({
  title = 'Bu bölümü görme yetkiniz yok',
  description = 'Gerekli yetki rolünüzde tanımlı değil. Klinik yöneticinizden yetki talep edebilirsiniz.',
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <StateShell
      icon={Lock}
      title={title}
      description={description}
      tone="muted"
      className={className}
    />
  );
}
