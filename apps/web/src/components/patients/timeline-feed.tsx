'use client';

import { AlertTriangle, CalendarPlus, FileText, GitMerge, Scale, ShieldPlus } from 'lucide-react';
import type { TimelineEvent } from '@/lib/api-types';

const EVENT_ICONS: Record<TimelineEvent['type'], typeof Scale> = {
  weight: Scale,
  alert: AlertTriangle,
  'alert-resolved': ShieldPlus,
  file: FileText,
  created: CalendarPlus,
  archived: ShieldPlus,
  merge: GitMerge,
  'patient.update': FileText,
};

/**
 * Hasta zaman çizelgesi iskeleti (Faz 04): kilo, uyarı, dosya ve denetim
 * olayları. Faz 06'da muayene/SOAP olayları aynı akışa eklenecek.
 */
export function TimelineFeed({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="timeline-empty">
        Henüz olay yok.
      </p>
    );
  }
  return (
    <ol className="flex flex-col" data-testid="timeline-feed">
      {events.map((event, index) => {
        const Icon = EVENT_ICONS[event.type] ?? FileText;
        return (
          <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
            {index < events.length - 1 ? (
              <span className="absolute left-[11px] top-6 h-full w-px bg-border" aria-hidden />
            ) : null}
            <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border bg-background">
              <Icon className="size-3.5 text-muted-foreground" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium">{event.title}</span>
                <time className="text-xs text-muted-foreground" dateTime={event.at}>
                  {new Date(event.at).toLocaleString('tr-TR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </time>
              </div>
              {event.description ? (
                <p className="text-xs text-muted-foreground">{event.description}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
