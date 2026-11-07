'use client';

import { CalendarPlus, CircleSlash, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/design-system/state-views';
import { Skeleton } from '@/components/ui/skeleton';
import type { WaitlistEntry } from '@/lib/api-types';

/**
 * Faz 05 — bekleme listesi tablosu. Uygun slot bulunamayan hastalar burada
 * kuyruğa alınır; "Randevuya Çevir" akışı randevu kurallarını (çakışma, çalışma
 * saati) aynen uygular — kural atlaması mümkün değildir.
 */

export function waitlistTimeLabel(entry: WaitlistEntry): string {
  if (entry.preferredDate === null && entry.preferredStartMin === null) return 'Herhangi bir zaman';
  const day = entry.preferredDate ?? '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  const start =
    entry.preferredStartMin !== null
      ? `${pad(Math.floor(entry.preferredStartMin / 60))}:${pad(entry.preferredStartMin % 60)}`
      : null;
  const end =
    entry.preferredEndMin !== null
      ? `${pad(Math.floor(entry.preferredEndMin / 60))}:${pad(entry.preferredEndMin % 60)}`
      : null;
  const window = start && end ? `${start}–${end}` : (start ?? '');
  return `${day} ${window}`.trim();
}

export function WaitlistTable({
  entries,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  onBook,
  onCancel,
  canManage,
}: {
  entries: WaitlistEntry[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry: () => void;
  onBook: (entry: WaitlistEntry) => void;
  onCancel: (entryId: string) => void;
  canManage: boolean;
}) {
  if (isError) {
    return (
      <ErrorState
        title="Bekleme listesi yüklenemedi"
        description={errorMessage ?? 'Bilinmeyen hata'}
        onRetry={onRetry}
      />
    );
  }

  if (isLoading) {
    return (
      <Skeleton className="h-64" aria-busy="true" aria-label="Bekleme listesi yükleniyor" />
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        title="Bekleme listesi boş"
        description="Uygun slot bulamadığınız hastaları buraya ekleyin; slot açıldığında randevuya çevirin."
      />
    );
  }

  return (
    <Card data-testid="waitlist-table">
      <CardHeader>
        <CardTitle>Bekleyen Hasta Kuyruğu</CardTitle>
        <CardDescription>
          En eski kayıt üstte; &quot;Randevuya Çevir&quot; akışı tüm randevu kurallarını uygular.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">Bekleme listesi kayıtları</caption>
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="pb-2 pr-3 font-medium">
                Hasta
              </th>
              <th scope="col" className="pb-2 pr-3 font-medium">
                Tür
              </th>
              <th scope="col" className="pb-2 pr-3 font-medium">
                Tercih
              </th>
              <th scope="col" className="pb-2 pr-3 font-medium">
                Not
              </th>
              <th scope="col" className="pb-2 font-medium">
                Eylemler
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b last:border-0" data-testid={`waitlist-row-${entry.id}`}>
                <td className="py-2.5 pr-3">
                  <p className="font-medium">
                    {entry.patient.name} ({entry.patient.code})
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.owner.firstName} {entry.owner.lastName}
                  </p>
                </td>
                <td className="py-2.5 pr-3">
                  {entry.type ? (
                    <Badge variant="outline">{entry.type.name}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2.5 pr-3">
                  <span className="inline-flex items-center gap-1 text-xs">
                    <Clock className="size-3" aria-hidden />
                    {waitlistTimeLabel(entry)}
                  </span>
                  {entry.preferredStaff && (
                    <p className="text-xs text-muted-foreground">
                      Hekim: {entry.preferredStaff.firstName} {entry.preferredStaff.lastName}
                    </p>
                  )}
                </td>
                <td className="max-w-[200px] truncate py-2.5 pr-3 text-muted-foreground">
                  {entry.note ?? '—'}
                </td>
                <td className="py-2.5">
                  {entry.status === 'waiting' ? (
                    <div className="flex gap-1.5">
                      {canManage && (
                        <Button
                          size="sm"
                          onClick={() => onBook(entry)}
                          data-testid={`book-${entry.id}`}
                        >
                          <CalendarPlus className="size-3.5" aria-hidden />
                          Randevuya Çevir
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onCancel(entry.id)}
                          aria-label={`İptal — ${entry.patient.name} bekleme kaydı`}
                        >
                          <CircleSlash className="size-3.5" aria-hidden />
                          İptal
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Badge variant="secondary">
                      {entry.status === 'scheduled' ? 'Randevuya çevrildi' : 'İptal edildi'}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
