'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hourglass } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState } from '@/components/design-system/state-views';
import { WaitlistTable } from '@/components/appointments/waitlist-table';
import { todayISOInTZ } from '@/components/appointments/appointment-form-dialog';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api-client';
import type {
  AppointmentTypeOption,
  PatientSummary,
  RoomOption,
  StaffMember,
  WaitlistEntry,
} from '@/lib/api-types';

/**
 * Faz 05 — bekleme listesi sayfası. Yeni kayıt (hasta araması ile), randevuya
 * çevirme ve iptal akışları gerçek API üzerinden yürütülür.
 */
export default function WaitlistPage() {
  const { session, activeBranchId } = useAuth();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [bookTarget, setBookTarget] = useState<WaitlistEntry | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Ekleme formu durumları
  const [patientQuery, setPatientQuery] = useState('');
  const [patientId, setPatientId] = useState('');
  const [patientLabel, setPatientLabel] = useState('');
  const [typeId, setTypeId] = useState('none');
  const [staffId, setStaffId] = useState('none');
  const [preferredDate, setPreferredDate] = useState('');
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Randevuya çevirme formu durumları
  const [bookDate, setBookDate] = useState('');
  const [bookStart, setBookStart] = useState('10:00');
  const [bookDuration, setBookDuration] = useState(20);
  const [bookRoom, setBookRoom] = useState('none');
  const [bookError, setBookError] = useState<string | null>(null);

  const canManage = Boolean(session?.permissions.includes('appointment.manage'));

  const waitlistQuery = useQuery({
    queryKey: ['waitlist', activeBranchId],
    // Tüm kayıtlar listelenir; randevuya çevrilen/iptal edilenler rozetle ayrılır.
    queryFn: () => api<WaitlistEntry[]>('/waitlist'),
  });

  const typesQuery = useQuery({
    queryKey: ['appointment-types'],
    queryFn: () => api<AppointmentTypeOption[]>('/appointment-types'),
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
        }[]
      >('/staff'),
  });

  const roomsQuery = useQuery({
    queryKey: ['rooms-list'],
    queryFn: () => api<RoomOption[]>('/rooms'),
  });

  const patientsQuery = useQuery({
    queryKey: ['patient-search', patientQuery],
    queryFn: () =>
      api<PatientSummary[]>(`/patients?search=${encodeURIComponent(patientQuery)}&take=8`),
    enabled: addOpen && patientQuery.trim().length >= 2,
  });

  /** Randevuya çevirme formu; hedef seçildiğinde aynı render'da başlatılır (effect yok). */
  function openBookDialog(entry: WaitlistEntry): void {
    setBookError(null);
    setBookDate(entry.preferredDate ?? todayISOInTZ());
    setBookStart(
      entry.preferredStartMin !== null
        ? `${pad(Math.floor(entry.preferredStartMin / 60))}:${pad(entry.preferredStartMin % 60)}`
        : '10:00',
    );
    setBookDuration(entry.type?.durationMin ?? 20);
    setBookRoom('none');
    setBookTarget(entry);
  }

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    void queryClient.invalidateQueries({ queryKey: ['appointments'] });
    void queryClient.invalidateQueries({ queryKey: ['flowboard'] });
  };

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<WaitlistEntry>('/waitlist', { method: 'POST', body }),
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
      resetForm();
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Bilinmeyen hata'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api<WaitlistEntry>(`/waitlist/${id}/cancel`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Bilinmeyen hata'),
  });

  function resetForm() {
    setPatientQuery('');
    setPatientId('');
    setPatientLabel('');
    setTypeId('none');
    setStaffId('none');
    setPreferredDate('');
    setWindowStart('');
    setWindowEnd('');
    setNote('');
  }

  function pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  function timeToMin(value: string): number {
    const [h, m] = value.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  /** Klinik yerel gün+dakika → offset'li ISO instant (Europe/Istanbul sabit +03). */
  function localInstant(dateISO: string, min: number): string {
    const [y, mo, d] = dateISO.split('-').map(Number);
    return new Date(Date.UTC(y, mo - 1, d, 0, min) - 3 * 60 * 60_000).toISOString();
  }

  async function bookFromWaitlist() {
    if (!bookTarget) return;
    setBookError(null);
    try {
      await api(`/waitlist/${bookTarget.id}/book`, {
        method: 'POST',
        body: {
          startAt: localInstant(bookDate, timeToMin(bookStart)),
          endAt: localInstant(bookDate, timeToMin(bookStart) + bookDuration),
          ...(bookRoom !== 'none' ? { roomId: bookRoom } : {}),
        },
      });
      invalidate();
      setBookTarget(null);
    } catch (error) {
      setBookError(
        error instanceof ApiError
          ? error.message
          : 'Randevuya çevirme başarısız oldu',
      );
    }
  }

  async function submitAdd() {
    setSaving(true);
    try {
      await createMutation.mutateAsync({
        patientId,
        ...(typeId !== 'none' ? { appointmentTypeId: typeId } : {}),
        ...(staffId !== 'none' ? { preferredStaffId: staffId } : {}),
        ...(preferredDate ? { preferredDate } : {}),
        ...(windowStart ? { preferredStartMin: timeToMin(windowStart) } : {}),
        ...(windowEnd ? { preferredEndMin: timeToMin(windowEnd) } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
    } finally {
      setSaving(false);
    }
  }

  const canAdd = Boolean(patientId) && !saving;
  const canBook = Boolean(bookTarget && bookDate && bookStart);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Hourglass className="size-6 text-brand-700" aria-hidden />
            Bekleme Listesi
          </h1>
          <p className="text-sm text-muted-foreground">
            Uygun slot bulunamayan hastalar burada kuyruğa alınır; slot açıldığında randevuya
            çevrilir.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setAddOpen(true)} data-testid="add-waitlist-button">
            Bekleme Kaydı Ekle
          </Button>
        )}
      </div>

      {actionError && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {actionError}
        </p>
      )}

      {waitlistQuery.isLoading && !waitlistQuery.data ? (
        <Skeleton className="h-64" aria-busy="true" aria-label="Bekleme listesi yükleniyor" />
      ) : waitlistQuery.isError ? (
        <ErrorState
          title="Bekleme listesi yüklenemedi"
          description={
            waitlistQuery.error instanceof Error ? waitlistQuery.error.message : 'Bilinmeyen hata'
          }
          onRetry={() => void waitlistQuery.refetch()}
        />
      ) : (
        <WaitlistTable
          entries={waitlistQuery.data ?? []}
          isLoading={false}
          isError={false}
          onRetry={() => void waitlistQuery.refetch()}
          onBook={openBookDialog}
          onCancel={(id) => cancelMutation.mutate(id)}
          canManage={canManage}
        />
      )}

      {/* Yeni bekleme kaydı diyaloğu */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bekleme Kaydı Ekle</DialogTitle>
            <DialogDescription>
              Hasta araması API üzerinden yapılır; tercih ettiği gün ve saat aralığı kaydedilir.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="waitlist-patient">Hasta</Label>
              <Input
                id="waitlist-patient"
                placeholder="Hasta adı, kodu veya sahibi ara (en az 2 harf)"
                value={patientQuery}
                onChange={(event) => setPatientQuery(event.target.value)}
                data-testid="waitlist-patient-search"
              />
              {patientQuery.trim().length >= 2 && (
                <ul className="max-h-40 overflow-y-auto rounded-md border">
                  {(patientsQuery.data ?? []).map((patient) => (
                    <li key={patient.id}>
                      <button
                        type="button"
                        className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          setPatientId(patient.id);
                          setPatientLabel(`${patient.name} (${patient.code})`);
                          setPatientQuery('');
                        }}
                      >
                        {patient.name} ({patient.code}) — {patient.owner.firstName}{' '}
                        {patient.owner.lastName}
                      </button>
                    </li>
                  ))}
                  {(patientsQuery.data ?? []).length === 0 && !patientsQuery.isFetching && (
                    <li className="p-2 text-sm text-muted-foreground">Sonuç yok</li>
                  )}
                </ul>
              )}
              {patientId && <p className="text-xs text-brand-700">Seçili: {patientLabel}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="waitlist-type">Randevu türü</Label>
                <Select value={typeId} onValueChange={setTypeId}>
                  <SelectTrigger id="waitlist-type" aria-label="Randevu türü">
                    <SelectValue placeholder="Seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Belirsiz</SelectItem>
                    {(typesQuery.data ?? [])
                      .filter((type) => type.active)
                      .map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="waitlist-staff">Tercih edilen hekim</Label>
                <Select value={staffId} onValueChange={setStaffId}>
                  <SelectTrigger id="waitlist-staff" aria-label="Tercih edilen hekim">
                    <SelectValue placeholder="Fark etmez" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fark etmez</SelectItem>
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
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="waitlist-date">Gün</Label>
                <Input
                  id="waitlist-date"
                  type="date"
                  value={preferredDate}
                  onChange={(event) => setPreferredDate(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="waitlist-window-start">Başlangıç</Label>
                <Input
                  id="waitlist-window-start"
                  type="time"
                  value={windowStart}
                  onChange={(event) => setWindowStart(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="waitlist-window-end">Bitiş</Label>
                <Input
                  id="waitlist-window-end"
                  type="time"
                  value={windowEnd}
                  onChange={(event) => setWindowEnd(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="waitlist-note">Not</Label>
              <Textarea
                id="waitlist-note"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Örn. öğleden sonra günü tercihi"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Vazgeç
            </Button>
            <Button onClick={() => void submitAdd()} disabled={!canAdd}>
              {saving ? 'Kaydediliyor…' : 'Kaydı Ekle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Randevuya çevirme diyaloğu */}
      <Dialog open={Boolean(bookTarget)} onOpenChange={(open) => !open && setBookTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Randevuya Çevir</DialogTitle>
            <DialogDescription>
              {bookTarget?.patient.name} ({bookTarget?.patient.code}) — çakışma ve çalışma saati
              kuralları randevu oluştururken aynen uygulanır.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="book-date">Gün</Label>
                <Input
                  id="book-date"
                  type="date"
                  value={bookDate}
                  onChange={(event) => setBookDate(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="book-start">Başlangıç</Label>
                <Input
                  id="book-start"
                  type="time"
                  value={bookStart}
                  onChange={(event) => setBookStart(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="book-duration">Süre (dk)</Label>
                <Input
                  id="book-duration"
                  type="number"
                  min={5}
                  step={5}
                  value={bookDuration}
                  onChange={(event) => setBookDuration(Number(event.target.value) || 5)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="book-room">Oda</Label>
              <Select value={bookRoom} onValueChange={setBookRoom}>
                <SelectTrigger id="book-room" aria-label="Oda">
                  <SelectValue placeholder="Seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Oda atanmasın</SelectItem>
                  {(roomsQuery.data ?? [])
                    .filter(
                      (room) => !activeBranchId || room.branchId === activeBranchId,
                    )
                    .map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {bookError && (
              <p
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                {bookError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookTarget(null)}>
              Vazgeç
            </Button>
            <Button onClick={() => void bookFromWaitlist()} disabled={!canBook}>
              Randevu Oluştur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
