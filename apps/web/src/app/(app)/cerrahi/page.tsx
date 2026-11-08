'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { SurgeryStatusBadge } from '@/components/surgeries/surgery-status-badge';
import { ErrorState } from '@/components/design-system/state-views';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import type {
  PatientSummary,
  SurgeryCaseDto,
  SurgeryStatus,
} from '@/lib/api-types';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tümü' },
  { value: 'planned', label: 'Planlandı' },
  { value: 'prepped', label: 'Hazırlanıyor' },
  { value: 'in_surgery', label: 'Ameliyatta' },
  { value: 'recovery', label: 'İyileşmede' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'cancelled', label: 'İptal' },
] as const;

export default function SurgeriesPage() {
  const { hasPermission, activeBranchId } = useAuth();
  const canManage = hasPermission('surgery.manage');
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [newOpen, setNewOpen] = useState(false);
  const [detail, setDetail] = useState<SurgeryCaseDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Yeni olgu formu
  const [patientId, setPatientId] = useState('');
  const [vetId, setVetId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [procedure, setProcedure] = useState('');
  const [plannedStart, setPlannedStart] = useState('');
  const [duration, setDuration] = useState('60');
  const [notes, setNotes] = useState('');
  // Anestezi formu
  const [asa, setAsa] = useState('');
  const [induction, setInduction] = useState('');
  const [maintenance, setMaintenance] = useState('');

  const casesQuery = useQuery({
    queryKey: ['surgeries', statusFilter, activeBranchId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const qs = params.toString();
      return api<{ items: SurgeryCaseDto[] }>(`/surgeries${qs ? `?${qs}` : ''}`, {
        branchId: activeBranchId,
      });
    },
    placeholderData: keepPreviousData,
    enabled: canManage,
  });

  const patientsQuery = useQuery({
    queryKey: ['patients', 'secim'],
    queryFn: () => api<PatientSummary[]>('/patients'),
    enabled: newOpen,
  });

  const staffQuery = useQuery({
    queryKey: ['personel', 'secim'],
    queryFn: () => api<Array<{ id: string; firstName: string; lastName: string }>>('/staff/veterinarians'),
    enabled: newOpen,
  });

  const roomsQuery = useQuery({
    queryKey: ['odalar', activeBranchId],
    queryFn: () => api<Array<{ id: string; name: string; kind: string }>>('/rooms', {
      branchId: activeBranchId,
    }),
    enabled: newOpen,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['surgeries'] });
  };

  const createCase = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api<SurgeryCaseDto>('/surgeries', { method: 'POST', body: values, branchId: activeBranchId }),
    onSuccess: () => {
      invalidate();
      setNewOpen(false);
      setPatientId('');
      setVetId('');
      setRoomId('');
      setProcedure('');
      setPlannedStart('');
      setNotes('');
      setFormError(null);
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: Record<string, unknown> }) =>
      api<SurgeryCaseDto>(path, { method: 'POST', body, branchId: activeBranchId }),
    onSuccess: (updated) => {
      invalidate();
      setDetail(updated);
      setFormError(null);
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const anesthesia = useMutation({
    mutationFn: ({ caseId, body }: { caseId: string; body: Record<string, unknown> }) =>
      api<SurgeryCaseDto>(`/surgeries/${caseId}/anesthesia`, {
        method: 'POST',
        body,
        branchId: activeBranchId,
      }),
    onSuccess: (updated) => {
      invalidate();
      setDetail(updated);
      setFormError(null);
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const toggleItem = useMutation({
    mutationFn: ({ caseId, kind, index, done }: { caseId: string; kind: string; index: number; done: boolean }) =>
      api<SurgeryCaseDto>(`/surgeries/${caseId}/checklists/${kind}/items`, {
        method: 'POST',
        body: { index, done },
        branchId: activeBranchId,
      }),
    onSuccess: (updated) => {
      invalidate();
      setDetail(updated);
    },
  });

  const cases = useMemo(() => casesQuery.data?.items ?? [], [casesQuery.data]);

  if (!canManage) {
    return (
      <div className="space-y-6" data-testid="cerrahi-page">
        <h1 className="text-xl font-semibold">Cerrahi Olgular</h1>
        <ErrorState
          title="Yetkiniz yok"
          description="Cerrahi planları görüntülemek için cerrahi yönetimi izni gerekir."
        />
      </div>
    );
  }

  const preChecklist = detail?.checklists.find((c) => c.kind === 'pre');
  const postChecklist = detail?.checklists.find((c) => c.kind === 'post');
  const owner = detail?.owner;

  return (
    <div className="space-y-6" data-testid="cerrahi-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Cerrahi Olgular</h1>
          <p className="text-sm text-muted-foreground">
            Planlama, hazırlık kontrolleri, anestezi çizelgesi ve ameliyat akışı.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="cerrahi-durum-filtre">
              <SelectValue placeholder="Durum" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button data-testid="cerrahi-yeni" onClick={() => setNewOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Yeni Cerrahi Planı
          </Button>
        </div>
      </div>

      {casesQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : casesQuery.isError ? (
        <ErrorState
          title="Cerrahi olgular yüklenemedi"
          description="Kısa süre sonra yeniden deneyin; sorun sürerse API sağlık durumunu kontrol edin."
        />
      ) : (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hasta</TableHead>
                  <TableHead>Prosedür</TableHead>
                  <TableHead>Veteriner</TableHead>
                  <TableHead>Oda</TableHead>
                  <TableHead>Planlanan</TableHead>
                  <TableHead>Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody data-testid="cerrahi-tablo">
                {cases.map((surgeryCase) => (
                  <TableRow
                    key={surgeryCase.id}
                    data-testid="cerrahi-satir"
                    className="cursor-pointer"
                    onClick={() => {
                      setDetail(surgeryCase);
                      setFormError(null);
                      setAsa('');
                      setInduction('');
                      setMaintenance('');
                    }}
                  >
                    <TableCell className="font-medium">{surgeryCase.patient.name}</TableCell>
                    <TableCell>{surgeryCase.procedure}</TableCell>
                    <TableCell>
                      {surgeryCase.veterinarian.firstName} {surgeryCase.veterinarian.lastName}
                    </TableCell>
                    <TableCell>{surgeryCase.room?.name ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(surgeryCase.plannedStart).toLocaleString('tr-TR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </TableCell>
                    <TableCell>
                      <SurgeryStatusBadge status={surgeryCase.status} />
                    </TableCell>
                  </TableRow>
                ))}
                {cases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      {statusFilter === 'all'
                        ? 'Cerrahi planı yok. Yeni Cerrahi Planı ile başlayın.'
                        : 'Bu durumda olgu yok.'}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Yeni cerrahi planı */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent data-testid="cerrahi-yeni-diyalog">
          <DialogHeader>
            <DialogTitle>Yeni Cerrahi Planı</DialogTitle>
            <DialogDescription>
              Olgu hasta/sahip/hekim bağlantılı üretilir; hazırlığa geçişte kontrol listeleri otomatik açılır.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label htmlFor="cerrahi-hasta">Hasta</Label>
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger data-testid="cerrahi-hasta-secim">
                  <SelectValue placeholder="Hasta seçin" />
                </SelectTrigger>
                <SelectContent>
                  {(patientsQuery.data ?? []).map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.name} ({patient.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cerrahi-vet">Veteriner</Label>
              <Select value={vetId} onValueChange={setVetId}>
                <SelectTrigger data-testid="cerrahi-vet-secim">
                  <SelectValue placeholder="Veteriner seçin" />
                </SelectTrigger>
                <SelectContent>
                  {(staffQuery.data ?? []).map((staff) => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.firstName} {staff.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cerrahi-oda">Operasyon odası (opsiyonel)</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger data-testid="cerrahi-oda-secim">
                  <SelectValue placeholder="Oda seçin" />
                </SelectTrigger>
                <SelectContent>
                  {(roomsQuery.data ?? [])
                    .filter((room) => room.kind === 'surgery')
                    .map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cerrahi-prosedur">Prosedür</Label>
              <Input
                id="cerrahi-prosedur"
                data-testid="cerrahi-prosedur"
                value={procedure}
                onChange={(event) => setProcedure(event.target.value)}
                placeholder="Örn. Ovariohisterektomi"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cerrahi-tarih">Planlanan başlangıç</Label>
                <Input
                  id="cerrahi-tarih"
                  data-testid="cerrahi-tarih"
                  type="datetime-local"
                  value={plannedStart}
                  onChange={(event) => setPlannedStart(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cerrahi-sure">Süre (dk)</Label>
                <Input
                  id="cerrahi-sure"
                  data-testid="cerrahi-sure"
                  type="number"
                  min={10}
                  max={720}
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cerrahi-not">Notlar</Label>
              <Textarea
                id="cerrahi-not"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
              />
            </div>
            {formError ? (
              <div role="alert" className="rounded-md border border-destructive/30 bg-[var(--status-danger-bg)] px-3 py-2 text-sm">
                {formError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Vazgeç
            </Button>
            <Button
              data-testid="cerrahi-kaydet"
              disabled={
                !patientId || !vetId || procedure.trim().length < 3 || !plannedStart || createCase.isPending
              }
              onClick={() => {
                setFormError(null);
                const patient = (patientsQuery.data ?? []).find((p) => p.id === patientId);
                createCase.mutate({
                  patientId,
                  ownerId: patient?.owner.id,
                  veterinarianId: vetId,
                  procedure,
                  plannedStart: new Date(plannedStart).toISOString(),
                  plannedDurationMin: Number(duration) || 60,
                  roomId: roomId || undefined,
                  notes: notes || undefined,
                });
              }}
            >
              {createCase.isPending ? 'Kaydediliyor…' : 'Planı Oluştur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Olgu detay: akış + kontrol listeleri + anestezi */}
      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent data-testid="cerrahi-detay-diyalog" className="max-h-[85vh] overflow-y-auto">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  <span className="inline-flex items-center gap-2">
                    <Scissors className="size-4" aria-hidden />
                    {detail.procedure} — {detail.patient.name}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  Sahip: {owner ? `${owner.firstName} ${owner.lastName}` : '—'} · Planlanan:{' '}
                  {new Date(detail.plannedStart).toLocaleString('tr-TR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                  {detail.room ? ` · Oda: ${detail.room.name}` : ''}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <SurgeryStatusBadge status={detail.status} />
                  {detail.actualStart ? (
                    <span className="text-muted-foreground">
                      Başlangıç: {new Date(detail.actualStart).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  ) : null}
                </div>
                {formError ? (
                  <div role="alert" className="rounded-md border border-destructive/30 bg-[var(--status-danger-bg)] px-3 py-2 text-sm">
                    {formError}
                  </div>
                ) : null}

                {detail.status === 'planned' ? (
                  <Button
                    data-testid="cerrahi-hazirliga-gec"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate({ path: `/surgeries/${detail.id}/prep` })
                    }
                  >
                    Hazırlığa Geç (kontrol listeleri açılır)
                  </Button>
                ) : null}

                {preChecklist ? (
                  <div className="rounded-md border px-3 py-2" data-testid="cerrahi-pre-liste">
                    <p className="mb-2 text-sm font-semibold">
                      Ameliyat öncesi kontroller ({preChecklist.done}/{preChecklist.total})
                    </p>
                    <ul className="space-y-1">
                      {preChecklist.items.map((item, index) => (
                        <li key={item.label} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="size-4"
                            data-testid={`cerrahi-pre-madde-${index}`}
                            checked={item.done}
                            disabled={['in_surgery', 'recovery', 'completed', 'cancelled'].includes(detail.status)}
                            onChange={(event) =>
                              toggleItem.mutate({
                                caseId: detail.id,
                                kind: 'pre',
                                index,
                                done: event.target.checked,
                              })
                            }
                          />
                          <span className={item.done ? 'text-muted-foreground line-through' : ''}>
                            {item.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {detail.status === 'prepped' ? (
                  <Button
                    data-testid="cerrahi-baslat"
                    disabled={action.isPending}
                    onClick={() => action.mutate({ path: `/surgeries/${detail.id}/start` })}
                  >
                    Ameliyatı Başlat
                  </Button>
                ) : null}
                {detail.status === 'in_surgery' ? (
                  <Button
                    data-testid="cerrahi-iyilesme"
                    disabled={action.isPending}
                    onClick={() => action.mutate({ path: `/surgeries/${detail.id}/recovery` })}
                  >
                    İyileşmeye Al
                  </Button>
                ) : null}
                {detail.status === 'recovery' ? (
                  <Button
                    data-testid="cerrahi-tamamla"
                    disabled={action.isPending}
                    onClick={() => action.mutate({ path: `/surgeries/${detail.id}/complete` })}
                  >
                    Olguyu Tamamla
                  </Button>
                ) : null}

                {/* Anestezi çizelgesi */}
                <div className="rounded-md border px-3 py-2" data-testid="cerrahi-anestezi">
                  <p className="mb-2 text-sm font-semibold">Anestezi çizelgesi</p>
                  {detail.anesthesia ? (
                    <p className="mb-2 text-xs text-muted-foreground">
                      ASA {detail.anesthesia.asaClass ?? '—'} · İndüksiyon:{' '}
                      {detail.anesthesia.inductionAgent ?? '—'} · İdame:{' '}
                      {detail.anesthesia.maintenanceAgent ?? '—'}
                    </p>
                  ) : (
                    <p className="mb-2 text-xs text-muted-foreground">
                      Henüz kayıt yok; ameliyat öncesi doldurulması önerilir.
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="anestezi-asa">ASA sınıfı</Label>
                      <Select value={asa} onValueChange={setAsa}>
                        <SelectTrigger data-testid="anestezi-asa-secim">
                          <SelectValue placeholder={detail.anesthesia?.asaClass ?? 'Seçin'} />
                        </SelectTrigger>
                        <SelectContent>
                          {['I', 'II', 'III', 'IV', 'V'].map((cls) => (
                            <SelectItem key={cls} value={cls}>
                              ASA {cls}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="anestezi-induksiyon">İndüksiyon ajanı</Label>
                      <Input
                        id="anestezi-induksiyon"
                        value={induction}
                        onChange={(event) => setInduction(event.target.value)}
                        placeholder={detail.anesthesia?.inductionAgent ?? 'Propofol'}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="anestezi-idame">İdame ajanı</Label>
                      <Input
                        id="anestezi-idame"
                        value={maintenance}
                        onChange={(event) => setMaintenance(event.target.value)}
                        placeholder={detail.anesthesia?.maintenanceAgent ?? 'İzofluran'}
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    data-testid="anestezi-kaydet"
                    disabled={anesthesia.isPending}
                    onClick={() =>
                      anesthesia.mutate({
                        caseId: detail.id,
                        body: {
                          asaClass: asa || detail.anesthesia?.asaClass || undefined,
                          inductionAgent: induction || detail.anesthesia?.inductionAgent || undefined,
                          maintenanceAgent: maintenance || detail.anesthesia?.maintenanceAgent || undefined,
                        },
                      })
                    }
                  >
                    {anesthesia.isPending ? 'Kaydediliyor…' : 'Anestezi Kaydını Güncelle'}
                  </Button>
                </div>

                {postChecklist ? (
                  <div className="rounded-md border px-3 py-2" data-testid="cerrahi-post-liste">
                    <p className="mb-2 text-sm font-semibold">
                      Ameliyat sonrası kontroller ({postChecklist.done}/{postChecklist.total})
                    </p>
                    <ul className="space-y-1">
                      {postChecklist.items.map((item, index) => (
                        <li key={item.label} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="size-4"
                            data-testid={`cerrahi-post-madde-${index}`}
                            checked={item.done}
                            disabled={!['recovery', 'completed'].includes(detail.status)}
                            onChange={(event) =>
                              toggleItem.mutate({
                                caseId: detail.id,
                                kind: 'post',
                                index,
                                done: event.target.checked,
                              })
                            }
                          />
                          <span className={item.done ? 'text-muted-foreground line-through' : ''}>
                            {item.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
