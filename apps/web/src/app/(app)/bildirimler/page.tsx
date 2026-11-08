'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Play, Plus, RefreshCcw } from 'lucide-react';
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
import { DeliveryReportCard } from '@/components/notifications/delivery-report-card';
import { NotificationStatusBadge } from '@/components/notifications/notification-status-badge';
import { ErrorState } from '@/components/design-system/state-views';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api-client';
import type {
  DeliveryReportDto,
  NotificationChannel,
  NotificationConsentDto,
  NotificationDto,
  NotificationListResponse,
  NotificationStatus,
  NotificationTemplateDto,
  OwnerSummary,
  RunQueueSummaryDto,
} from '@/lib/api-types';
import {
  NOTIFICATION_CATEGORY_CATALOG,
  NOTIFICATION_CHANNEL_CATALOG,
  NOTIFICATION_STATUS_CATALOG,
} from '@/lib/api-types';

const CHANNEL_LABELS: Record<string, string> = Object.fromEntries(
  NOTIFICATION_CHANNEL_CATALOG.map((c) => [c.value, c.label]),
);
const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  NOTIFICATION_STATUS_CATALOG.map((c) => [c.value, c.label]),
);
const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  NOTIFICATION_CATEGORY_CATALOG.map((c) => [c.value, c.label]),
);

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export default function BildirimlerPage() {
  const { hasPermission, activeBranchId } = useAuth();
  const canManage = hasPermission('notification.manage');
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [detail, setDetail] = useState<NotificationDto | null>(null);
  const [enqueueOpen, setEnqueueOpen] = useState(false);
  const [lastRunSummary, setLastRunSummary] = useState<RunQueueSummaryDto | null>(null);

  // Yeni bildirim formu
  const [ownerId, setOwnerId] = useState<string>('');
  const [channel, setChannel] = useState<NotificationChannel>('sms');
  const [templateId, setTemplateId] = useState<string>('none');
  const [customBody, setCustomBody] = useState('');
  const [varsText, setVarsText] = useState('{}');
  const [formError, setFormError] = useState<string | null>(null);

  const reportQuery = useQuery({
    queryKey: ['notifications', 'report', activeBranchId],
    queryFn: () => api<DeliveryReportDto>('/notifications/delivery-report'),
    enabled: canManage,
  });

  const listQuery = useQuery({
    queryKey: ['notifications', 'list', statusFilter, activeBranchId],
    queryFn: () =>
      api<NotificationListResponse>(
        `/notifications?take=50${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`,
      ),
    enabled: canManage,
    placeholderData: keepPreviousData,
  });

  const templatesQuery = useQuery({
    queryKey: ['notifications', 'templates', activeBranchId],
    queryFn: () => api<NotificationTemplateDto[]>('/notifications/templates'),
    enabled: canManage,
  });

  const ownersQuery = useQuery({
    queryKey: ['notifications', 'owner-options', activeBranchId],
    queryFn: () => api<OwnerSummary[]>('/owners?take=100'),
    enabled: canManage && enqueueOpen,
  });

  const consentQuery = useQuery({
    queryKey: ['notifications', 'consent', ownerId, activeBranchId],
    queryFn: () => api<NotificationConsentDto>(`/notifications/consents/${ownerId}`),
    enabled: canManage && enqueueOpen && ownerId !== '',
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const runQueueMutation = useMutation({
    mutationFn: () => api<RunQueueSummaryDto>('/notifications/run-queue', { method: 'POST', body: { limit: 20 } }),
    onSuccess: (summary) => {
      setLastRunSummary(summary);
      invalidate();
    },
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) =>
      api<NotificationDto>(`/notifications/${id}/retry`, { method: 'POST', body: {} }),
    onSuccess: (updated) => {
      setDetail(updated);
      invalidate();
    },
  });

  const enqueueMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<NotificationDto>('/notifications/enqueue', { method: 'POST', body }),
    onSuccess: () => {
      setEnqueueOpen(false);
      setCustomBody('');
      setVarsText('{}');
      setTemplateId('none');
      setFormError(null);
      invalidate();
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError
          ? `${error.message}${error.code ? ` (${error.code})` : ''}`
          : 'Bildirim kuyruğa alınamadı',
      );
    },
  });

  const selectedTemplate = useMemo(
    () => templatesQuery.data?.find((t) => t.id === templateId) ?? null,
    [templatesQuery.data, templateId],
  );

  const consent = consentQuery.data ?? null;

  if (!canManage) {
    return (
      <ErrorState
        title="Erişim yok"
        description="Bildirim merkezini yönetmek için notification.manage izni gerekir."
      />
    );
  }

  const handleEnqueue = () => {
    setFormError(null);
    let vars: Record<string, string> = {};
    if (templateId !== 'none' && varsText.trim()) {
      try {
        vars = JSON.parse(varsText) as Record<string, string>;
      } catch {
        setFormError('Değişkenler geçerli JSON değil');
        return;
      }
    }
    enqueueMutation.mutate({
      channel,
      ownerId,
      ...(templateId !== 'none' ? { templateId, vars } : { body: customBody }),
      idempotencyKey: crypto.randomUUID(),
    });
  };

  return (
    <div className="space-y-6" data-testid="bildirimler-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bildirim Merkezi</h1>
          <p className="text-sm text-muted-foreground">
            Şablonlu/serbest bildirimler, onay kuralı, kuyruk işleme ve teslim raporu.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            data-testid="bildirim-kuyruk-calistir"
            disabled={runQueueMutation.isPending}
            onClick={() => runQueueMutation.mutate()}
          >
            <Play className="mr-2 h-4 w-4" /> Kuyruğu Çalıştır
          </Button>
          <Button data-testid="bildirim-yeni" onClick={() => setEnqueueOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Yeni Bildirim
          </Button>
        </div>
      </div>

      {lastRunSummary ? (
        <p data-testid="bildirim-kuyruk-ozet" className="text-sm text-muted-foreground">
          Son işleme: {lastRunSummary.claimed} kayıt alındı · {lastRunSummary.sent} gönderildi ·{' '}
          {lastRunSummary.retrying} yeniden denenecek · {lastRunSummary.deadLettered} ölü mektup ·{' '}
          {lastRunSummary.failed} kalıcı hata
        </p>
      ) : null}

      {reportQuery.isLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : reportQuery.data ? (
        <DeliveryReportCard report={reportQuery.data} />
      ) : null}

      <Tabs defaultValue="kuyruk">
        <TabsList>
          <TabsTrigger value="kuyruk">Kuyruk ve Geçmiş</TabsTrigger>
          <TabsTrigger value="sablonlar">Şablonlar</TabsTrigger>
        </TabsList>

        <TabsContent value="kuyruk" className="space-y-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="status-filter" className="text-sm">
              Durum
            </Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="status-filter" className="w-44" data-testid="bildirim-durum-filtre">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                {NOTIFICATION_STATUS_CATALOG.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {listQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : listQuery.isError ? (
            <ErrorState
              title="Bildirimler yüklenemedi"
              description="Kuyruk geçmişi okunamadı. Sayfayı yenileyip tekrar deneyin."
            />
          ) : (listQuery.data?.items.length ?? 0) === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <Bell className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Bu filtrede bildirim yok. Yeni bildirim oluşturabilirsiniz.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-hidden rounded-lg border" data-testid="bildirim-tablo">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kanal</TableHead>
                    <TableHead>Alıcı</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Deneme</TableHead>
                    <TableHead>Oluşturma</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data?.items.map((notification) => (
                    <TableRow
                      key={notification.id}
                      data-testid="bildirim-satir"
                      className="cursor-pointer"
                      onClick={() => setDetail(notification)}
                    >
                      <TableCell className="font-medium">
                        {CHANNEL_LABELS[notification.channel] ?? notification.channel}
                      </TableCell>
                      <TableCell>
                        {notification.ownerName ?? '—'}
                        <span className="block text-xs text-muted-foreground">
                          {notification.recipientValue}
                        </span>
                      </TableCell>
                      <TableCell>
                        {CATEGORY_LABELS[notification.category] ?? notification.category}
                      </TableCell>
                      <TableCell>
                        <NotificationStatusBadge status={notification.status} />
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {notification.attempts}/{notification.maxAttempts}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(notification.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="sablonlar" className="space-y-3">
          {templatesQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {templatesQuery.data?.map((template) => (
                <Card key={template.id} data-testid="sablon-kart">
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{template.name}</p>
                      <span className="text-xs text-muted-foreground">
                        {CHANNEL_LABELS[template.channel] ?? template.channel}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {template.code} · {CATEGORY_LABELS[template.category] ?? template.category}
                    </p>
                    <p className="line-clamp-3 whitespace-pre-line rounded-md bg-muted p-2 text-xs">
                      {template.body}
                    </p>
                    {template.requiredVars.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Değişkenler: {template.requiredVars.map((v) => `{{${v}}}`).join(', ')}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Yeni bildirim diyaloğu */}
      <Dialog open={enqueueOpen} onOpenChange={setEnqueueOpen}>
        <DialogContent className="max-w-xl" data-testid="bildirim-yeni-diyalog">
          <DialogHeader>
            <DialogTitle>Yeni Bildirim</DialogTitle>
            <DialogDescription>
              Dış kanallar (SMS/E-posta/WhatsApp) için sahip onayı zorunludur; onayı
              olmayan sahibe bildirim kuyruğa alınamaz.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="owner-select">Hasta Sahibi</Label>
              <Select value={ownerId || undefined} onValueChange={setOwnerId}>
                <SelectTrigger id="owner-select" className="w-full" data-testid="bildirim-sahip-secim">
                  <SelectValue placeholder="Sahip seçin" />
                </SelectTrigger>
                <SelectContent>
                  {ownersQuery.data?.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {owner.firstName} {owner.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {consent ? (
              <div className="rounded-md border p-3 text-xs" data-testid="bildirim-onay-durum">
                <p className="font-medium">İletişim onayları — {consent.ownerName}</p>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {NOTIFICATION_CHANNEL_CATALOG.map((entry) => {
                    const state = consent.channels[entry.value];
                    return (
                      <li key={entry.value}>
                        {entry.label}:{' '}
                        {state.consentKind === null
                          ? 'Uygulama içi — onay gerekmez'
                          : state.granted
                            ? 'Onaylı'
                            : 'Onay yok (kuyruğa alınamaz)'}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="channel-select">Kanal</Label>
                <Select value={channel} onValueChange={(v) => setChannel(v as NotificationChannel)}>
                  <SelectTrigger id="channel-select" className="w-full" data-testid="bildirim-kanal-secim">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIFICATION_CHANNEL_CATALOG.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="template-select">Şablon</Label>
                <Select value={templateId || 'none'} onValueChange={setTemplateId}>
                  <SelectTrigger id="template-select" className="w-full" data-testid="bildirim-sablon-secim">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Serbest metin</SelectItem>
                    {templatesQuery.data
                      ?.filter((t) => t.channel === channel)
                      .map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedTemplate ? (
              <div className="space-y-1.5">
                <Label htmlFor="vars-input">Şablon Değişkenleri (JSON)</Label>
                <Input
                  id="vars-input"
                  data-testid="bildirim-degiskenler"
                  value={varsText}
                  onChange={(event) => setVarsText(event.target.value)}
                  placeholder='{"patientName": "Karabaş", "date": "12.11.2026", "time": "14:00"}'
                />
                <p className="text-xs text-muted-foreground">
                  ownerName ve clinicName otomatik eklenir. Zorunlu:{' '}
                  {selectedTemplate.requiredVars
                    .filter((v) => v !== 'ownerName' && v !== 'clinicName')
                    .map((v) => `{{${v}}}`)
                    .join(', ') || 'yok'}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="body-input">Gövde</Label>
                <Textarea
                  id="body-input"
                  data-testid="bildirim-govde"
                  rows={4}
                  value={customBody}
                  onChange={(event) => setCustomBody(event.target.value)}
                  placeholder="Bildirim metni…"
                />
              </div>
            )}

            {formError ? (
              <p data-testid="bildirim-form-hata" className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnqueueOpen(false)}>
              Vazgeç
            </Button>
            <Button
              data-testid="bildirim-kaydet"
              disabled={!ownerId || enqueueMutation.isPending || (templateId === 'none' && !customBody.trim())}
              onClick={handleEnqueue}
            >
              Kuyruğa Al
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detay diyaloğu */}
      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-xl" data-testid="bildirim-detay-diyalog">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {CHANNEL_LABELS[detail.channel] ?? detail.channel}
                  <NotificationStatusBadge status={detail.status} />
                </DialogTitle>
                <DialogDescription>
                  {detail.ownerName ?? '—'} · {detail.recipientValue}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {detail.subject ? (
                  <p className="text-sm font-medium">{detail.subject}</p>
                ) : null}
                <p className="whitespace-pre-line rounded-md bg-muted p-3 text-sm">
                  {detail.body}
                </p>
                {detail.lastError ? (
                  <p data-testid="bildirim-detay-hata" className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                    Son hata: {detail.lastError}
                  </p>
                ) : null}
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Denemeler
                  </p>
                  {(detail.attemptsLog ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Henüz işlenmedi.</p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {detail.attemptsLog?.map((attempt) => (
                        <li
                          key={attempt.id}
                          data-testid="bildirim-deneme-satir"
                          className="flex items-center justify-between gap-2 rounded-md border px-2 py-1"
                        >
                          <span>
                            #{attempt.attemptNo} · {attempt.providerName}
                          </span>
                          <span className="text-muted-foreground">
                            {attempt.outcome === 'success'
                              ? `Başarılı — ${attempt.providerMessageId ?? ''}`
                              : attempt.outcome === 'retryable'
                                ? 'Yeniden denenecek'
                                : 'Kalıcı hata'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <DialogFooter>
                {detail.status === 'failed' || detail.status === 'dead_letter' ? (
                  <Button
                    variant="outline"
                    data-testid="bildirim-tekrar-kuyrukl"
                    disabled={retryMutation.isPending}
                    onClick={() => retryMutation.mutate(detail.id)}
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" /> Yeniden Kuyruğa Al
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => setDetail(null)}>
                  Kapat
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
