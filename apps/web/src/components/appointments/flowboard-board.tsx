'use client';

import { AlertTriangle, Clock, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/design-system/state-views';
import { AppointmentStatusBadge } from './appointment-status-badge';
import type { FlowboardEntry, FlowboardPayload } from '@/lib/api-types';

/**
 * Faz 05 — klinik akış panosu. Hasta kuyruğu API'den gelen gerçek randevu
 * satırlarından üretilir (mock yok): arrived / waiting / in_consultation şeritleri.
 * Kartlar onay gerektiren eylemi açık etiketli düğmelerle sunar (simge + metin).
 */

export type FlowboardActions = {
  onAdvance: (appointmentId: string, status: 'waiting' | 'in_consultation' | 'completed') => void;
  onCheckIn: (appointmentId: string) => void;
  onNoShow: (appointmentId: string) => void;
  onCancel: (appointmentId: string) => void;
  canManage: boolean;
};

const TYPE_COLOR_CLASSES: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-800 border-brand-200',
  green: 'bg-green-50 text-green-800 border-green-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  red: 'bg-red-50 text-red-800 border-red-200',
  violet: 'bg-violet-50 text-violet-800 border-violet-200',
  cyan: 'bg-cyan-50 text-cyan-800 border-cyan-200',
};

function timeShort(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(iso));
}

export function FlowboardCard({
  entry,
  actions,
}: {
  entry: FlowboardEntry;
  actions: FlowboardActions;
}) {
  return (
    <div
      data-testid={`flowboard-card-${entry.appointmentId}`}
      className="rounded-lg border bg-card p-3 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{entry.patient.name}</p>
          <p className="text-xs text-muted-foreground">
            {entry.patient.code} · {entry.owner.fullName}
          </p>
        </div>
        <Badge
          variant="outline"
          className={TYPE_COLOR_CLASSES[entry.type.colorKey] ?? TYPE_COLOR_CLASSES.brand}
        >
          {entry.type.name}
        </Badge>
      </div>

      {entry.patient.alerts.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1" aria-label="Hasta uyarıları">
          {entry.patient.alerts.map((alert) => (
            <li
              key={alert.label}
              className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-900"
            >
              <AlertTriangle className="size-3" aria-hidden />
              {alert.label}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
        <p className="flex items-center gap-1">
          <Clock className="size-3 shrink-0" aria-hidden />
          <span>
            {timeShort(entry.scheduledStart)}–{timeShort(entry.scheduledEnd)}
          </span>
        </p>
        <p className="flex items-center gap-1">
          <UserRound className="size-3 shrink-0" aria-hidden />
          <span>
            {entry.staff.fullName}
            {entry.room ? ` · ${entry.room.name}` : ''}
          </span>
        </p>
      </div>

      <p className="mt-1.5 text-xs font-medium text-brand-700">
        Bekleme: {entry.waitingMinutes} dk
      </p>

      {actions.canManage && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.status === 'arrived' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onAdvance(entry.appointmentId, 'waiting')}
            >
              Beklemeye Al
            </Button>
          )}
          {(entry.status === 'arrived' || entry.status === 'waiting') && (
            <Button
              size="sm"
              onClick={() => actions.onAdvance(entry.appointmentId, 'in_consultation')}
            >
              Muayeneye Al
            </Button>
          )}
          {entry.status === 'in_consultation' && (
            <Button
              size="sm"
              onClick={() => actions.onAdvance(entry.appointmentId, 'completed')}
            >
              Tamamla
            </Button>
          )}
          {entry.status === 'arrived' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.onNoShow(entry.appointmentId)}
            >
              Gelmedi
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => actions.onCancel(entry.appointmentId)}
          >
            İptal
          </Button>
        </div>
      )}
    </div>
  );
}

const LANES: { key: keyof FlowboardPayload['lanes']; title: string }[] = [
  { key: 'arrived', title: 'Geldi (Check-in)' },
  { key: 'waiting', title: 'Beklemede' },
  { key: 'in_consultation', title: 'Muayenede' },
];

export function FlowboardBoard({
  payload,
  actions,
  isLoading,
  isError,
  errorMessage,
  onRetry,
}: {
  payload: FlowboardPayload | undefined;
  actions: FlowboardActions;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry: () => void;
}) {
  if (isLoading && !payload) {
    return (
      <div
        role="status"
        className="grid gap-4 md:grid-cols-3"
        aria-label="Akış panosu yükleniyor"
      >
        {[0, 1, 2].map((lane) => (
          <div key={lane} className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Akış panosu yüklenemedi"
        description={errorMessage ?? 'Bilinmeyen hata'}
        onRetry={onRetry}
      />
    );
  }

  const counts = payload?.counts;
  const isEmpty =
    payload &&
    payload.lanes.arrived.length === 0 &&
    payload.lanes.waiting.length === 0 &&
    payload.lanes.in_consultation.length === 0;

  return (
    <div data-testid="flowboard-board" className="flex flex-col gap-6">
      {counts && (
        <p className="text-sm text-muted-foreground">
          Bugün: {counts.completed} tamamlandı · {counts.cancelled} iptal · {counts.no_show}{' '}
          gelmedi · {counts.scheduled} planlı
        </p>
      )}

      {isEmpty && (
        <EmptyState
          title="Bugün için aktif kuyruk yok"
          description="Check-in edilen randevular bu panoya düşer. Takvimden randevu oluşturabilirsiniz."
        />
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {LANES.map((lane) => {
          const entries = payload?.lanes[lane.key] ?? [];
          return (
            <Card key={lane.key} data-testid={`flowboard-lane-${lane.key}`} className="gap-3">
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center justify-between text-base">
                  {lane.title}
                  <Badge variant="secondary" aria-label={`${lane.title} hasta sayısı`}>
                    {entries.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {entries.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                    Şeritte hasta yok
                  </p>
                ) : (
                  entries.map((entry) => (
                    <FlowboardCard key={entry.appointmentId} entry={entry} actions={actions} />
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** Şerit başlığı eylem bölümünde kullanılan ortak rozet (test kapsamı için dışa açık). */
export function FlowboardLaneBadge({ status }: { status: string }) {
  return (
    <AppointmentStatusBadge
      status={status as FlowboardEntry['status']}
      className="pointer-events-none"
    />
  );
}
