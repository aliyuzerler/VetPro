'use client';

import { CheckCircle2, CircleSlash, Clock, LogIn, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/design-system/state-views';
import { AppointmentStatusBadge } from './appointment-status-badge';
import type { Appointment, AppointmentStatus } from '@/lib/api-types';

/**
 * Faz 05 — takvim görünümü: gün (zaman çizelgesi), hafta (7 sütun) ve ay (6x7
 * ızgara). Görünümler klinik yerel saatiyle (Europe/Istanbul) hesaplanır; randevu
 * verisi API'den gelir. Yerleşim saf CSS grid ile yapılır (taşma güvenli).
 */

export type CalendarViewMode = 'day' | 'week' | 'month';

const WEEKDAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

/** Klinik yerel tarih parçaları (Europe/Istanbul = sabit UTC+03). */
export function localParts(instant: string | Date): { y: number; m: number; d: number; min: number } {
  const local = new Date(new Date(instant).getTime() + 3 * 60 * 60_000);
  return {
    y: local.getUTCFullYear(),
    m: local.getUTCMonth() + 1,
    d: local.getUTCDate(),
    min: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dayKey(instant: string | Date): string {
  const p = localParts(instant);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

function timeShort(instant: string | Date): string {
  const p = localParts(instant);
  return `${pad(Math.floor(p.min / 60))}:${pad(p.min % 60)}`;
}

export type CalendarActions = {
  onOpenAppointment: (appointment: Appointment) => void;
  onCheckIn: (appointmentId: string) => void;
  onAdvance: (appointmentId: string, status: 'waiting' | 'in_consultation' | 'completed') => void;
  onNoShow: (appointmentId: string) => void;
  onCancel: (appointment: Appointment) => void;
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

function typeClass(colorKey: string): string {
  return TYPE_COLOR_CLASSES[colorKey] ?? TYPE_COLOR_CLASSES.brand;
}

/** Kart içindeki izinli sonraki durumlar (API makinesiyle aynı sıra). */
const NEXT_ACTIONS: Partial<Record<AppointmentStatus, { status: 'waiting' | 'in_consultation' | 'completed'; label: string }[]>> = {
  arrived: [{ status: 'waiting', label: 'Beklemeye Al' }],
  waiting: [{ status: 'in_consultation', label: 'Muayeneye Al' }],
  in_consultation: [{ status: 'completed', label: 'Tamamla' }],
};

function AppointmentActions({
  appointment,
  actions,
  compact = false,
}: {
  appointment: Appointment;
  actions: CalendarActions;
  compact?: boolean;
}) {
  if (!actions.canManage) return null;
  return (
    <div className={compact ? 'mt-1 flex flex-wrap gap-1' : 'mt-2 flex flex-wrap gap-1.5'}>
      {appointment.status === 'scheduled' && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => actions.onCheckIn(appointment.id)}
          data-testid={`check-in-${appointment.id}`}
        >
          <LogIn className="size-3.5" aria-hidden />
          Check-in
        </Button>
      )}
      {(NEXT_ACTIONS[appointment.status] ?? []).map((action) => (
        <Button
          key={action.status}
          size="sm"
          variant="outline"
          onClick={() => actions.onAdvance(appointment.id, action.status)}
        >
          {action.label}
        </Button>
      ))}
      {(appointment.status === 'scheduled' || appointment.status === 'arrived' || appointment.status === 'waiting') && (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => actions.onNoShow(appointment.id)}
            aria-label={`Gelmedi — ${appointment.patient.name} (${appointment.patient.code})`}
          >
            <CircleSlash className="size-3.5" aria-hidden />
            {!compact && 'Gelmedi'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => actions.onCancel(appointment)}
            aria-label={`İptal — ${appointment.patient.name} (${appointment.patient.code}) randevusu`}
            data-testid={`cancel-appointment-${appointment.id}`}
          >
            <XCircle className="size-3.5" aria-hidden />
            {!compact && 'İptal'}
          </Button>
        </>
      )}
    </div>
  );
}

function AppointmentRow({
  appointment,
  actions,
}: {
  appointment: Appointment;
  actions: CalendarActions;
}) {
  return (
    <div
      data-testid={`appointment-row-${appointment.id}`}
      className="flex flex-col gap-1.5 rounded-lg border p-3 md:flex-row md:items-start md:justify-between"
    >
      <div className="flex gap-3">
        <span className="mt-0.5 inline-flex items-center gap-1 text-sm font-semibold tabular-nums">
          <Clock className="size-3.5 text-muted-foreground" aria-hidden />
          {timeShort(appointment.scheduledStart)}–{timeShort(appointment.scheduledEnd)}
        </span>
        <div>
          <button
            type="button"
            className="text-left text-sm font-semibold underline-offset-4 hover:underline"
            onClick={() => actions.onOpenAppointment(appointment)}
            data-testid={`open-appointment-${appointment.id}`}
          >
            {appointment.patient.name} ({appointment.patient.code})
          </button>
          <p className="text-xs text-muted-foreground">
            {appointment.owner.firstName} {appointment.owner.lastName} ·{' '}
            {appointment.staff.firstName} {appointment.staff.lastName}
            {appointment.room ? ` · ${appointment.room.name}` : ''}
          </p>
          {appointment.patient.alerts.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1">
              {appointment.patient.alerts.map((alert) => (
                <span
                  key={alert.label}
                  className="inline-flex items-center rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-900"
                >
                  {alert.label}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col items-start gap-2 md:items-end">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={typeClass(appointment.type.colorKey)}>
            {appointment.type.name}
          </Badge>
          <AppointmentStatusBadge status={appointment.status} />
        </div>
        <AppointmentActions appointment={appointment} actions={actions} />
      </div>
    </div>
  );
}

function DayView({
  appointments,
  actions,
}: {
  appointments: Appointment[];
  actions: CalendarActions;
}) {
  if (appointments.length === 0) {
    return (
      <EmptyState
        title="Bu gün için randevu yok"
        description="Yeni Randevu düğmesiyle ekleyebilirsiniz."
      />
    );
  }
  return (
    <div className="flex flex-col gap-2" aria-label="Gün görünümü">
      {appointments.map((appointment) => (
        <AppointmentRow key={appointment.id} appointment={appointment} actions={actions} />
      ))}
    </div>
  );
}

function WeekView({
  appointments,
  weekDays,
  actions,
}: {
  appointments: Appointment[];
  weekDays: { key: string; dayOfMonth: number; weekdayLabel: string; isToday: boolean }[];
  actions: CalendarActions;
}) {
  return (
    <div
      className="grid grid-cols-7 gap-2 overflow-x-auto"
      aria-label="Hafta görünümü"
      data-testid="calendar-week-grid"
    >
      {weekDays.map((day) => {
        const dayAppointments = appointments.filter(
          (appointment) => dayKey(appointment.scheduledStart) === day.key,
        );
        return (
          <div
            key={day.key}
            className={`min-w-[120px] rounded-lg border p-2 ${
              day.isToday ? 'border-brand-300 bg-brand-50/60' : 'bg-card'
            }`}
          >
            <p className="mb-1.5 text-center text-xs font-semibold">
              {day.weekdayLabel} {day.dayOfMonth}
            </p>
            <div className="flex flex-col gap-1">
              {dayAppointments.length === 0 ? (
                <p className="text-center text-[11px] text-muted-foreground">—</p>
              ) : (
                dayAppointments.map((appointment) => (
                  <button
                    key={appointment.id}
                    type="button"
                    className={`rounded border px-1.5 py-1 text-left text-[11px] leading-tight ${typeClass(
                      appointment.type.colorKey,
                    )}`}
                    onClick={() => actions.onOpenAppointment(appointment)}
                    data-testid={`week-chip-${appointment.id}`}
                  >
                    <span className="font-semibold tabular-nums">
                      {timeShort(appointment.scheduledStart)}
                    </span>{' '}
                    {appointment.patient.name}
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({
  appointments,
  monthCells,
  actions,
}: {
  appointments: Appointment[];
  monthCells: { key: string; dayOfMonth: number; inMonth: boolean; isToday: boolean }[];
  actions: CalendarActions;
}) {
  return (
    <div
      className="grid grid-cols-7 gap-1.5"
      aria-label="Ay görünümü"
      data-testid="calendar-month-grid"
    >
      {WEEKDAY_LABELS.map((label) => (
        <div key={label} className="text-center text-xs font-semibold text-muted-foreground">
          {label}
        </div>
      ))}
      {monthCells.map((cell) => {
        const dayAppointments = appointments.filter(
          (appointment) => dayKey(appointment.scheduledStart) === cell.key,
        );
        const activeCount = dayAppointments.filter((appointment) =>
          ['scheduled', 'arrived', 'waiting', 'in_consultation'].includes(appointment.status),
        ).length;
        return (
          <div
            key={cell.key}
            className={`min-h-[84px] rounded-md border p-1.5 ${
              !cell.inMonth ? 'bg-muted/40 text-muted-foreground' : 'bg-card'
            } ${cell.isToday ? 'border-brand-400' : ''}`}
          >
            <p className="text-xs font-medium">{cell.dayOfMonth}</p>
            <div className="mt-1 flex flex-col gap-0.5">
              {dayAppointments.slice(0, 3).map((appointment) => (
                <button
                  key={appointment.id}
                  type="button"
                  className={`truncate rounded border px-1 text-left text-[10px] leading-tight ${typeClass(
                    appointment.type.colorKey,
                  )}`}
                  onClick={() => actions.onOpenAppointment(appointment)}
                >
                  {timeShort(appointment.scheduledStart)} {appointment.patient.name}
                </button>
              ))}
              {dayAppointments.length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{dayAppointments.length - 3} randevu
                </span>
              )}
            </div>
            {activeCount > 0 && (
              <p className="sr-only">{activeCount} aktif randevu</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CalendarBoard({
  view,
  appointments,
  weekDays,
  monthCells,
  title,
  actions,
}: {
  view: CalendarViewMode;
  appointments: Appointment[];
  weekDays: { key: string; dayOfMonth: number; weekdayLabel: string; isToday: boolean }[];
  monthCells: { key: string; dayOfMonth: number; inMonth: boolean; isToday: boolean }[];
  title: string;
  actions: CalendarActions;
}) {
  return (
    <Card data-testid="calendar-board">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {view === 'day' && <DayView appointments={appointments} actions={actions} />}
        {view === 'week' && (
          <WeekView appointments={appointments} weekDays={weekDays} actions={actions} />
        )}
        {view === 'month' && (
          <MonthView appointments={appointments} monthCells={monthCells} actions={actions} />
        )}
        {appointments.length > 0 && view === 'day' && (
          <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5" aria-hidden />
            {appointments.filter((a) => a.status === 'completed').length} tamamlandı ·{' '}
            {appointments.length} toplam
          </p>
        )}
      </CardContent>
    </Card>
  );
}
