'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api-client';
import type {
  Appointment,
  AppointmentTypeOption,
  PatientSummary,
  RoomOption,
} from '@/lib/api-types';

/**
 * Faz 05 — randevu oluşturma/düzenleme diyaloğu. Hasta araması API'den yapılır;
 * çakışma ve çalışma saati hataları API'nin stabil kodlarıyla ayrıştırılır.
 * Çalışma saati dışı istisnası yalnızca appointment.override izni olan kullanıcıya
 * gösterilir ve gerekçe zorunludur.
 *
 * Radix Dialog kapalıyken içeriği unmount eder; form durumu bu iç bileşende tutulur
 * ve her açılışta editing/initial özelliklerinden taze başlatılır (effect'te
 * setState zinciri yerine mount başlatması — kademeli render önlenir).
 */

export const OUTSIDE_HOURS_CODE = 'APPOINTMENT_OUTSIDE_WORKING_HOURS';

export type AppointmentFormValues = {
  patientId: string;
  appointmentTypeId: string;
  staffId: string;
  roomId: string | null;
  dateISO: string; // YYYY-MM-DD (klinik yerel)
  startMin: number; // yerel gün içi dakika
  durationMin: number;
  notes: string;
  allowOutsideHours: boolean;
  overrideReason: string;
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function minToTime(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export function timeToMin(value: string): number {
  const [h = 0, m = 0] = value.split(':').map(Number);
  return h * 60 + m;
}

/** Klinik yerel gün + dakikayı offset'li ISO instant'a çevirir (Europe/Istanbul sabit +03). */
export function localToISOInstant(dateISO: string, min: number): string {
  const [y = 1970, mo = 1, d = 1] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 0, min) - 3 * 60 * 60_000).toISOString();
}

