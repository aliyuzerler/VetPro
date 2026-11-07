'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Syringe, BellPlus, Send, Ban } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ProtocolTable } from '@/components/vaccines/protocol-table';
import { VaccineDueBadge } from '@/components/vaccines/vaccine-due-badge';
import { ErrorState } from '@/components/design-system/state-views';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import type {
  LotViewDto,
  PatientSummary,
  ProductDto,
  VaccineEventDto,
  VaccineProtocolDto,
  VaccineReminderDto,
  VaccineScheduleEntryDto,
} from '@/lib/api-types';

interface WarehouseRaw {
  id: string;
  name: string;
  branchId: string;
}

type TabKey = 'kayitlar' | 'hatirlatmalar' | 'protokoller';

const TAB_VALUES: TabKey[] = ['kayitlar', 'hatirlatmalar', 'protokoller'];

export default function VaccinesPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const { hasPermission, activeBranchId } = useAuth();
  const canManage = hasPermission('vaccine.manage');
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TabKey>(
    TAB_VALUES.includes(initialTab as TabKey) ? (initialTab as TabKey) : 'kayitlar',
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [schedulePatientId, setSchedulePatientId] = useState('');
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [protocolDialogOpen, setProtocolDialogOpen] = useState(false);
  const [protocolForm, setProtocolForm] = useState({
    productId: '',
    speciesId: 'none',
    name: '',
    firstDoseAgeDays: '60',
    boosterIntervalDays: '365',
    reminderLeadDays: '14',
    doseLabel: '1 ml',
    route: 'deri_alti',
  });

  const patientsQuery = useQuery({
    queryKey: ['patients', 'asi-secim'],
    queryFn: () => api<PatientSummary[]>('/patients'),
    enabled: canManage,
  });

  const eventsQuery = useQuery({
    queryKey: ['vaccine-events'],
    queryFn: () => api<{ items: VaccineEventDto[] }>('/vaccines/events'),
    enabled: canManage,
    placeholderData: keepPreviousData,
  });

  const remindersQuery = useQuery({
    queryKey: ['vaccine-reminders'],
    queryFn: () => api<{ items: VaccineReminderDto[] }>('/vaccines/reminders?horizonDays=200'),
    enabled: canManage,
    placeholderData: keepPreviousData,
  });

  const protocolsQuery = useQuery({
    queryKey: ['vaccine-protocols'],
    queryFn: () => api<{ items: VaccineProtocolDto[] }>('/vaccines/protocols'),
    enabled: canManage,
    placeholderData: keepPreviousData,
  });

  const productsQuery = useQuery({
    queryKey: ['products', 'asi-secim'],
    queryFn: () => api<{ items: ProductDto[] }>('/products'),
    enabled: eventDialogOpen || protocolDialogOpen,
  });

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'asi-kayit'],
    queryFn: () =>
      api<WarehouseRaw[] | { items: WarehouseRaw[] }>('/warehouses', { branchId: activeBranchId }),
    enabled: eventDialogOpen,
  });

  const scheduleQuery = useQuery({
    queryKey: ['vaccine-schedule', schedulePatientId],
    queryFn: () =>
      api<{ patient: { name: string }; entries: VaccineScheduleEntryDto[] }>(
        `/vaccines/schedule/${schedulePatientId}`,
      ),
    enabled: Boolean(schedulePatientId),
  });

  const [eventForm, setEventForm] = useState({
    patientId: '',
    productId: '',
    warehouseId: '',
    lotId: '',
    protocolId: 'none',
    route: 'deri_alti',
    site: '',
    note: '',
  });

  const lotsQuery = useQuery({
    queryKey: ['lots', 'asi-kayit', eventForm.productId, eventForm.warehouseId],
    queryFn: () =>
      api<{ items: LotViewDto[] }>(
        `/products/${eventForm.productId}/lots?warehouseId=${eventForm.warehouseId}&includeBlocked=true`,
      ),
    enabled: Boolean(eventForm.productId) && Boolean(eventForm.warehouseId) && eventDialogOpen,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['vaccine-events'] });
    void queryClient.invalidateQueries({ queryKey: ['vaccine-reminders'] });
    void queryClient.invalidateQueries({ queryKey: ['vaccine-protocols'] });
    void queryClient.invalidateQueries({ queryKey: ['vaccine-schedule'] });
    void queryClient.invalidateQueries({ queryKey: ['lots'] });
    void queryClient.invalidateQueries({ queryKey: ['balances'] });
  };

  const createEvent = useMutation({
    mutationFn: () =>
      api<VaccineEventDto>('/vaccines/events', {
        method: 'POST',
        body: {
          patientId: eventForm.patientId,
          productId: eventForm.productId,
          warehouseId: eventForm.warehouseId,
          lotId: eventForm.lotId,
          protocolId: eventForm.protocolId === 'none' ? undefined : eventForm.protocolId,
          route: eventForm.route || undefined,
          site: eventForm.site || undefined,
          note: eventForm.note || undefined,
        },
        branchId: activeBranchId,
      }),
    onSuccess: (event) => {
      setEventDialogOpen(false);
      setEventForm((current) => ({ ...current, lotId: '', site: '', note: '' }));
      setActionInfo(`Aşı kaydedildi — parti ${event.lotCode}, SKT donduruldu, stok düşüldü.`);
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => {
      setActionInfo(null);
      setActionError(error.message);
    },
  });

  const createProtocol = useMutation({
    mutationFn: () =>
      api<VaccineProtocolDto>('/vaccines/protocols', {
        method: 'POST',
        body: {
          productId: protocolForm.productId,
          speciesId: protocolForm.speciesId === 'none' ? undefined : protocolForm.speciesId,
          name: protocolForm.name,
          firstDoseAgeDays: Number(protocolForm.firstDoseAgeDays),
          boosterIntervalDays: Number(protocolForm.boosterIntervalDays),
          reminderLeadDays: Number(protocolForm.reminderLeadDays),
          doseLabel: protocolForm.doseLabel || undefined,
          route: protocolForm.route || undefined,
        },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setProtocolDialogOpen(false);
      setActionInfo('Protokol oluşturuldu — takvim bu protokolden türetilir.');
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => {
      setActionInfo(null);
      setActionError(error.message);
    },
  });

  const toggleProtocol = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      api(`/vaccines/protocols/${input.id}`, {
        method: 'PATCH',
        body: { active: input.active },
        branchId: activeBranchId,
      }),
    onSuccess: () => invalidate(),
    onError: (error: Error) => setActionError(error.message),
  });

  const createReminder = useMutation({
    mutationFn: (eventId: string) =>
      api<VaccineReminderDto>(`/vaccines/events/${eventId}/reminders`, {
        method: 'POST',
        body: {},
        branchId: activeBranchId,
      }),
    onSuccess: (reminder) => {
      setActionInfo('Hatırlatma oluşturuldu.');
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['vaccine-reminders'] });
      void reminder;
    },
    onError: (error: Error) => {
      setActionInfo(null);
      setActionError(error.message);
    },
  });

  const sendReminder = useMutation({
    mutationFn: (reminderId: string) =>
      api<VaccineReminderDto>(`/vaccines/reminders/${reminderId}/send`, {
        method: 'POST',
        body: { channel: 'phone' },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setActionInfo('Hatırlatma gönderildi olarak işaretlendi.');
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['vaccine-reminders'] });
    },
    onError: (error: Error) => {
      setActionInfo(null);
      setActionError(error.message);
    },
  });

  const dismissReminder = useMutation({
    mutationFn: (reminderId: string) =>
      api(`/vaccines/reminders/${reminderId}/dismiss`, {
        method: 'PATCH',
        body: {},
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vaccine-reminders'] });
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const reminders = useMemo(() => remindersQuery.data?.items ?? [], [remindersQuery.data]);
  const upcoming = reminders.filter(
    (reminder) => reminder.status === 'scheduled' && new Date(reminder.dueAt) >= startOfToday(),
  );
  const overdue = reminders.filter(
    (reminder) => reminder.status === 'scheduled' && new Date(reminder.dueAt) < startOfToday(),
  );
  const sent = reminders.filter((reminder) => reminder.status === 'sent');

  if (!canManage) {
    return (
      <div className="space-y-6" data-testid="asisler-page">
        <h1 className="text-xl font-semibold">Aşı Takvimi</h1>
        <ErrorState
          title="Yetkiniz yok"
          description="Aşı kayıtları ve hatırlatmalar için aşı yönetimi izni gerekir."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="asisler-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Aşı Takvimi</h1>
          <p className="text-sm text-muted-foreground">
            Aşı kayıtları parti + SKT dondurulur; takvim kliniğinizin protokollerinden türetilir.
          </p>
        </div>
        <Button data-testid="asi-kayit-yeni" onClick={() => setEventDialogOpen(true)}>
          <Syringe className="size-4" aria-hidden />
          Aşı Kaydet
        </Button>
      </div>

      {actionError ? (
        <div role="alert" data-testid="asi-hata" className="rounded-md border border-destructive/30 bg-[var(--status-danger-bg)] px-3 py-2 text-sm">
          {actionError}
        </div>
      ) : null}
      {actionInfo ? (
        <div role="status" data-testid="asi-bilgi" className="rounded-md border bg-[var(--status-success-bg)] px-3 py-2 text-sm">
          {actionInfo}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
        <TabsList>
          <TabsTrigger value="kayitlar" data-testid="tab-kayitlar">
            Aşı Kayıtları
          </TabsTrigger>
          <TabsTrigger value="hatirlatmalar" data-testid="tab-hatirlatmalar">
            Takvim &amp; Hatırlatmalar
          </TabsTrigger>
          <TabsTrigger value="protokoller" data-testid="tab-protokoller">
            Protokoller
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kayitlar" className="mt-4 space-y-4">
          <Card>
            <CardContent className="pt-4">
              {eventsQuery.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : eventsQuery.isError ? (
                <ErrorState title="Aşı kayıtları yüklenemedi" description="Yeniden deneyin." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hasta</TableHead>
                      <TableHead>Aşı</TableHead>
                      <TableHead>Parti</TableHead>
                      <TableHead>Son kullanma</TableHead>
                      <TableHead>Uygulama</TableHead>
                      <TableHead>Sonraki vade</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody data-testid="asi-event-tablo">
                    {(eventsQuery.data?.items ?? []).map((event) => (
                      <TableRow key={event.id} data-testid="asi-event-satir">
                        <TableCell>{event.patient.name}</TableCell>
                        <TableCell>{event.product.name}</TableCell>
                        <TableCell className="font-mono text-xs" data-testid="asi-lot-kod">
                          {event.lotCode}
                        </TableCell>
                        <TableCell className="text-sm">
                          {event.expiresAt
                            ? new Date(event.expiresAt).toLocaleDateString('tr-TR')
                            : '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(event.administeredAt).toLocaleDateString('tr-TR')}
                        </TableCell>
                        <TableCell className="text-sm">
                          {event.nextDueAt
                            ? new Date(event.nextDueAt).toLocaleDateString('tr-TR')
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {event.nextDueAt ? (
                            <Button
                              size="sm"
                              variant="outline"
                              data-testid={`hatirlatma-olustur-${event.id}`}
                              onClick={() => createReminder.mutate(event.id)}
                              disabled={createReminder.isPending}
                            >
                              <BellPlus className="size-4" aria-hidden />
                              Hatırlat
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(eventsQuery.data?.items ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                          Aşı kaydı yok. Aşı Kaydet ile ilk kaydı oluşturun.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hatirlatmalar" className="mt-4 space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <h2 className="text-base font-semibold">Hasta Aşı Takvimi</h2>
              <p className="text-sm text-muted-foreground">
                Takvim girdileri yalnızca kliniğinizin protokollerinden türetilir — sabit evrensel takvim yoktur.
              </p>
              <Select value={schedulePatientId} onValueChange={setSchedulePatientId}>
                <SelectTrigger className="w-72" data-testid="takvim-hasta-secim">
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
              {schedulePatientId ? (
                scheduleQuery.isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : (
                  <div className="space-y-2" data-testid="takvim-girdileri">
                    {(scheduleQuery.data?.entries ?? []).map((entry) => (
                      <div
                        key={entry.protocolId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                        data-testid="takvim-girdisi"
                      >
                        <div>
                          <p className="text-sm font-medium">{entry.protocolName}</p>
                          <p className="text-xs text-muted-foreground">
                            {entry.product.name} · vade{' '}
                            {new Date(entry.dueAt).toLocaleDateString('tr-TR')} ·{' '}
                            {entry.basis === 'booster' ? 'tekrar dozu' : 'ilk doz'}
                          </p>
                        </div>
                        <VaccineDueBadge classification={entry.classification} />
                      </div>
                    ))}
                    {(scheduleQuery.data?.entries ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Bu hastaya uyan aktif protokol yok — Protokoller sekmesinden tanımlayın.
                      </p>
                    ) : null}
                  </div>
                )
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardContent className="pt-4">
                <h2 className="text-base font-semibold" data-testid="geciken-baslik">
                  Geciken ({overdue.length})
                </h2>
                <ul className="mt-2 space-y-2 text-sm" data-testid="geciken-liste">
                  {overdue.map((reminder) => (
                    <li key={reminder.id} className="rounded-md border p-2">
                      <p className="font-medium">{reminder.patient.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {reminder.product?.name ?? '—'} · vade{' '}
                        {new Date(reminder.dueAt).toLocaleDateString('tr-TR')}
                      </p>
                      <div className="mt-1 flex gap-1">
                        <Button size="sm" data-testid={`hatirlatma-gonder-${reminder.id}`} onClick={() => sendReminder.mutate(reminder.id)}>
                          <Send className="size-3" aria-hidden />
                          Gönder
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => dismissReminder.mutate(reminder.id)}>
                          <Ban className="size-3" aria-hidden />
                          Ertele
                        </Button>
                      </div>
                    </li>
                  ))}
                  {overdue.length === 0 ? <li className="text-muted-foreground">Geciken hatırlatma yok.</li> : null}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <h2 className="text-base font-semibold" data-testid="yaklasan-baslik">
                  Yaklaşan ({upcoming.length})
                </h2>
                <ul className="mt-2 space-y-2 text-sm" data-testid="yaklasan-liste">
                  {upcoming.map((reminder) => (
                    <li key={reminder.id} className="rounded-md border p-2">
                      <p className="font-medium">{reminder.patient.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {reminder.product?.name ?? '—'} · vade{' '}
                        {new Date(reminder.dueAt).toLocaleDateString('tr-TR')}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-1"
                        data-testid={`hatirlatma-gonder-${reminder.id}`}
                        onClick={() => sendReminder.mutate(reminder.id)}
                      >
                        <Send className="size-3" aria-hidden />
                        Gönder
                      </Button>
                    </li>
                  ))}
                  {upcoming.length === 0 ? <li className="text-muted-foreground">Yaklaşan hatırlatma yok.</li> : null}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <h2 className="text-base font-semibold">Gönderilenler ({sent.length})</h2>
                <ul className="mt-2 space-y-2 text-sm" data-testid="gonderilen-liste">
                  {sent.map((reminder) => (
                    <li key={reminder.id} className="rounded-md border p-2">
                      <p className="font-medium">{reminder.patient.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {reminder.product?.name ?? '—'} ·{' '}
                        {reminder.sentAt ? new Date(reminder.sentAt).toLocaleString('tr-TR') : ''}
                      </p>
                    </li>
                  ))}
                  {sent.length === 0 ? <li className="text-muted-foreground">Kayıt yok.</li> : null}
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="protokoller" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" data-testid="protokol-yeni" onClick={() => setProtocolDialogOpen(true)}>
              Protokol Tanımla
            </Button>
          </div>
          <Card>
            <CardContent className="pt-4">
              {protocolsQuery.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <div data-testid="protokol-panel">
                  <ProtocolTable protocols={protocolsQuery.data?.items ?? []} />
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(protocolsQuery.data?.items ?? []).map((protocol) => (
                      <Button
                        key={protocol.id}
                        size="sm"
                        variant="ghost"
                        data-testid={`protokol-durum-${protocol.id}`}
                        onClick={() => toggleProtocol.mutate({ id: protocol.id, active: !protocol.active })}
                      >
                        {protocol.active ? 'Pasifleştir' : 'Aktifleştir'} · {protocol.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Aşı kayıt diyaloğu */}
      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent data-testid="asi-kayit-diyalog">
          <DialogHeader>
            <DialogTitle>Aşı Kaydı</DialogTitle>
            <DialogDescription>
              Parti zorunludur; lot kodu ve son kullanma tarihi kayıtta dondurulur ve stok düşer.
              Süresi geçmiş veya karantinalı partiden aşı uygulanamaz.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Hasta</Label>
              <Select
                value={eventForm.patientId}
                onValueChange={(value) => setEventForm((c) => ({ ...c, patientId: value }))}
              >
                <SelectTrigger data-testid="asi-hasta-secim">
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
              <Label>Aşı ürünü</Label>
              <Select
                value={eventForm.productId}
                onValueChange={(value) => setEventForm((c) => ({ ...c, productId: value, lotId: '' }))}
              >
                <SelectTrigger data-testid="asi-urun-secim">
                  <SelectValue placeholder="Ürün seçin" />
                </SelectTrigger>
                <SelectContent>
                  {(productsQuery.data?.items ?? [])
                    .filter((product) => product.trackingType === 'lot')
                    .map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Depo</Label>
              <Select
                value={eventForm.warehouseId}
                onValueChange={(value) => setEventForm((c) => ({ ...c, warehouseId: value, lotId: '' }))}
              >
                <SelectTrigger data-testid="asi-depo-secim">
                  <SelectValue placeholder="Depo seçin" />
                </SelectTrigger>
                <SelectContent>
                  {(Array.isArray(warehousesQuery.data)
                    ? warehousesQuery.data
                    : (warehousesQuery.data?.items ?? [])
                  ).map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Parti</Label>
              <Select value={eventForm.lotId || ''} onValueChange={(value) => setEventForm((c) => ({ ...c, lotId: value }))}>
                <SelectTrigger data-testid="asi-parti-secim">
                  <SelectValue placeholder="Parti seçin" />
                </SelectTrigger>
                <SelectContent>
                  {(lotsQuery.data?.items ?? []).map((lot) => (
                    <SelectItem key={lot.id} value={lot.id}>
                      {lot.lotCode} · SKT{' '}
                      {lot.expiresAt ? new Date(lot.expiresAt).toLocaleDateString('tr-TR') : '—'} ·{' '}
                      {lot.qtyOnHand}
                      {lot.blockReason ? ' (bloklu)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Protokol (opsiyonel)</Label>
              <Select
                value={eventForm.protocolId}
                onValueChange={(value) => setEventForm((c) => ({ ...c, protocolId: value }))}
              >
                <SelectTrigger data-testid="asi-protokol-secim">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Protokolsüz</SelectItem>
                  {(protocolsQuery.data?.items ?? []).map((protocol) => (
                    <SelectItem key={protocol.id} value={protocol.id}>
                      {protocol.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="asi-bolge">Uygulama bölgesi</Label>
              <Input
                id="asi-bolge"
                data-testid="asi-bolge"
                placeholder="boyun deri altı"
                value={eventForm.site}
                onChange={(event) => setEventForm((c) => ({ ...c, site: event.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="asi-not">Not</Label>
              <Textarea
                id="asi-not"
                rows={2}
                data-testid="asi-not"
                value={eventForm.note}
                onChange={(event) => setEventForm((c) => ({ ...c, note: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEventDialogOpen(false)}>
              Vazgeç
            </Button>
            <Button
              data-testid="asi-kaydet"
              disabled={
                !eventForm.patientId ||
                !eventForm.productId ||
                !eventForm.warehouseId ||
                !eventForm.lotId ||
                createEvent.isPending
              }
              onClick={() => createEvent.mutate()}
            >
              {createEvent.isPending ? 'Kaydediliyor…' : 'Aşıyı Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Protokol diyaloğu */}
      <Dialog open={protocolDialogOpen} onOpenChange={setProtocolDialogOpen}>
        <DialogContent data-testid="protokol-diyalog">
          <DialogHeader>
            <DialogTitle>Aşı Protokolü Tanımla</DialogTitle>
            <DialogDescription>
              Protokoller klinikte yapılandırılır: ilk doz yaşı, tekrar aralığı ve hatırlatma önceliği.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="protokol-ad">Protokol adı</Label>
              <Input
                id="protokol-ad"
                data-testid="protokol-ad"
                placeholder="Köpek Yıllık Karma"
                value={protocolForm.name}
                onChange={(event) => setProtocolForm((c) => ({ ...c, name: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Aşı ürünü</Label>
              <Select
                value={protocolForm.productId}
                onValueChange={(value) => setProtocolForm((c) => ({ ...c, productId: value }))}
              >
                <SelectTrigger data-testid="protokol-urun">
                  <SelectValue placeholder="Ürün seçin" />
                </SelectTrigger>
                <SelectContent>
                  {(productsQuery.data?.items ?? [])
                    .filter((product) => product.trackingType === 'lot')
                    .map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tür</Label>
              <Select
                value={protocolForm.speciesId}
                onValueChange={(value) => setProtocolForm((c) => ({ ...c, speciesId: value }))}
              >
                <SelectTrigger data-testid="protokol-tur">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tüm türler</SelectItem>
                  {(patientsQuery.data ?? [])
                    .map((patient) => patient.species)
                    .filter((species, index, all) => all.findIndex((s) => s.id === species.id) === index)
                    .map((species) => (
                      <SelectItem key={species.id} value={species.id}>
                        {species.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="protokol-ilk">İlk doz yaşı (gün)</Label>
              <Input
                id="protokol-ilk"
                type="number"
                min="0"
                data-testid="protokol-ilk"
                value={protocolForm.firstDoseAgeDays}
                onChange={(event) =>
                  setProtocolForm((c) => ({ ...c, firstDoseAgeDays: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="protokol-tekrar">Tekrar aralığı (gün)</Label>
              <Input
                id="protokol-tekrar"
                type="number"
                min="1"
                data-testid="protokol-tekrar"
                value={protocolForm.boosterIntervalDays}
                onChange={(event) =>
                  setProtocolForm((c) => ({ ...c, boosterIntervalDays: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="protokol-lead">Hatırlatma (gün önce)</Label>
              <Input
                id="protokol-lead"
                type="number"
                min="0"
                data-testid="protokol-lead"
                value={protocolForm.reminderLeadDays}
                onChange={(event) =>
                  setProtocolForm((c) => ({ ...c, reminderLeadDays: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="protokol-doz">Doz etiketi</Label>
              <Input
                id="protokol-doz"
                placeholder="1 ml"
                data-testid="protokol-doz"
                value={protocolForm.doseLabel}
                onChange={(event) => setProtocolForm((c) => ({ ...c, doseLabel: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProtocolDialogOpen(false)}>
              Vazgeç
            </Button>
            <Button
              data-testid="protokol-kaydet"
              disabled={!protocolForm.name || !protocolForm.productId || createProtocol.isPending}
              onClick={() => createProtocol.mutate()}
            >
              {createProtocol.isPending ? 'Kaydediliyor…' : 'Protokolü Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
