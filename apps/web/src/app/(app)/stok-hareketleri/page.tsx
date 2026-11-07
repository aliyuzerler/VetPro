'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorState } from '@/components/design-system/state-views';
import { MovementLedgerTable, movementKindLabel } from '@/components/inventory/movement-ledger-table';
import {
  StockCountCreateDialog,
  StockCountSheet,
} from '@/components/inventory/stock-count-panel';
import {
  TransferCreateDialog,
  TransferPanel,
} from '@/components/inventory/transfer-panel';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import { MOVEMENT_KIND_CATALOG } from '@/lib/api-types';
import type {
  Branch,
  LotViewDto,
  ProductDto,
  StockCountDto,
  StockMovementDto,
  StockTransferDto,
} from '@/lib/api-types';

/**
 * Faz 07 — stok hareket defteri (append-only, salt okunur), iki aşamalı
 * transferler ve stok sayımı. Yazma aksiyonları izinle gösterilir.
 */

type WarehouseRaw = { id: string; name: string; branch?: { name: string } };

export default function StockMovementsPage() {
  const { activeBranchId, hasPermission } = useAuth();
  const canAdjust = hasPermission('inventory.adjust');
  const canTransfer = hasPermission('inventory.transfer');
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('defter');
  const [kindFilter, setKindFilter] = useState('all');
  const [receiptCountOpen, setCountOpen] = useState(false);
  const [activeCountId, setActiveCountId] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  const movementsQuery = useQuery({
    queryKey: ['stock-movements', 'defter', kindFilter],
    queryFn: () =>
      api<{ items: StockMovementDto[] }>(
        `/stock/movements?take=100${kindFilter !== 'all' ? `&kind=${kindFilter}` : ''}`,
        { branchId: activeBranchId },
      ),
    placeholderData: keepPreviousData,
  });
  const transfersQuery = useQuery({
    queryKey: ['stock-transfers'],
    queryFn: () => api<{ items: StockTransferDto[] }>('/stock/transfers', { branchId: activeBranchId }),
  });
  const countsQuery = useQuery({
    queryKey: ['stock-counts'],
    queryFn: () => api<{ items: StockCountDto[] }>('/stock/counts', { branchId: activeBranchId }),
  });
  const productsQuery = useQuery({
    queryKey: ['products', 'hareketler-sayfasi'],
    queryFn: () => api<{ items: ProductDto[] }>('/products?active=true', { branchId: activeBranchId }),
  });
  // Transfer kurulumu çok şubeli olduğundan, kullanıcının erişimli olduğu tüm
  // şubelerin depoları birleştirilir (erişilmeyen şube istekleri sessizce atlanır).
  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'tum-erisilen-subeler'],
    queryFn: async () => {
      const branches = await api<Branch[]>('/branches');
      const lists = await Promise.all(
        branches.map((branch) =>
          api<WarehouseRaw[] | { items: WarehouseRaw[] }>(`/warehouses?branchId=${branch.id}`, {
            branchId: branch.id,
          }).catch(() => [] as WarehouseRaw[]),
        ),
      );
      return lists.flatMap((list) => (Array.isArray(list) ? list : list.items));
    },
  });

  const warehouses: WarehouseRaw[] = useMemo(
    () => warehousesQuery.data ?? [],
    [warehousesQuery.data],
  );
  const warehouseOptions = warehouses.map((w) => ({
    id: w.id,
    name: w.name,
    branchName: w.branch?.name ?? '',
  }));
  const products = productsQuery.data?.items ?? [];

  // Transfer kurulumunda kaynak depoya göre seçilebilir partiler (FEFO sıralı)
  const lotsByWarehouse = useMemo(() => {
    const map: Record<string, LotViewDto[]> = {};
    for (const warehouse of warehouses) {
      map[warehouse.id] = [];
    }
    return map;
  }, [warehouses]);
  const sourceLotsQuery = useQuery({
    queryKey: ['transfer-kaynak-partiler', products.map((p) => p.id).join(',')],
    queryFn: async () => {
      const lotTracked = products.filter((p) => p.trackingType === 'lot');
      const results = await Promise.all(
        lotTracked.map((product) =>
          api<{ items: LotViewDto[] }>(`/products/${product.id}/lots`, {
            branchId: activeBranchId,
          }).then((res) => res.items),
        ),
      );
      const map: Record<string, LotViewDto[]> = {};
      for (const lots of results) {
        for (const lot of lots) {
          if (lot.qtyOnHand > 0) {
            (map[lot.warehouseId] ??= []).push(lot);
          }
        }
      }
      return map;
    },
    enabled: products.length > 0 && transferOpen,
  });
  const lotsForTransfer = transferOpen ? (sourceLotsQuery.data ?? lotsByWarehouse) : lotsByWarehouse;

  const activeCount = (countsQuery.data?.items ?? []).find((c) => c.id === activeCountId) ?? null;

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    void queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
    void queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
    void queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
    void queryClient.invalidateQueries({ queryKey: ['product-lots'] });
  };

  const createCount = useMutation({
    mutationFn: (values: { warehouseId: string; note: string }) =>
      api<StockCountDto>('/stock/counts', {
        method: 'POST',
        body: { warehouseId: values.warehouseId, note: values.note || undefined },
        branchId: activeBranchId,
      }),
    onSuccess: (created) => {
      setCountOpen(false);
      setActiveCountId(created.id);
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const updateCountLine = useMutation({
    mutationFn: (payload: { countId: string; lineId: string; countedQty: number | null }) =>
      api<unknown>(`/stock/counts/${payload.countId}/lines`, {
        method: 'PATCH',
        body: { lines: [{ lineId: payload.lineId, countedQty: payload.countedQty }] },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const completeCount = useMutation({
    mutationFn: (payload: { countId: string; reason: string }) =>
      api<StockCountDto>(`/stock/counts/${payload.countId}/complete`, {
        method: 'POST',
        body: { reason: payload.reason },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setActionError(null);
      setActionInfo('Sayım tamamlandı; farklar düzeltme hareketi olarak deftere yazıldı.');
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const createTransfer = useMutation({
    mutationFn: (values: {
      fromWarehouseId: string;
      toWarehouseId: string;
      lines: { productId: string; lotId?: string; qty: number }[];
    }) =>
      api<StockTransferDto>('/stock/transfers', {
        method: 'POST',
        body: values,
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setTransferOpen(false);
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const dispatchTransfer = useMutation({
    mutationFn: (transferId: string) =>
      api<StockTransferDto>(`/stock/transfers/${transferId}/dispatch`, {
        method: 'PATCH',
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setActionError(null);
      setActionInfo('Transfer sevk edildi; kaynak stok düşürüldü, miktar yolda görünüyor.');
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const receiveTransfer = useMutation({
    mutationFn: (transferId: string) =>
      api<StockTransferDto>(`/stock/transfers/${transferId}/receive`, {
        method: 'PATCH',
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setActionError(null);
      setActionInfo('Transfer teslim alındı; hedef depo stoğu artırıldı.');
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const busy =
    createCount.isPending ||
    updateCountLine.isPending ||
    completeCount.isPending ||
    createTransfer.isPending ||
    dispatchTransfer.isPending ||
    receiveTransfer.isPending;

  return (
    <div className="space-y-6" data-testid="stok-hareketleri-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Stok Hareketleri</h1>
          <p className="text-sm text-muted-foreground">
            Defter append-only durur: kayıtlar güncellenemez ve silinemez; düzeltme telafi hareketiyle yapılır.
          </p>
        </div>
        {canAdjust ? (
          <Button type="button" variant="outline" data-testid="sayim-baslat" onClick={() => setCountOpen(true)}>
            <ClipboardList aria-hidden="true" />
            Sayım Başlat
          </Button>
        ) : null}
      </div>

      {actionError ? (
        <div role="alert" className="rounded-md border border-border bg-[var(--status-danger-bg)] px-4 py-3 text-sm text-status-danger">
          {actionError}
        </div>
      ) : null}
      {actionInfo ? (
        <div role="status" className="rounded-md border border-border bg-[var(--status-success-bg)] px-4 py-3 text-sm text-status-success">
          {actionInfo}
        </div>
      ) : null}

      {activeCount ? (
        <Card>
          <CardContent className="pt-4">
            <StockCountSheet
              count={activeCount}
              busy={busy}
              onComplete={(reason) => completeCount.mutate({ countId: activeCount.id, reason })}
              onCountLine={(lineId, countedQty) =>
                updateCountLine.mutate({ countId: activeCount.id, lineId, countedQty })
              }
            />
          </CardContent>
        </Card>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="defter" data-testid="tab-defter">
            Hareket Defteri
          </TabsTrigger>
          <TabsTrigger value="transferler" data-testid="tab-transferler">
            Transferler
          </TabsTrigger>
        </TabsList>

        <TabsContent value="defter" className="space-y-3">
          <div className="max-w-56">
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger data-testid="hareket-tur-filtre" aria-label="Hareket türü filtresi">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm türler</SelectItem>
                {MOVEMENT_KIND_CATALOG.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="pt-4">
              {movementsQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : movementsQuery.isError ? (
                <ErrorState title="Defter yüklenemedi" description="Hareket listesi alınamadı." />
              ) : (
                <MovementLedgerTable movements={movementsQuery.data?.items ?? []} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transferler">
          <Card>
            <CardContent className="pt-4">
              {transfersQuery.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : transfersQuery.isError ? (
                <ErrorState title="Transferler yüklenemedi" description="Transfer listesi alınamadı." />
              ) : (
                <TransferPanel
                  transfers={transfersQuery.data?.items ?? []}
                  canManage={canTransfer}
                  busy={busy}
                  onCreate={() => setTransferOpen(true)}
                  onDispatch={(transfer) => dispatchTransfer.mutate(transfer.id)}
                  onReceive={(transfer) => receiveTransfer.mutate(transfer.id)}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <StockCountCreateDialog
        open={receiptCountOpen}
        warehouses={warehouseOptions}
        saving={busy}
        onOpenChange={setCountOpen}
        onSubmit={(values) => createCount.mutate(values)}
      />

      <TransferCreateDialog
        open={transferOpen}
        warehouses={warehouseOptions}
        products={products}
        lotsByWarehouse={lotsForTransfer}
        saving={busy}
        onOpenChange={setTransferOpen}
        onSubmit={(values) => createTransfer.mutate(values)}
      />
    </div>
  );
}
