'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BedDouble, Plus } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { KennelOccupancyChip } from '@/components/hospital/kennel-occupancy-chip';
import { ErrorState } from '@/components/design-system/state-views';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import type {
  HospitalPanelDto,
  HospitalStayDetailDto,
  HospitalStayDto,
  KennelDto,
  PatientSummary,
} from '@/lib/api-types';

const STATUS_LABELS: Record<string, string> = {
  admitted: 'Yatırıda',
  transferred: 'Transfer',
  discharged: 'Taburcu',
};

export default function HospitalPage() {
  const { hasPermission, activeBranchId } = useAuth();
  const canManage = hasPermission('hospital.manage');
  const canConsume = hasPermission('inventory.consume');
  const queryClient = useQueryClient();

  const [admitOpen, setAdmitOpen] = useState(false);
  const [detail, setDetail] = useState<HospitalStayDetailDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Kabul formu
  const [admitPatientId, setAdmitPatientId] = useState('');
  const [admitKennelId, setAdmitKennelId] = useState('');
  const [admitVetId, setAdmitVetId] = useState('');
  const [admitReason, setAdmitReason] = useState('');
  // Gözlem formu
  const [obsTemp, setObsTemp] = useState('');
  const [obsHeart, setObsHeart] = useState('');
  const [obsResp, setObsResp] = useState('');
  const [obsNotes, setObsNotes] = useState('');
  // Tedavi formu
  const [medProductId, setMedProductId] = useState('');
  const [medWarehouseId, setMedWarehouseId] = useState('');
  const [medQty, setMedQty] = useState('');
  const [medDose, setMedDose] = useState('');
  const [medRoute, setMedRoute] = useState('');
  // Transfer
  const [transferKennelId, setTransferKennelId] = useState('');
  // Taburculuk
  const [dischargeSummary, setDischargeSummary] = useState('');

  const panelQuery = useQuery({
    queryKey: ['hospital-panel', activeBranchId],
    queryFn: () => api<HospitalPanelDto>('/hospital/panel', { branchId: activeBranchId }),
    enabled: canManage,
    refetchInterval: 20_000,
  });

  const kennelsQuery = useQuery({
    queryKey: ['kennels', activeBranchId],
    queryFn: () => api<{ items: KennelDto[] }>('/hospital/kennels', { branchId: activeBranchId }),
    enabled: canManage,
  });

  const patientsQuery = useQuery({
    queryKey: ['patients', 'secim'],
    queryFn: () => api<PatientSummary[]>('/patients'),
    enabled: admitOpen,
  });

  const staffQuery = useQuery({
    queryKey: ['personel', 'secim'],
    queryFn: () => api<Array<{ id: string; firstName: string; lastName: string }>>('/staff/veterinarians'),
    enabled: admitOpen,
  });

  const productsQuery = useQuery({
    queryKey: ['urunler', 'secim'],
    queryFn: () => api<{ items: Array<{ id: string; code: string; name: string }> }>('/products'),
    enabled: detail !== null,
  });

  const warehousesQuery = useQuery({
    queryKey: ['depolar', activeBranchId],
    queryFn: () =>
      api<Array<{ id: string; name: string; isDefault: boolean | null }>>('/warehouses', {
        branchId: activeBranchId,
      }),
    enabled: detail !== null,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['hospital-panel'] });
    void queryClient.invalidateQueries({ queryKey: ['kennels'] });
    void queryClient.invalidateQueries({ queryKey: ['yatis-detay'] });
  };

  const admit = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api<HospitalStayDto>('/hospital/stays', { method: 'POST', body: values, branchId: activeBranchId }),
    onSuccess: () => {
      invalidate();
      setAdmitOpen(false);
      setAdmitPatientId('');
      setAdmitKennelId('');
      setAdmitVetId('');
      setAdmitReason('');
      setFormError(null);
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: Record<string, unknown> }) =>
      api<HospitalStayDto>(path, { method: 'POST', body, branchId: activeBranchId }),
    onSuccess: () => {
      invalidate();
      setFormError(null);
      void refreshDetail();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const observation = useMutation({
    mutationFn: ({ stayId, body }: { stayId: string; body: Record<string, unknown> }) =>
      api<{ id: string }>(`/hospital/stays/${stayId}/observations`, {
        method: 'POST',
        body,
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      invalidate();
      setObsTemp('');
      setObsHeart('');
      setObsResp('');
      setObsNotes('');
      setFormError(null);
      void refreshDetail();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const medication = useMutation({
    mutationFn: ({ stayId, body }: { stayId: string; body: Record<string, unknown> }) =>
      api<{ id: string }>(`/hospital/stays/${stayId}/medications`, {
        method: 'POST',
        body,
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      invalidate();
      setMedProductId('');
      setMedQty('');
      setMedDose('');
      setFormError(null);
      void refreshDetail();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const detailQuery = useQuery({
    queryKey: ['yatis-detay', detail?.id],
    queryFn: () => api<HospitalStayDetailDto>(`/hospital/stays/${detail?.id}`, { branchId: activeBranchId }),
    enabled: detail !== null,
  });

  const refreshDetail = async (): Promise<void> => {
    if (!detail) return;
    const fresh = await api<HospitalStayDetailDto>(`/hospital/stays/${detail.id}`, {
      branchId: activeBranchId,
    });
    setDetail(fresh);
  };

  const panel = panelQuery.data;
  const kennels = useMemo(() => kennelsQuery.data?.items ?? [], [kennelsQuery.data]);
  const activeStays = useMemo(() => panel?.items ?? [], [panel]);
  const stayById = useMemo(() => new Map(activeStays.map((s) => [s.id, s])), [activeStays]);

  if (!canManage) {
    return (
      <div className="space-y-6" data-testid="yatis-page">
        <h1 className="text-xl font-semibold">Yatış Panosu</h1>
        <ErrorState
          title="Yetkiniz yok"
          description="Yatış panosunu görüntülemek için yatış yönetimi izni gerekir."
        />
      </div>
    );
  }

  const detailStay = detailQuery.data ?? detail;

  return (
    <div className="space-y-6" data-testid="yatis-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Yatış Panosu</h1>
          <p className="text-sm text-muted-foreground">
            Aktif yatışlar, kennel doluluğu, günlük takip ve tedavi sarfı.
          </p>
        </div>
        <Button data-testid="yatis-yeni" onClick={() => setAdmitOpen(true)}>
          <Plus className="size-4" aria-hidden />
          Yeni Yatış Kabulü
        </Button>
      </div>

      {panelQuery.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : panelQuery.isError ? (
        <ErrorState
          title="Yatış panosu yüklenemedi"
          description="Kısa süre sonra yeniden deneyin; sorun sürerse API sağlık durumunu kontrol edin."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-3 text-sm" data-testid="yatis-ozet">
            <span className="rounded-md border px-3 py-1.5">
              Aktif yatış: <strong data-testid="yatis-aktif-sayi">{panel?.occupiedKennels ?? 0}</strong>
            </span>
            <span className="rounded-md border px-3 py-1.5">
              Aktif kennel: <strong>{panel?.totalActiveKennels ?? 0}</strong>
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="yatis-kartlar">
            {activeStays.map((stay) => (
              <Card
                key={stay.id}
                className="cursor-pointer"
                data-testid="yatis-kart"
                onClick={() => {
                  setDetail(stay as unknown as HospitalStayDetailDto);
                  setFormError(null);
                  setObsTemp('');
                  setObsNotes('');
                  setDischargeSummary('');
                  setMedQty('');
                  setMedDose('');
                }}
              >
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium" data-testid="yatis-hasta">
                      {stay.patient?.name ?? stay.patientName}
                    </span>
                    <KennelOccupancyChip
                      occupied
                      active
                      size={stay.kennel.size}
                      patientName={stay.patient?.name ?? stay.patientName}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {stay.kennel.code} · {STATUS_LABELS[stay.status] ?? stay.status} ·{' '}
                    {new Date(stay.admittedAt).toLocaleDateString('tr-TR')}
                  </p>
                  <p className="text-xs text-muted-foreground">{stay.admissionReason}</p>
                  {stay.lastObservation ? (
                    <p className="text-xs text-muted-foreground" data-testid="yatis-son-vital">
                      Son vital:{' '}
                      {stay.lastObservation.tempC !== null ? `${stay.lastObservation.tempC}°C · ` : ''}
                      {stay.lastObservation.heartRate !== null ? `${stay.lastObservation.heartRate} atım · ` : ''}
                      {new Date(stay.lastObservation.observedAt).toLocaleString('tr-TR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Gözlem yok</p>
                  )}
                </CardContent>
              </Card>
            ))}
            {activeStays.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="yatis-bos">
                Aktif yatış yok. Yeni Yatış Kabulü ile hasta yatırın.
              </p>
            ) : null}
          </div>

          {/* Kennel doluluk şeridi */}
          <Card>
            <CardContent className="pt-4" data-testid="kennel-seridi">
              <h2 className="mb-3 text-sm font-semibold">Kennel Doluluğu</h2>
              <div className="flex flex-wrap gap-2">
                {kennels.map((kennel) => {
                  const occupant = kennel.occupancy[0];
                  const occupantStay = occupant ? stayById.get(occupant.stayId) : undefined;
                  return (
                    <div key={kennel.id} className="rounded-md border px-2 py-1.5">
                      <p className="text-xs font-medium">{kennel.code}</p>
                      <KennelOccupancyChip
                        occupied={Boolean(occupant)}
                        active={kennel.active}
                        size={kennel.size}
                        patientName={occupantStay?.patient?.name ?? null}
                      />
                    </div>
                  );
                })}
                {kennels.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Kennel tanımı yok.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Yeni yatış kabulü */}
      <Dialog open={admitOpen} onOpenChange={setAdmitOpen}>
        <DialogContent data-testid="yatis-yeni-diyalog">
          <DialogHeader>
            <DialogTitle>Yeni Yatış Kabulü</DialogTitle>
            <DialogDescription>
              Kennel çakışması otomatik kontrol edilir; dolu kafese kabul reddedilir.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label htmlFor="yatis-hasta">Hasta</Label>
              <Select value={admitPatientId} onValueChange={setAdmitPatientId}>
                <SelectTrigger data-testid="yatis-hasta-secim">
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
              <Label htmlFor="yatis-kennel">Kennel</Label>
              <Select value={admitKennelId} onValueChange={setAdmitKennelId}>
                <SelectTrigger data-testid="yatis-kennel-secim">
                  <SelectValue placeholder="Kennel seçin" />
                </SelectTrigger>
                <SelectContent>
                  {kennels
                    .filter((kennel) => kennel.active && kennel.occupancy.length === 0)
                    .map((kennel) => (
                      <SelectItem key={kennel.id} value={kennel.id}>
                        {kennel.code} — {kennel.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="yatis-vet">Veteriner</Label>
              <Select value={admitVetId} onValueChange={setAdmitVetId}>
                <SelectTrigger data-testid="yatis-vet-secim">
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
              <Label htmlFor="yatis-gerekce">Yatış gerekçesi</Label>
              <Textarea
                id="yatis-gerekce"
                data-testid="yatis-gerekce"
                value={admitReason}
                onChange={(event) => setAdmitReason(event.target.value)}
                placeholder="Örn. Sıvı tedavisi, postoperatif gözlem…"
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
            <Button variant="outline" onClick={() => setAdmitOpen(false)}>
              Vazgeç
            </Button>
            <Button
              data-testid="yatis-kabul-kaydet"
              disabled={
                !admitPatientId ||
                !admitKennelId ||
                !admitVetId ||
                admitReason.trim().length < 3 ||
                admit.isPending
              }
              onClick={() => {
                setFormError(null);
                const patient = (patientsQuery.data ?? []).find((p) => p.id === admitPatientId);
                admit.mutate({
                  patientId: admitPatientId,
                  ownerId: patient?.owner.id,
                  kennelId: admitKennelId,
                  veterinarianId: admitVetId,
                  admissionReason: admitReason,
                });
              }}
            >
              {admit.isPending ? 'Kaydediliyor…' : 'Kabul Et'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Yatış detay: gözlem + tedavi + transfer + taburculuk */}
      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent data-testid="yatis-detay-diyalog" className="max-h-[85vh] overflow-y-auto">
          {detailStay ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  <span className="inline-flex items-center gap-2">
                    <BedDouble className="size-4" aria-hidden />
                    {detailStay.patient?.name} — {detailStay.kennel.code}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  {STATUS_LABELS[detailStay.status]} · Kabul:{' '}
                  {new Date(detailStay.admittedAt).toLocaleString('tr-TR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                  {detailStay.dischargedAt
                    ? ` · Taburcu: ${new Date(detailStay.dischargedAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}`
                    : ''}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 text-sm">
                <p className="text-muted-foreground">{detailStay.admissionReason}</p>
                {formError ? (
                  <div role="alert" className="rounded-md border border-destructive/30 bg-[var(--status-danger-bg)] px-3 py-2 text-sm">
                    {formError}
                  </div>
                ) : null}

                {/* Günlük vital / gözlem */}
                <div className="rounded-md border px-3 py-2" data-testid="yatis-gozlem-blok">
                  <p className="mb-2 text-sm font-semibold">Gözlem ekle (günlük vital takip)</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="gozlem-temp">Ateş (°C)</Label>
                      <Input
                        id="gozlem-temp"
                        data-testid="gozlem-temp"
                        type="number"
                        step="0.1"
                        value={obsTemp}
                        onChange={(event) => setObsTemp(event.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="gozlem-kalp">Nabız</Label>
                      <Input
                        id="gozlem-kalp"
                        data-testid="gozlem-kalp"
                        type="number"
                        value={obsHeart}
                        onChange={(event) => setObsHeart(event.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="gozlem-solunum">Solunum</Label>
                      <Input
                        id="gozlem-solunum"
                        data-testid="gozlem-solunum"
                        type="number"
                        value={obsResp}
                        onChange={(event) => setObsResp(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    <Label htmlFor="gozlem-not">Not</Label>
                    <Input
                      id="gozlem-not"
                      data-testid="gozlem-not"
                      value={obsNotes}
                      onChange={(event) => setObsNotes(event.target.value)}
                      placeholder="İştah, davranış, genel durum…"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="mt-2"
                    data-testid="gozlem-kaydet"
                    disabled={
                      observation.isPending ||
                      (obsTemp === '' && obsHeart === '' && obsResp === '' && obsNotes.trim() === '')
                    }
                    onClick={() =>
                      observation.mutate({
                        stayId: detailStay.id,
                        body: {
                          tempC: obsTemp === '' ? undefined : Number(obsTemp),
                          heartRate: obsHeart === '' ? undefined : Number(obsHeart),
                          respRate: obsResp === '' ? undefined : Number(obsResp),
                          notes: obsNotes || undefined,
                        },
                      })
                    }
                  >
                    {observation.isPending ? 'Kaydediliyor…' : 'Gözlemi Kaydet'}
                  </Button>
                  <ul className="mt-3 space-y-1" data-testid="yatis-gozlem-liste">
                    {(detailStay.observations ?? []).slice(0, 5).map((obs) => (
                      <li key={obs.id} className="text-xs text-muted-foreground">
                        {new Date(obs.observedAt).toLocaleString('tr-TR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}{' '}
                        — {obs.tempC !== null ? `${obs.tempC}°C ` : ''}
                        {obs.heartRate !== null ? `${obs.heartRate} atım ` : ''}
                        {obs.notes ? `· ${obs.notes} ` : ''}
                        ({obs.observedBy})
                      </li>
                    ))}
                    {(detailStay.observations ?? []).length === 0 ? (
                      <li className="text-xs text-muted-foreground">Henüz gözlem yok.</li>
                    ) : null}
                  </ul>
                </div>

                {/* Tedavi sarfı — Faz 08 ortak stok servisi */}
                {!detailStay.dischargedAt ? (
                  <div className="rounded-md border px-3 py-2" data-testid="yatis-tedavi-blok">
                    <p className="mb-2 text-sm font-semibold">Tedavi sarfı (stok düşümlü)</p>
                    {!canConsume ? (
                      <p className="text-xs text-muted-foreground">
                        Stoklu sarf için stok tüketimi izni (inventory.consume) gerekir.
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label htmlFor="tedavi-urun">Ürün</Label>
                            <Select value={medProductId} onValueChange={setMedProductId}>
                              <SelectTrigger data-testid="tedavi-urun-secim">
                                <SelectValue placeholder="Ürün seçin" />
                              </SelectTrigger>
                              <SelectContent>
                                {(productsQuery.data?.items ?? []).map((product) => (
                                  <SelectItem key={product.id} value={product.id}>
                                    {product.name} ({product.code})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="tedavi-depo">Depo</Label>
                            <Select value={medWarehouseId} onValueChange={setMedWarehouseId}>
                              <SelectTrigger data-testid="tedavi-depo-secim">
                                <SelectValue placeholder="Depo seçin" />
                              </SelectTrigger>
                              <SelectContent>
                                {(warehousesQuery.data ?? []).map((warehouse) => (
                                  <SelectItem key={warehouse.id} value={warehouse.id}>
                                    {warehouse.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="tedavi-miktar">Miktar</Label>
                            <Input
                              id="tedavi-miktar"
                              data-testid="tedavi-miktar"
                              type="number"
                              step="0.001"
                              min="0.001"
                              value={medQty}
                              onChange={(event) => setMedQty(event.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="tedavi-doz">Doz/yol</Label>
                            <Input
                              id="tedavi-doz"
                              data-testid="tedavi-doz"
                              value={medDose}
                              onChange={(event) => setMedDose(event.target.value)}
                              placeholder="Örn. 1 ml SC"
                            />
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="mt-2"
                          data-testid="tedavi-kaydet"
                          disabled={
                            medication.isPending ||
                            !medProductId ||
                            !medWarehouseId ||
                            !(Number(medQty) > 0)
                          }
                          onClick={() =>
                            medication.mutate({
                              stayId: detailStay.id,
                              body: {
                                productId: medProductId,
                                warehouseId: medWarehouseId,
                                qty: Number(medQty),
                                dose: medDose || undefined,
                                route: medDose.toLowerCase().includes('iv') ? 'iv' : 'sc',
                              },
                            })
                          }
                        >
                          {medication.isPending ? 'Uygulanıyor…' : 'Uygula ve Stoğu Düş'}
                        </Button>
                      </>
                    )}
                    <ul className="mt-3 space-y-1" data-testid="yatis-tedavi-liste">
                      {(detailStay.medications ?? []).slice(0, 5).map((med) => (
                        <li key={med.id} className="text-xs text-muted-foreground">
                          {new Date(med.administeredAt).toLocaleString('tr-TR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}{' '}
                          — {med.product?.name ?? 'Ürün'} × {med.qty} {med.route ? `(${med.route})` : ''}{' '}
                          {med.hasStockMovement ? '· stok düşüldü' : ''} ({med.administeredBy})
                        </li>
                      ))}
                      {(detailStay.medications ?? []).length === 0 ? (
                        <li className="text-xs text-muted-foreground">Sarf kaydı yok.</li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}

                {/* Transfer + taburculuk */}
                {!detailStay.dischargedAt ? (
                  <div className="grid gap-3 sm:grid-cols-2" data-testid="yatis-islemler">
                    <div className="rounded-md border px-3 py-2 space-y-2">
                      <p className="text-sm font-semibold">Kennel transferi</p>
                      <Select value={transferKennelId} onValueChange={setTransferKennelId}>
                        <SelectTrigger data-testid="transfer-kennel-secim">
                          <SelectValue placeholder="Hedef kennel" />
                        </SelectTrigger>
                        <SelectContent>
                          {kennels
                            .filter(
                              (kennel) =>
                                kennel.active &&
                                kennel.id !== detailStay.kennel.id &&
                                kennel.occupancy.length === 0,
                            )
                            .map((kennel) => (
                              <SelectItem key={kennel.id} value={kennel.id}>
                                {kennel.code} — {kennel.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid="transfer-yap"
                        disabled={!transferKennelId || action.isPending}
                        onClick={() => {
                          setFormError(null);
                          action.mutate({
                            path: `/hospital/stays/${detailStay.id}/transfer`,
                            body: { kennelId: transferKennelId },
                          });
                        }}
                      >
                        Transfer Et
                      </Button>
                    </div>
                    <div className="rounded-md border px-3 py-2 space-y-2">
                      <p className="text-sm font-semibold">Taburculuk</p>
                      <Textarea
                        data-testid="taburculuk-ozet"
                        value={dischargeSummary}
                        onChange={(event) => setDischargeSummary(event.target.value)}
                        placeholder="Taburculuk özeti (zorunlu)…"
                        rows={2}
                      />
                      <Button
                        size="sm"
                        data-testid="taburcu-et"
                        disabled={dischargeSummary.trim().length < 3 || action.isPending}
                        onClick={() => {
                          setFormError(null);
                          action.mutate({
                            path: `/hospital/stays/${detailStay.id}/discharge`,
                            body: { summary: dischargeSummary },
                          });
                        }}
                      >
                        Taburcu Et
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border px-3 py-2" data-testid="yatis-taburcu-ozet">
                    <p className="text-sm font-semibold">Taburculuk özeti</p>
                    <p className="text-sm text-muted-foreground">{detailStay.dischargeSummary}</p>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
