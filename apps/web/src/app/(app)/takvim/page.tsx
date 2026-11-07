'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorState } from '@/components/design-system/state-views';
import { CalendarBoard, type CalendarViewMode } from '@/components/appointments/calendar-board';
import {
  AppointmentFormDialog,
  localToISOInstant,
  todayISOInTZ,
} from '@/components/appointments/appointment-form-dialog';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import type { Appointment, RoomOption } from '@/lib/api-types';

/**
 * Faz 05 — randevu takvimi: gün/hafta/ay görünümleri, hekim/oda filtreleri,
 * oluşturma/düzenleme/iptal ve durum geçişleri. Aralık klinik yerel saatiyle
 * hesaplanır ve API'ye UTC instant olarak gönderilir; kurallar API'de uygulanır.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateToISO(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${y}-${pad(m)}-${pad(d)}`;
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const WEEKDAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export default function CalendarPage() {
  const { session, activeBranchId } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<CalendarViewMode>('day');
  const [anchorISO, setAnchorISO] = useState(todayISOInTZ());
  const [staffFilter, setStaffFilter] = useState('all');
  const [roomFilter, setRoomFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const canManage = Boolean(session?.permissions.includes('appointment.manage'));
  const canOverride = Boolean(session?.permissions.includes('appointment.override'));

  /** Aralık hesabı: gün [anchor, +1d); hafta Pazartesi başlangıçlı 7 gün; ay 6x7 ızgara. */
  const { fromISO, toISO, title, weekDays, monthCells } = useMemo(() => {
    const anchor = parseISO(anchorISO);
    const weekdayMon0 = (anchor.getDay() + 6) % 7;
    if (view === 'day') {
      const next = new Date(anchor);
      next.setDate(next.getDate() + 1);
      return {
        fromISO: anchorISO,
        toISO: dateToISO(next),
        title: anchor.toLocaleDateString('tr-TR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          weekday: 'long',
        }),
        weekDays: [],
        monthCells: [],
      };
    }
    if (view === 'week') {
      const monday = new Date(anchor);
      monday.setDate(monday.getDate() - weekdayMon0);
      const days = Array.from({ length: 7 }, (_, index) => {
        const day = new Date(monday);
        day.setDate(monday.getDate() + index);
        return {
          key: dateToISO(day),
          dayOfMonth: day.getDate(),
          weekdayLabel: WEEKDAY_LABELS[index],
          isToday: dateToISO(day) === todayISOInTZ(),
        };
      });
      const end = new Date(monday);
      end.setDate(monday.getDate() + 7);
      const lastDay = new Date(end.getTime() - 86_400_000);
      const weekTitle = `${monday.getDate()} ${monday.toLocaleDateString('tr-TR', { month: 'long' })} – ${lastDay.getDate()} ${lastDay.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}`;
      return {
        fromISO: dateToISO(monday),
        toISO: dateToISO(end),
        title: weekTitle,
        weekDays: days,
        monthCells: [],
      };
    }
    // Ay: 1 günüyle başlayan Pazartesi'li 6x7 ızgara
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = new Date(monthStart);
    gridStart.setDate(gridStart.getDate() - ((monthStart.getDay() + 6) % 7));
    const cells = Array.from({ length: 42 }, (_, index) => {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      return {
        key: dateToISO(day),
        dayOfMonth: day.getDate(),
        inMonth: day.getMonth() === anchor.getMonth(),
        isToday: dateToISO(day) === todayISOInTZ(),
      };
    });
    return {
      fromISO: dateToISO(gridStart),
      toISO: dateToISO(new Date(gridStart.getTime() + 42 * 86_400_000)),
      title: anchor.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }),
      weekDays: [],
      monthCells: cells,
    };
  }, [view, anchorISO]);

  const appointmentsQuery = useQuery({
    queryKey: ['appointments', view, fromISO, staffFilter, roomFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        from: localToISOInstant(fromISO, 0),
        to: localToISOInstant(toISO, 0),
        includeClosed: 'true',
      });
      if (staffFilter !== 'all') params.set('staffId', staffFilter);
      if (roomFilter !== 'all') params.set('roomId', roomFilter);
      return api<Appointment[]>(`/appointments?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

  const staffQuery = useQuery({
    queryKey: ['staff-list'],
    queryFn: () =>
      api<
        {
          id: string;
          firstName: string;
          lastName: string;
          title: string | null;
          active: boolean;
          staffBranches: { branch: { id: string } }[];
        }[]
      >('/staff'),
  });

  const roomsQuery = useQuery({
    queryKey: ['rooms-list'],
    queryFn: () => api<RoomOption[]>('/rooms'),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['appointments'] });
    void queryClient.invalidateQueries({ queryKey: ['flowboard'] });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api<Appointment>(`/appointments/${id}/status`, { method: 'POST', body: { status } }),
    onSuccess: invalidate,
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Bilinmeyen hata'),
  });

  const checkInMutation = useMutation({
    mutationFn: (id: string) =>
      api<Appointment>(`/appointments/${id}/check-in`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Bilinmeyen hata'),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api<Appointment>(`/appointments/${id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      invalidate();
      setCancelTarget(null);
      setCancelReason('');
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Bilinmeyen hata'),
  });

  function shift(direction: 1 | -1) {
    const anchor = parseISO(anchorISO);
    if (view === 'day') anchor.setDate(anchor.getDate() + direction);
    else if (view === 'week') anchor.setDate(anchor.getDate() + 7 * direction);
    else anchor.setMonth(anchor.getMonth() + direction);
    setAnchorISO(dateToISO(anchor));
  }

  const actions = useMemo(
    () => ({
      onOpenAppointment: (appointment: Appointment) => {
        setEditing(appointment);
        setFormOpen(true);
      },
      onCheckIn: (id: string) => checkInMutation.mutate(id),
      onAdvance: (id: string, status: 'waiting' | 'in_consultation' | 'completed') =>
        statusMutation.mutate({ id, status }),
      onNoShow: (id: string) => statusMutation.mutate({ id, status: 'no_show' }),
      onCancel: (appointment: Appointment) => {
        setCancelTarget(appointment);
        setCancelReason('');
      },
      canManage,
    }),
    [canManage, checkInMutation, statusMutation],
  );

  const branchRooms = (roomsQuery.data ?? []).filter(
    (room) => !activeBranchId || room.branchId === activeBranchId,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <CalendarDays className="size-6 text-brand-700" aria-hidden />
            Randevu Takvimi
          </h1>
          <p className="text-sm text-muted-foreground">
            Gün/hafta/ay görünümü; hekim ve oda filtreleri. Çakışma ve çalışma saati kuralları
            API&apos;de uygulanır.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            data-testid="new-appointment-button"
          >
            <Plus className="size-4" aria-hidden />
            Yeni Randevu
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => shift(-1)} aria-label="Önceki dönem">
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchorISO(todayISOInTZ())}>
            Bugün
          </Button>
          <Button variant="outline" size="sm" onClick={() => shift(1)} aria-label="Sonraki dönem">
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          <span className="ml-1 text-sm font-medium" data-testid="calendar-title">
            {title}
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Takvim görünümü" className="flex rounded-md border">
              {(
                [
                  ['day', 'Gün'],
                  ['week', 'Hafta'],
                  ['month', 'Ay'],
                ] as [CalendarViewMode, string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  aria-pressed={view === mode}
                  className={`px-3 py-1.5 text-sm ${
                    view === mode ? 'bg-brand-600 text-white' : 'hover:bg-accent'
                  }`}
                  data-testid={`view-${mode}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <Label htmlFor="staff-filter" className="text-xs text-muted-foreground">
                Hekim
              </Label>
              <Select value={staffFilter} onValueChange={setStaffFilter}>
                <SelectTrigger
                  id="staff-filter"
                  className="w-[160px]"
                  aria-label="Hekim filtresi"
                  data-testid="staff-filter"
                >
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm hekimler</SelectItem>
                  {(staffQuery.data ?? [])
                    .filter((member) => member.active)
                    .map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.firstName} {member.lastName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1.5">
              <Label htmlFor="room-filter" className="text-xs text-muted-foreground">
                Oda
              </Label>
              <Select value={roomFilter} onValueChange={setRoomFilter}>
                <SelectTrigger
                  id="room-filter"
                  className="w-[160px]"
                  aria-label="Oda filtresi"
                  data-testid="room-filter"
                >
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm odalar</SelectItem>
                  {branchRooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {actionError && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {actionError}
        </p>
      )}

      {appointmentsQuery.isLoading && !appointmentsQuery.data ? (
        <Skeleton className="h-96" aria-busy="true" aria-label="Takvim yükleniyor" />
      ) : appointmentsQuery.isError ? (
        <ErrorState
          title="Randevular yüklenemedi"
          description={
            appointmentsQuery.error instanceof Error
              ? appointmentsQuery.error.message
              : 'Bilinmeyen hata'
          }
          onRetry={() => void appointmentsQuery.refetch()}
        />
      ) : (
        <CalendarBoard
          view={view}
          appointments={appointmentsQuery.data ?? []}
          weekDays={weekDays}
          monthCells={monthCells}
          title={title}
          actions={actions}
        />
      )}

      <AppointmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        canOverride={canOverride}
        onSaved={invalidate}
      />

      {cancelTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Randevu iptal onayı"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-lg bg-card p-4 shadow-lg">
            <h2 className="text-lg font-semibold">Randevuyu İptal Et</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {cancelTarget.patient.name} ({cancelTarget.patient.code}) —{' '}
              {new Date(cancelTarget.scheduledStart).toLocaleString('tr-TR', {
                timeZone: 'Europe/Istanbul',
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </p>
            <Label htmlFor="cancel-reason" className="mt-3">
              İptal gerekçesi
            </Label>
            <Input
              id="cancel-reason"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Örn. sahip iptal etti"
              data-testid="cancel-reason-input"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCancelTarget(null)}>
                Vazgeç
              </Button>
              <Button
                variant="destructive"
                disabled={cancelReason.trim().length < 3}
                onClick={() =>
                  cancelMutation.mutate({ id: cancelTarget.id, reason: cancelReason.trim() })
                }
                data-testid="confirm-cancel-button"
              >
                İptal Et
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
