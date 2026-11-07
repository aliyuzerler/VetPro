'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorState } from '@/components/design-system/state-views';
import {
  ServiceFormDialog,
  type ServiceFormValues,
} from '@/components/services/service-form-dialog';
import {
  ServiceDetailPanel,
  ServicePriceDialog,
  ServiceRuleDialog,
} from '@/components/services/service-detail-panel';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import type { Branch, ServiceDto } from '@/lib/api-types';

/**
 * Faz 06 — hizmet kataloğu: kategori/fiyat/süre tanımları, şube override'lı
 * fiyat geçmişi ve varsayılan tüketim kuralları. Yazma uçları service.manage
 * izniyle; izin yoksa salt-okunur katalog görüntülenir.
 */

const CATEGORY_LABELS: Record<string, string> = {
  muayene: 'Muayene',
  cerrahi: 'Cerrahi',
  laboratuvar: 'Laboratuvar',
  aşılama: 'Aşılama',
  görüntüleme: 'Görüntüleme',
  diş: 'Diş',
  bakım: 'Bakım',
  diğer: 'Diğer',
};

export default function ServicesPage() {
  const { activeBranchId, hasPermission } = useAuth();
  const canManage = hasPermission('service.manage');
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceDto | null>(null);
  const [priceOpen, setPriceOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const servicesQuery = useQuery({
    queryKey: ['services', 'katalog', search],
    queryFn: () =>
      api<{ items: ServiceDto[] }>(
        `/services${search ? `?search=${encodeURIComponent(search)}` : ''}`,
        { branchId: activeBranchId },
      ),
    placeholderData: keepPreviousData,
  });

  const branchesQuery = useQuery({
    queryKey: ['branches', 'hepsi'],
    queryFn: () => api<Branch[]>('/branches'),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['services'] });
  };

  const createService = useMutation({
    mutationFn: (values: ServiceFormValues) =>
      api<ServiceDto>('/services', {
        method: 'POST',
        body: {
          code: values.code,
          name: values.name,
          category: values.category,
          durationMin: values.durationMin,
          notes: values.notes || undefined,
        },
        branchId: activeBranchId,
      }),
    onSuccess: (created) => {
      setFormOpen(false);
      setSelectedId(created.id);
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const updateService = useMutation({
    mutationFn: (payload: { id: string; values: Partial<ServiceFormValues> }) =>
      api<ServiceDto>(`/services/${payload.id}`, {
        method: 'PATCH',
        body: payload.values,
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setFormOpen(false);
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const createPrice = useMutation({
    mutationFn: (payload: { serviceId: string; body: Record<string, unknown> }) =>
      api<unknown>(`/services/${payload.serviceId}/prices`, {
        method: 'POST',
        body: payload.body,
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setPriceOpen(false);
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const createRule = useMutation({
    mutationFn: (payload: { serviceId: string; body: Record<string, unknown> }) =>
      api<unknown>(`/services/${payload.serviceId}/consumption-rules`, {
        method: 'POST',
        body: payload.body,
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setRuleOpen(false);
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const deactivateRule = useMutation({
    mutationFn: (payload: { serviceId: string; ruleId: string }) =>
      api<unknown>(`/services/${payload.serviceId}/consumption-rules/${payload.ruleId}`, {
        method: 'DELETE',
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const services = useMemo(() => servicesQuery.data?.items ?? [], [servicesQuery.data]);
  const branches = branchesQuery.data ?? [];
  const selected = services.find((s) => s.id === selectedId) ?? null;
  const busy =
    createService.isPending ||
    updateService.isPending ||
    createPrice.isPending ||
    createRule.isPending ||
    deactivateRule.isPending;

  return (
    <div className="space-y-6" data-testid="hizmetler-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Hizmet Kataloğu</h1>
          <p className="text-sm text-muted-foreground">
            Kategori, süre ve şube bazlı fiyat tanımları; Faz 08&apos;de stok tüketimiyle bağlanır.
          </p>
        </div>
        {canManage ? (
          <Button
            type="button"
            data-testid="hizmet-yeni"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus aria-hidden="true" />
            Yeni Hizmet
          </Button>
        ) : null}
      </div>

      {actionError ? (
        <div
          role="alert"
          className="rounded-md border border-border bg-[var(--status-danger-bg)] px-4 py-3 text-sm text-status-danger"
        >
          {actionError}
        </div>
      ) : null}

      <div className="relative max-w-md">
        <Search
          aria-hidden="true"
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Hizmet adı veya kodu ara…"
          aria-label="Hizmet ara"
          className="pl-9"
          data-testid="hizmet-arama"
        />
      </div>

      {servicesQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : servicesQuery.isError ? (
        <ErrorState
          title="Katalog yüklenemedi"
          description="Hizmet listesi alınamadı. Sayfayı yenilemeyi deneyin."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kod</TableHead>
                    <TableHead>Ad</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Süre</TableHead>
                    <TableHead>Durum</TableHead>
                    {canManage ? <TableHead aria-label="Eylemler" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody data-testid="hizmet-tablo">
                  {services.map((service) => (
                    <TableRow
                      key={service.id}
                      className={selectedId === service.id ? 'bg-brand-50/60' : undefined}
                    >
                      <TableCell className="font-mono text-xs">{service.code}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="text-left font-medium underline-offset-4 hover:underline"
                          onClick={() => setSelectedId(service.id)}
                          data-testid="hizmet-sec"
                        >
                          {service.name}
                        </button>
                      </TableCell>
                      <TableCell>{CATEGORY_LABELS[service.category] ?? service.category}</TableCell>
                      <TableCell>{service.durationMin} dk</TableCell>
                      <TableCell>
                        {service.active ? 'Aktif' : 'Pasif'}
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`${service.name} düzenle`}
                            onClick={() => {
                              setEditing(service);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                  {services.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManage ? 6 : 5} className="text-center text-sm text-muted-foreground">
                        Hizmet kaydı yok.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              {selected ? (
                <ServiceDetailPanel
                  service={selected}
                  branches={branches}
                  canManage={canManage}
                  busy={busy}
                  onAddPrice={() => setPriceOpen(true)}
                  onAddRule={() => setRuleOpen(true)}
                  onDeactivateRule={(ruleId) =>
                    deactivateRule.mutate({ serviceId: selected.id, ruleId })
                  }
                />
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="hizmet-detay-bos">
                  Fiyat geçmişi ve tüketim kuralları için listeden bir hizmet seçin.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <ServiceFormDialog
        open={formOpen}
        editing={editing}
        saving={busy}
        onOpenChange={setFormOpen}
        onSubmit={(values) => {
          if (editing) {
            updateService.mutate({
              id: editing.id,
              values: {
                name: values.name,
                category: values.category,
                durationMin: values.durationMin,
                notes: values.notes,
                active: values.active,
              },
            });
          } else {
            createService.mutate(values);
          }
        }}
      />

      {selected ? (
        <>
          <ServicePriceDialog
            open={priceOpen}
            serviceName={selected.name}
            branches={branches}
            saving={busy}
            onOpenChange={setPriceOpen}
            onSubmit={(values) =>
              createPrice.mutate({
                serviceId: selected.id,
                body: {
                  branchId: values.branchId === 'all' ? undefined : values.branchId,
                  amount: Number(values.amount),
                  taxCode: values.taxCode || undefined,
                  validFrom: values.validFrom,
                  validTo: values.validTo || undefined,
                },
              })
            }
          />
          <ServiceRuleDialog
            open={ruleOpen}
            serviceName={selected.name}
            saving={busy}
            onOpenChange={setRuleOpen}
            onSubmit={(values) =>
              createRule.mutate({
                serviceId: selected.id,
                body: {
                  defaultQty: Number(values.defaultQty.replace(',', '.')),
                  unit: values.unit || undefined,
                  required: values.required,
                },
              })
            }
          />
        </>
      ) : null}
    </div>
  );
}
