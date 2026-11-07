'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Thermometer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { LotTable } from '@/components/inventory/lot-table';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import type { LotViewDto, ProductDto, TemperatureLogDto } from '@/lib/api-types';

/**
 * Faz 07 — partiler ve son kullanma: FEFO sıralı parti görünümü, blok
 * gerekçeleri, karantina/serbest aksiyonu ve soğuk zincir sıcaklık kayıtları.
 */

type WarehouseRaw = { id: string; name: string; branch?: { name: string } };

export default function LotsPage() {
  const { activeBranchId, hasPermission } = useAuth();
  const canReceive = hasPermission('inventory.receive');
  const canManageWarehouse = hasPermission('warehouse.manage');
  const queryClient = useQueryClient();

  const [actionError, setActionError] = useState<string | null>(null);
  const [tempCelsius, setTempCelsius] = useState('');
  const [tempWarehouseId, setTempWarehouseId] = useState('');
  const [tempNote, setTempNote] = useState('');

  // Tüm lot takipli ürünlerin partileri: ürün bazlı sorgular birleştirilir
  const productsQuery = useQuery({
    queryKey: ['products', 'partiler-sayfasi'],
    queryFn: () => api<{ items: ProductDto[] }>('/products?active=true', { branchId: activeBranchId }),
  });
  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'partiler-sayfasi'],
    queryFn: () => api<WarehouseRaw[] | { items: WarehouseRaw[] }>('/warehouses', { branchId: activeBranchId }),
  });

  const warehousesRaw = warehousesQuery.data;
  const warehouses: WarehouseRaw[] = Array.isArray(warehousesRaw)
    ? warehousesRaw
    : (warehousesRaw?.items ?? []);
  const lotTrackedProducts = (productsQuery.data?.items ?? []).filter(
    (p) => p.trackingType === 'lot',
  );

  const lotsQueries = useQuery({
    queryKey: ['partiler-tumu', lotTrackedProducts.map((p) => p.id).join(',')],
    queryFn: async () => {
      const results = await Promise.all(
        lotTrackedProducts.map((product) =>
          api<{ items: LotViewDto[] }>(`/products/${product.id}/lots?includeBlocked=true`, {
            branchId: activeBranchId,
          }).then((res) => res.items.map((lot) => ({ ...lot, productName: product.name, productCode: product.code }))),
        ),
      );
      return results.flat();
    },
    enabled: lotTrackedProducts.length > 0,
  });

  const temperatureQuery = useQuery({
    queryKey: ['temperature-logs'],
    queryFn: () => api<{ items: TemperatureLogDto[] }>('/stock/temperature-logs?take=20', { branchId: activeBranchId }),
  });

  const toggleStatus = useMutation({
    mutationFn: (payload: { lotId: string; status: 'active' | 'quarantined' }) =>
      api<unknown>(`/stock/lots/${payload.lotId}/status`, {
        method: 'PATCH',
        body: { status: payload.status },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['partiler-tumu'] });
      void queryClient.invalidateQueries({ queryKey: ['product-lots'] });
      void queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const addTemperature = useMutation({
    mutationFn: () =>
      api<unknown>('/stock/temperature-logs', {
        method: 'POST',
        body: {
          warehouseId: tempWarehouseId,
          celsius: Number(tempCelsius.replace(',', '.')),
          measuredAt: new Date().toISOString(),
          note: tempNote || undefined,
        },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setTempCelsius('');
      setTempNote('');
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['temperature-logs'] });
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const lots = (lotsQueries.data ?? []).sort(
    (a, b) =>
      (a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY) -
        (b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY) ||
      a.productCode.localeCompare(b.productCode),
  );

  return (
    <div className="space-y-6" data-testid="partiler-page">
      <div>
        <h1 className="text-xl font-semibold">Partiler ve Son Kullanma</h1>
        <p className="text-sm text-muted-foreground">
          FEFO sıralı parti görünümü; süresi geçmiş ve karantina partileri tüketim için blokludur.
        </p>
      </div>

      {actionError ? (
        <div role="alert" className="rounded-md border border-border bg-[var(--status-danger-bg)] px-4 py-3 text-sm text-status-danger">
          {actionError}
        </div>
      ) : null}

      <Card>
        <CardContent className="pt-4">
          {productsQuery.isLoading || lotsQueries.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : productsQuery.isError ? (
            <ErrorState title="Partiler yüklenemedi" description="Ürün listesi alınamadı." />
          ) : lotTrackedProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="partiler-bos">
              Parti takipli ürün yok. Ürünler sayfasından parti takipli ürün ekleyin.
            </p>
          ) : (
            <LotTable
              lots={lots.map((lot) => ({ ...lot, warehouseName: `${lot.productCode} · ${lot.warehouseName}` }))}
              canManage={canReceive}
              busy={toggleStatus.isPending}
              onToggleStatus={(lot) =>
                toggleStatus.mutate({
                  lotId: lot.id,
                  status: lot.status === 'quarantined' ? 'active' : 'quarantined',
                })
              }
              testId="partiler-tablo"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="flex items-center gap-2">
            <Thermometer aria-hidden="true" className="size-4 text-muted-foreground" />
            <h2 className="font-semibold">Soğuk Zincir — Sıcaklık Kayıtları</h2>
          </div>

          {canManageWarehouse ? (
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto] md:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="temp-warehouse">Depo</Label>
                <select
                  id="temp-warehouse"
                  data-testid="temp-warehouse"
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={tempWarehouseId}
                  onChange={(e) => setTempWarehouseId(e.target.value)}
                >
                  <option value="">Depo seçin</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="temp-celsius">Sıcaklık (°C)</Label>
                <Input
                  id="temp-celsius"
                  data-testid="temp-celsius"
                  type="number"
                  step="0.1"
                  value={tempCelsius}
                  onChange={(e) => setTempCelsius(e.target.value)}
                  placeholder="4.5"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="temp-note">Not</Label>
                <Input
                  id="temp-note"
                  data-testid="temp-note"
                  value={tempNote}
                  onChange={(e) => setTempNote(e.target.value)}
                  placeholder="Ölçüm koşulu (opsiyonel)"
                />
              </div>
              <Button
                type="button"
                data-testid="temp-kaydet"
                disabled={addTemperature.isPending || !tempWarehouseId || tempCelsius === ''}
                onClick={() => addTemperature.mutate()}
              >
                Kaydet
              </Button>
            </div>
          ) : null}

          {temperatureQuery.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : temperatureQuery.isError ? (
            <ErrorState title="Sıcaklık kayıtları yüklenemedi" description="Kayıtlar alınamadı." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zaman</TableHead>
                    <TableHead>Depo</TableHead>
                    <TableHead>Sıcaklık</TableHead>
                    <TableHead>Kayıt</TableHead>
                    <TableHead>Not</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody data-testid="temp-tablo">
                  {(temperatureQuery.data?.items ?? []).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(log.measuredAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
                      </TableCell>
                      <TableCell className="text-sm">{log.warehouse.name}</TableCell>
                      <TableCell>
                        <span className={Number(log.celsius) > 8 || Number(log.celsius) < 0 ? 'font-medium text-status-danger' : 'font-medium'}>
                          {log.celsius} °C
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.recordedBy ? `${log.recordedBy.firstName} ${log.recordedBy.lastName}` : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{log.note ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                  {(temperatureQuery.data?.items ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                        Sıcaklık kaydı yok.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