export function todayISOInTZ(): string {
  const now = new Date(Date.now() + 3 * 60 * 60_000);
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

function editingDefaults(editing: Appointment): AppointmentFormValues {
  const local = new Date(new Date(editing.scheduledStart).getTime() + 3 * 60 * 60_000);
  return {
    patientId: editing.patient.id,
    appointmentTypeId: editing.appointmentTypeId,
    staffId: editing.staffId,
    roomId: editing.roomId,
    dateISO: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    startMin: local.getUTCHours() * 60 + local.getUTCMinutes(),
    durationMin: Math.round(
      (new Date(editing.scheduledEnd).getTime() - new Date(editing.scheduledStart).getTime()) /
        60_000,
    ),
    notes: editing.notes ?? '',
    allowOutsideHours: false,
    overrideReason: '',
  };
}

function newDefaults(initial?: Partial<AppointmentFormValues>): AppointmentFormValues {
  return {
    patientId: initial?.patientId ?? '',
    appointmentTypeId: initial?.appointmentTypeId ?? '',
    staffId: initial?.staffId ?? '',
    roomId: initial?.roomId ?? null,
    dateISO: initial?.dateISO ?? todayISOInTZ(),
    startMin: initial?.startMin ?? 600,
    durationMin: initial?.durationMin ?? 20,
    notes: initial?.notes ?? '',
    allowOutsideHours: false,
    overrideReason: '',
  };
}

/** Diyalog gövdesi — her açılışta remount edilir (durum başlatması mount'ta). */
function FormBody({
  editing,
  initial,
  canOverride,
  onOpenChange,
  onSaved,
}: {
  editing: Appointment | null;
  initial?: Partial<AppointmentFormValues>;
  canOverride: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (saved: Appointment | null) => void;
}) {
  const defaults = editing ? editingDefaults(editing) : newDefaults(initial);
  const [patientQuery, setPatientQuery] = useState('');
  const [patientId, setPatientId] = useState(defaults.patientId);
  const [patientLabel, setPatientLabel] = useState(
    editing ? `${editing.patient.name} (${editing.patient.code})` : '',
  );
  const [typeId, setTypeId] = useState(defaults.appointmentTypeId);
  const [staffId, setStaffId] = useState(defaults.staffId);
  const [roomId, setRoomId] = useState<string>(defaults.roomId ?? 'none');
  const [dateISO, setDateISO] = useState(defaults.dateISO);
  const [startTime, setStartTime] = useState(minToTime(defaults.startMin));
  const [durationMin, setDurationMin] = useState(defaults.durationMin);
  const [notes, setNotes] = useState(defaults.notes);
  const [allowOutside, setAllowOutside] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  const types = useQuery({
    queryKey: ['appointment-types'],
    queryFn: () => api<AppointmentTypeOption[]>('/appointment-types'),
  });

  const staff = useQuery({
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

  const rooms = useQuery({
    queryKey: ['rooms-list'],
    queryFn: () => api<RoomOption[]>('/rooms'),
  });

  const patients = useQuery({
    queryKey: ['patient-search', patientQuery],
    queryFn: () =>
      api<PatientSummary[]>(`/patients?search=${encodeURIComponent(patientQuery)}&take=8`),
    enabled: patientQuery.trim().length >= 2,
    placeholderData: keepPreviousData,
  });

  const patientMatches = useMemo(() => {
    if (!patientQuery.trim()) return [];
    return patients.data ?? [];
  }, [patientQuery, patients.data]);

  async function submit() {
    setSaving(true);
    setSubmitError(null);
    const payload = {
      patientId,
      appointmentTypeId: typeId,
      staffId,
      ...(roomId !== 'none' ? { roomId } : {}),
      startAt: localToISOInstant(dateISO, timeToMin(startTime)),
      endAt: localToISOInstant(dateISO, timeToMin(startTime) + durationMin),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(allowOutside ? { allowOutsideHours: true, overrideReason } : {}),
    };
    try {
      const saved = editing
        ? await api<Appointment>(`/appointments/${editing.id}`, { method: 'PATCH', body: payload })
        : await api<Appointment>('/appointments', { method: 'POST', body: payload });
      onOpenChange(false);
      onSaved(saved);
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error : new ApiError(0, 'Bilinmeyen hata'));
    } finally {
      setSaving(false);
    }
  }

  const canSubmit =
    Boolean(patientId && typeId && staffId && dateISO && startTime) &&
    !(allowOutside && overrideReason.trim().length < 3) &&
    !saving;

  const outsideBlocked =
    submitError?.code === OUTSIDE_HOURS_CODE || submitError?.code === 'APPOINTMENT_BLOCKED';

  return (
    <>
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="appointment-patient">Hasta</Label>
          {editing ? (
            <Input id="appointment-patient" value={patientLabel} readOnly />
          ) : (
            <>
              <Input
                id="appointment-patient"
                placeholder="Hasta adı, kodu veya sahibi ara (en az 2 harf)"
                value={patientQuery}
                onChange={(event) => setPatientQuery(event.target.value)}
                data-testid="appointment-patient-search"
              />
              {patientQuery.trim().length >= 2 && (
                <ul
                  className="max-h-40 overflow-y-auto rounded-md border"
                  aria-label="Hasta arama sonuçları"
                >
                  {patientMatches.length === 0 && !patients.isFetching && (
                    <li className="p-2 text-sm text-muted-foreground">Sonuç yok</li>
                  )}
                  {patientMatches.map((patient) => (
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
                </ul>
              )}
              {patientId && <p className="text-xs text-brand-700">Seçili: {patientLabel}</p>}
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="appointment-type">Randevu türü</Label>
            <Select
              value={typeId}
              onValueChange={(value) => {
                setTypeId(value);
                // Tür değişince varsayılan süre önerilir (düzenlemede mevcut süre korunur)
                const type = types.data?.find((t) => t.id === value);
                if (!editing && type) setDurationMin(type.durationMin);
              }}
            >
              <SelectTrigger
                id="appointment-type"
                aria-label="Randevu türü"
                data-testid="appointment-type-select"
              >
                <SelectValue placeholder="Seçin" />
              </SelectTrigger>
              <SelectContent>
                {(types.data ?? [])
                  .filter((type) => type.active)
                  .map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name} ({type.durationMin} dk)
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="appointment-staff">Hekim</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger
                id="appointment-staff"
                aria-label="Hekim"
                data-testid="appointment-staff-select"
              >
                <SelectValue placeholder="Seçin" />
              </SelectTrigger>
              <SelectContent>
                {(staff.data ?? [])
                  .filter((member) => member.active)
                  .map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.firstName} {member.lastName}
                      {member.title ? ` — ${member.title}` : ''}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="appointment-room">Oda</Label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger
                id="appointment-room"
                aria-label="Oda"
                data-testid="appointment-room-select"
              >
                <SelectValue placeholder="Seçin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Oda atanmasın</SelectItem>
                {(rooms.data ?? [])
                  .filter((room) => room.active)
                  .map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="appointment-date">Tarih</Label>
            <Input
              id="appointment-date"
              type="date"
              value={dateISO}
              onChange={(event) => setDateISO(event.target.value)}
              data-testid="appointment-date-input"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="appointment-start">Başlangıç</Label>
            <Input
              id="appointment-start"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              data-testid="appointment-start-input"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="appointment-duration">Süre (dk)</Label>
            <Input
              id="appointment-duration"
              type="number"
              min={5}
              max={480}
              step={5}
              value={durationMin}
              onChange={(event) => setDurationMin(Number(event.target.value) || 5)}
              data-testid="appointment-duration-input"
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="appointment-notes">Not</Label>
          <Textarea
            id="appointment-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            placeholder="Şikâyet, hazırlık notu…"
          />
        </div>

        {submitError && !outsideBlocked && (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            data-testid="appointment-form-error"
          >
            {submitError.message}
          </p>
        )}

        {submitError?.code === OUTSIDE_HOURS_CODE && (
          <div
            className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"
            data-testid="appointment-override-panel"
          >
            <p className="font-medium text-amber-900">{submitError.message}</p>
            {canOverride ? (
              <div className="mt-2 grid gap-2">
                <label className="flex items-center gap-2 text-amber-900">
                  <Checkbox
                    checked={allowOutside}
                    onCheckedChange={(checked) => setAllowOutside(checked === true)}
                  />
                  Çalışma saatleri dışına izin ver (yetkili istisnası)
                </label>
                {allowOutside && (
                  <Textarea
                    aria-label="İstisna gerekçesi"
                    placeholder="Gerekçe (en az 3 karakter) — denetim defterine yazılır"
                    value={overrideReason}
                    onChange={(event) => setOverrideReason(event.target.value)}
                    rows={2}
                    data-testid="appointment-override-reason"
                  />
                )}
              </div>
            ) : (
              <p className="mt-1 text-amber-800">
                Randevu kural istisnası için yetkiniz yok; yöneticiyle iletişime geçin.
              </p>
            )}
          </div>
        )}

        {submitError?.code === 'APPOINTMENT_BLOCKED' && (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            Plan engeli override edilemez: {submitError.message}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Vazgeç
        </Button>
        <Button onClick={() => void submit()} disabled={!canSubmit}>
          <CalendarPlus className="size-4" aria-hidden />
          {saving ? 'Kaydediliyor…' : editing ? 'Kaydet' : 'Randevu Oluştur'}
        </Button>
      </DialogFooter>
    </>
  );
}

export function AppointmentFormDialog({
  open,
  onOpenChange,
  editing,
  initial,
  canOverride,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Düzenlenen randevu; null ise oluşturma modu */
  editing: Appointment | null;
  /** Oluşturma modunda ön doldurma (bekleme listesi/takvim hücresi) */
  initial?: Partial<AppointmentFormValues>;
  canOverride: boolean;
  onSaved: (saved: Appointment | null) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Randevuyu Düzenle' : 'Yeni Randevu'}</DialogTitle>
          <DialogDescription>
            Çakışan aktif randevu aynı hekim veya oda için engellenir; çalışma saati dışı istisnası
            yetkili onayı ister.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <FormBody
            key={`${editing?.id ?? 'new'}-${initial?.patientId ?? ''}-${initial?.dateISO ?? ''}`}
            editing={editing}
            initial={initial}
            canOverride={canOverride}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
