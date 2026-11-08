'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Plus } from 'lucide-react';
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
import { LabCriticalBadge } from '@/components/lab/lab-critical-badge';
import { LabOrderStatusBadge } from '@/components/lab/lab-order-status-badge';
import { ErrorState } from '@/components/design-system/state-views';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import type {
  LabCriticalResultDto,
  LabOrderDto,
  LabOrderStatus,
  LabTestDto,
  PatientSummary,
} from '@/lib/api-types';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tümü' },
  { value: 'ordered', label: 'İstendi' },
  { value: 'sample_collected', label: 'Numune Alındı' },
  { value: 'in_progress', label: 'Analizde' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'cancelled', label: 'İptal' },
] as const;

const FLAG_LABELS: Record<string, string> = {
  normal: 'Normal',
  low: 'Düşük',
  high: 'Yüksek',
  critical_low: 'Kritik düşük',
  critical_high: 'Kritik yüksek',
  abnormal: 'Anormal',
};

export default function LaboratoryPage() {
  const { hasPermission, activeBranchId } = useAuth();
  const canManage = hasPermission('lab.manage');
  const canAcknowledge = hasPermission('clinical.sign');
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<LabOrderDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Yeni sipariş formu
  const [orderPatientId, setOrderPatientId] = useState('');
  const [orderTestId, setOrderTestId] = useState('');
  const [orderVetId, setOrderVetId] = useState('');
  const [orderPriority, setOrderPriority] = useState('routine');
  const [orderNotes, setOrderNotes] = useState('');
  // Sonuç formu
  const [resultValue, setResultValue] = useState('');
  const [resultNotes, setResultNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  const ordersQuery = useQuery({
    queryKey: ['lab-orders', statusFilter, activeBranchId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const qs = params.toString();
      return api<{ items: LabOrderDto[] }>(`/lab/orders${qs ? `?${qs}` : ''}`, {
        branchId: activeBranchId,
      });
    },
    placeholderData: keepPreviousData,
    enabled: canManage,
  });

  const criticalQuery = useQuery({
    queryKey: ['lab-critical', activeBranchId],
    queryFn: () =>
      api<{ items: LabCriticalResultDto[] }>('/lab/results/critical?window=open', {
        branchId: activeBranchId,
      }),
    enabled: canManage,
    refetchInterval: 30_000,
  });

  const testsQuery = useQuery({
    queryKey: ['lab-tests'],
    queryFn: () => api<LabTestDto[]>('/lab/tests'),
    enabled: newOrderOpen,
  });

  const patientsQuery = useQuery({
    queryKey: ['patients', 'secim'],
    queryFn: () => api<PatientSummary[]>('/patients'),
    enabled: newOrderOpen,
  });

  const staffQuery = useQuery({
    queryKey: ['personel', 'secim'],
    queryFn: () => api<Array<{ id: string; firstName: string; lastName: string; title: string | null }>>('/staff/veterinarians'),
    enabled: newOrderOpen,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['lab-orders'] });
    void queryClient.invalidateQueries({ queryKey: ['lab-critical'] });
  };

  const createOrder = useMutation({
    mutationFn: (values: { patientId: string; testId: string; veterinarianId: string; priority: string; notes: string }) =>
      api<LabOrderDto>('/lab/orders', {
        method: 'POST',
        body: {
          patientId: values.patientId,
          testId: values.testId,
          veterinarianId: values.veterinarianId,
          priority: values.priority,
          notes: values.notes || undefined,
        },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      invalidate();
      setNewOrderOpen(false);
      setOrderPatientId('');
      setOrderTestId('');
      setOrderVetId('');
      setOrderNotes('');
      setFormError(null);
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const action = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: 'POST' | 'PATCH'; body?: Record<string, unknown> }) =>
      api<LabOrderDto>(path, { method, body, branchId: activeBranchId }),
    onSuccess: (updated) => {
      invalidate();
      // Diyalog taze veriyle güncellenir (stale durum göstermesin)
      setDetailOrder(updated);
      setFormError(null);
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const acknowledge = useMutation({
    mutationFn: (resultId: string) =>
      api<{ id: string }>(`/lab/results/${resultId}/acknowledge`, {
        method: 'POST',
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['lab-critical'] });
    },
  });

  const orders = useMemo(() => ordersQuery.data?.items ?? [], [ordersQuery.data]);
  const criticals = useMemo(() => criticalQuery.data?.items ?? [], [criticalQuery.data]);

  if (!canManage) {
    return (
      <div className="space-y-6" data-testid="laboratuvar-page">
        <h1 className="text-xl font-semibold">Laboratuvar</h1>
        <ErrorState
          title="Yetkiniz yok"
          description="Lab siparişlerini görüntülemek için laboratuvar yönetimi izni gerekir."
        />
      </div>
    );
  }

  const detail = detailOrder;
  const openResultForm = (order: LabOrderDto) => {
    setDetailOrder(order);
    setResultValue('');
    setResultNotes('');
    setFormError(null);
  };

  return (
    <div className="space-y-6" data-testid="laboratuvar-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Laboratuvar</h1>
          <p className="text-sm text-muted-foreground">
            Lab istekleri, numune ve sonuç akışı. Kritik sonuçlar yetkili klinisyen onayı bekler.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="lab-durum-filtre">
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
          <Button data-testid="lab-yeni" onClick={() => setNewOrderOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Yeni Lab İsteği
          </Button>
        </div>
      </div>

      {/* Kabul kriteri: kritik sonuç uyarısı yetkili klinisyen ekranında */}
      {criticals.length > 0 ? (
        <Card className="border-destructive/40" data-testid="lab-kritik-panel">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="size-4 text-destructive" aria-hidden />
              <h2 className="text-sm font-semibold">
                Kritik Sonuçlar — {criticals.length} onay bekliyor
              </h2>
            </div>
            <ul className="space-y-2">
              {criticals.map((critical) => (
                <li
                  key={critical.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-[var(--status-danger-bg)] px-3 py-2"
                  data-testid="lab-kritik-satir"
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <LabCriticalBadge flag={critical.flag} acknowledged={false} />
                    <span className="font-medium">{critical.patient.name}</span>
                    <span className="text-muted-foreground">
                      {critical.testName}
                      {critical.value !== null
                        ? ` — ${critical.value} ${critical.unit ?? ''} (kr. aralık ${critical.criticalLow ?? '—'}–${critical.criticalHigh ?? '—'})`
                        : ` — ${critical.valueText ?? ''}`}
                    </span>
                  </div>
                  {canAcknowledge ? (
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="lab-kritik-onayla"
                      disabled={acknowledge.isPending}
                      onClick={() => acknowledge.mutate(critical.id)}
                    >
                      {acknowledge.isPending ? 'Onaylanıyor…' : 'Onayla'}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Onay yetkisi: veteriner hekim
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {ordersQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : ordersQuery.isError ? (
        <ErrorState
          title="Lab siparişleri yüklenemedi"
          description="Kısa süre sonra yeniden deneyin; sorun sürerse API sağlık durumunu kontrol edin."
        />
      ) : (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hasta</TableHead>
                  <TableHead>Test</TableHead>
                  <TableHead>Veteriner</TableHead>
                  <TableHead>Öncelik</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Tarih</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody data-testid="lab-tablo">
                {orders.map((order) => (
                  <TableRow
                    key={order.id}
                    data-testid="lab-satir"
                    className="cursor-pointer"
                    onClick={() => {
                      setDetailOrder(order);
                      setResultValue('');
                      setFormError(null);
                    }}
                  >
                    <TableCell className="font-medium">{order.patient.name}</TableCell>
                    <TableCell>
                      {order.test.name}
                      <span className="ml-1 text-xs text-muted-foreground">({order.test.code})</span>
                    </TableCell>
                    <TableCell>
                      {order.veterinarian.firstName} {order.veterinarian.lastName}
                    </TableCell>
                    <TableCell>
                      {order.priority === 'urgent' ? (
                        <span data-testid="lab-oncelikli" className="font-medium text-destructive">
                          Acil
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Rutin</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <LabOrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(order.orderedAt).toLocaleDateString('tr-TR')}
                    </TableCell>
                  </TableRow>
                ))}
                {orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      {statusFilter === 'all'
                        ? 'Lab siparişi yok. Yeni Lab İsteği ile başlayın.'
                        : 'Bu durumda sipariş yok.'}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Yeni lab isteği */}
      <Dialog open={newOrderOpen} onOpenChange={setNewOrderOpen}>
        <DialogContent data-testid="lab-yeni-diyalog">
          <DialogHeader>
            <DialogTitle>Yeni Lab İsteği</DialogTitle>
            <DialogDescription>
              Test katalogdan seçilir; sonuç uyarısı seçilen veterinere gider.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label htmlFor="lab-hasta">Hasta</Label>
              <Select value={orderPatientId} onValueChange={setOrderPatientId}>
                <SelectTrigger data-testid="lab-hasta-secim">
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
              <Label htmlFor="lab-test">Test</Label>
              <Select value={orderTestId} onValueChange={setOrderTestId}>
                <SelectTrigger data-testid="lab-test-secim">
                  <SelectValue placeholder="Test seçin" />
                </SelectTrigger>
                <SelectContent>
                  {(testsQuery.data ?? []).map((test) => (
                    <SelectItem key={test.id} value={test.id}>
                      {test.name} ({test.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="lab-vet">Yetkili Veteriner</Label>
              <Select value={orderVetId} onValueChange={setOrderVetId}>
                <SelectTrigger data-testid="lab-vet-secim">
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
              <Label htmlFor="lab-oncelik">Öncelik</Label>
              <Select value={orderPriority} onValueChange={setOrderPriority}>
                <SelectTrigger data-testid="lab-oncelik-secim">
                  <SelectValue placeholder="Öncelik" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Rutin</SelectItem>
                  <SelectItem value="urgent">Acil</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="lab-not">Notlar</Label>
              <Textarea
                id="lab-not"
                data-testid="lab-not"
                value={orderNotes}
                onChange={(event) => setOrderNotes(event.target.value)}
                placeholder="Klinik özet, ek istekler…"
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
            <Button variant="outline" onClick={() => setNewOrderOpen(false)}>
              Vazgeç
            </Button>
            <Button
              data-testid="lab-kaydet"
              disabled={!orderPatientId || !orderTestId || !orderVetId || createOrder.isPending}
              onClick={() => {
                setFormError(null);
                createOrder.mutate({
                  patientId: orderPatientId,
                  testId: orderTestId,
                  veterinarianId: orderVetId,
                  priority: orderPriority,
                  notes: orderNotes,
                });
              }}
            >
              {createOrder.isPending ? 'Kaydediliyor…' : 'İsteği Oluştur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sipariş detay + durum akışı */}
      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetailOrder(null);
        }}
      >
        <DialogContent data-testid="lab-detay-diyalog" className="max-h-[85vh] overflow-y-auto">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {detail.test.name} — {detail.patient.name}
                </DialogTitle>
                <DialogDescription>
                  Sipariş akışı: istek → numune → analiz → sonuç. Sonuç girişi siparişi tamamlar.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <LabOrderStatusBadge status={detail.status as LabOrderStatus} />
                  {detail.sample ? (
                    <span className="text-muted-foreground" data-testid="lab-numune-kod">
                      Numune: {detail.sample.labelCode} ({detail.sample.status === 'rejected' ? 'Reddedildi' : 'Alındı'})
                    </span>
                  ) : null}
                  {detail.result ? (
                    <span className="flex items-center gap-1" data-testid="lab-sonuc-ozet">
                      Sonuç: {detail.result.value ?? detail.result.valueText}{' '}
                      {detail.result.unit ?? ''} — {FLAG_LABELS[detail.result.flag] ?? detail.result.flag}
                      {detail.result.isCritical ? (
                        <LabCriticalBadge flag={detail.result.flag} acknowledged={detail.result.acknowledgedAt !== null} />
                      ) : null}
                    </span>
                  ) : null}
                </div>
                {formError ? (
                  <div role="alert" className="rounded-md border border-destructive/30 bg-[var(--status-danger-bg)] px-3 py-2 text-sm">
                    {formError}
                  </div>
                ) : null}

                {detail.status === 'ordered' ? (
                  <Button
                    data-testid="lab-numune-al"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate(
                        { path: `/lab/orders/${detail.id}/collect`, method: 'POST' },
                      )
                    }
                  >
                    Numune Alındı İşaretle
                  </Button>
                ) : null}
                {detail.status === 'sample_collected' ? (
                  <Button
                    data-testid="lab-analiz-baslat"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate({ path: `/lab/orders/${detail.id}/start`, method: 'POST' })
                    }
                  >
                    Analizi Başlat
                  </Button>
                ) : null}
                {detail.status === 'in_progress' ? (
                  <div className="grid gap-2">
                    <Label htmlFor="lab-sonuc-deger">Sayısal sonuç {detail.test.unit ? `(${detail.test.unit})` : ''}</Label>
                    <Input
                      id="lab-sonuc-deger"
                      data-testid="lab-sonuc-deger"
                      type="number"
                      step="any"
                      value={resultValue}
                      onChange={(event) => setResultValue(event.target.value)}
                      placeholder="Örn. 38.5"
                    />
                    <Label htmlFor="lab-sonuc-not">Sonuç notu (opsiyonel)</Label>
                    <Textarea
                      id="lab-sonuc-not"
                      value={resultNotes}
                      onChange={(event) => setResultNotes(event.target.value)}
                      rows={2}
                    />
                    <Button
                      data-testid="lab-sonuc-gir"
                      disabled={resultValue === '' || action.isPending}
                      onClick={() => {
                        setFormError(null);
                        action.mutate({
                          path: `/lab/orders/${detail.id}/results`,
                          method: 'POST',
                          body: { value: Number(resultValue), notes: resultNotes || undefined },
                        });
                      }}
                    >
                      {action.isPending ? 'Giriliyor…' : 'Sonucu Gir'}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Sayısal olmayan testler için API üzerinden metin sonuç (valueText) girilebilir.
                    </p>
                  </div>
                ) : null}
                {!['completed', 'cancelled'].includes(detail.status) ? (
                  <div className="grid gap-2">
                    <Label htmlFor="lab-iptal-gerekce">İptal gerekçesi</Label>
                    <Input
                      id="lab-iptal-gerekce"
                      data-testid="lab-iptal-gerekce"
                      value={cancelReason}
                      onChange={(event) => setCancelReason(event.target.value)}
                      placeholder="Örn. Sahip vazgeçti"
                    />
                    <Button
                      variant="outline"
                      data-testid="lab-iptal"
                      disabled={cancelReason.trim().length < 3 || action.isPending}
                      onClick={() => {
                        setFormError(null);
                        action.mutate({
                          path: `/lab/orders/${detail.id}/cancel`,
                          method: 'POST',
                          body: { reason: cancelReason },
                        });
                      }}
                    >
                      Siparişi İptal Et
                    </Button>
                  </div>
                ) : null}
                {detail.status === 'completed' ? (
                  <p className="text-xs text-muted-foreground">
                    Sipariş tamamlandı {detail.completedAt ? `(${new Date(detail.completedAt).toLocaleString('tr-TR')})` : ''}.
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
