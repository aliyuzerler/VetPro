'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { DeliveryReportDto } from '@/lib/api-types';
import { NOTIFICATION_STATUS_CATALOG } from '@/lib/api-types';

const CHANNEL_LABELS: Record<string, string> = {
  push: 'Uygulama İçi',
  sms: 'SMS',
  email: 'E-posta',
  whatsapp: 'WhatsApp',
};

/**
 * Teslim raporu kartı — durum kırılımı KPI'ları + kanal bazlı dağılım.
 * Teslim edilebilirlik yüzdesi sent/total oranıdır (toplam 0 ise %100 kabul:
 * henüz gönderim yokken alarm üretmemek için).
 */
export function DeliveryReportCard({ report }: { report: DeliveryReportDto }) {
  const statusEntries = NOTIFICATION_STATUS_CATALOG.map((entry) => ({
    ...entry,
    count: report.statusCounts[entry.value] ?? 0,
  }));
  const channels = Object.entries(report.channelBreakdown).sort(([a], [b]) =>
    a.localeCompare(b, 'tr'),
  );

  return (
    <div
      data-testid="teslim-raporu"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Toplam (son {report.sinceDays} gün)
          </p>
          <p data-testid="rapor-toplam" className="mt-1 text-2xl font-semibold tabular-nums">
            {report.total}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Teslim edilebilirlik: {report.deliverabilityPercent.toLocaleString('tr-TR')}%
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Durum Kırılımı
          </p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {statusEntries.map((entry) => (
              <li key={entry.value} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{entry.label}</span>
                <span data-testid={`rapor-${entry.value}`} className="font-medium tabular-nums">
                  {entry.count}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card className="sm:col-span-2 xl:col-span-2">
        <CardContent className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Kanal Bazlı Dağılım
          </p>
          {channels.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Rapor penceresinde bildirim yok.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {channels.map(([channel, counts]) => {
                const channelTotal = Object.values(counts).reduce((sum, n) => sum + n, 0);
                const sent = counts.sent ?? 0;
                return (
                  <li key={channel} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 font-medium">
                      {CHANNEL_LABELS[channel] ?? channel}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-[var(--brand-600)]"
                        style={{ width: `${channelTotal === 0 ? 0 : Math.round((sent / channelTotal) * 100)}%` }}
                      />
                    </span>
                    <span className="w-28 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {sent}/{channelTotal} gönderildi
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
