'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Truck } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState } from '@/components/design-system/state-views';
import { LotTable } from '@/components/inventory/lot-table';
import {
  ProductFormDialog,
  type ProductFormValues,
} from '@/components/inventory/product-form-dialog';
import {
  ReceiptDialog,
  type ReceiptFormValues,
} from '@/components/inventory/receipt-dialog';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import { formatQty } from '@/lib/inventory-format';
import type {
  LotViewDto,
  ProductCategoryDto,
  ProductDto,
  StockBalanceDto,
  SupplierDto,
  UnitDto,
} from '@/lib/api-types';

/**
 * Faz 07 — ürün kataloğu: ürün kartları, depo bazlı bakiyeler, parti
 * görünümü ve mal kabul/tüketim aksiyonları. Yazma uçları izinle;
 * izin yoksa salt-okunur.
 */

type WarehouseRaw = {
  id: string;
  name: string;
  branch?: { name: string };
  branchName?: string;
};

export default function ProductsPage() {
  const { activeBranchId, hasPermission } = useAuth();
  const canManageProducts = hasPermission('product.manage');
  const canReceive = hasPermission('inventory.receive');
  const canConsume = hasPermission('inventory.consume');
  const canTransfer = hasPermission('inventory.transfer');
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [consumeOpen, setConsumeOpen] = useState(false);
  const [consumeQty, setConsumeQty] = useState('1');
  const [consumeNote, setConsumeNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  const productsQuery = useQuery({
    queryKey: ['products', 'katalog', search],
    queryFn: () =>
      api<{ items: ProductDto[] }>(
        `/products${search ? `?search=${encodeURIComponent(search)}` : ''}`,
        { branchId: activeBranchId },
      ),
    placeholderData: keepPreviousData,
  });
  const categoriesQuery = useQuery({
    queryKey: ['product-categories'],
    queryFn: () => api<{ items: ProductCategoryDto[] }>('/product-categories', { branchId: activeBranchId }),
  });
  const unitsQuery = useQuery({
    queryKey: ['units'],
    queryFn: () => api<{ items: UnitDto[] }>('/units', { branchId: activeBranchId }),
  });
  const suppliersQuery = useQuery({
    queryKey: ['suppliers', 'aktif'],
    queryFn: () => api<{ items: SupplierDto[] }>('/suppliers?active=true', { branchId: activeBranchId }),
  });
  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'tum'],
    queryFn: () => api<WarehouseRaw[] | { items: WarehouseRaw[] }>('/warehouses', { branchId: activeBranchId }),
  });

  const selectedIdFinal = selectedId ?? productsQuery.data?.items[0]?.id ?? null;
  const balancesQuery = useQuery({
    queryKey: ['stock-balances', 'urun', selectedIdFinal],
    queryFn: () =>
      api<{ items: StockBalanceDto[] }>(`/stock/balances?productId=${selectedIdFinal}`, {
        branchId: activeBranchId,
      }),
    enabled: Boolean(selectedIdFinal),
  });
  const lotsQuery = useQuery({
    queryKey: ['product-lots', selectedIdFinal, 'bloklu'],
    queryFn: () =>
      api<{ items: LotViewDto[] }>(
        `/products/${selectedIdFinal}/lots?includeBlocked=true`,
        { branchId: activeBranchId },
      ),
    enabled: Boolean(selectedIdFinal),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['products'] });
    void queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
    void queryClient.invalidateQueries({ queryKey: ['product-lots'] });
    void queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    void queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
  };

  const createProduct = useMutation({
    mutationFn: (values: ProductFormValues) =>
      api<ProductDto>('/products', {
        method: 'POST',
        body: {
          code: values.code,
          name: values.name,
          categoryId: values.categoryId === 'none' ? undefined : values.categoryId,
          barcode: values.barcode || undefined,
          trackingType: values.trackingType,
          baseUnitId: values.baseUnitId,
          minStock: values.minStock,
          defaultSalePrice: values.defaultSalePrice || undefined,
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

  const updateProduct = useMutation({
    mutationFn: (payload: { id: string; values: Partial<ProductFormValues> }) =>
      api<ProductDto>(`/products/${payload.id}`, {
        method: 'PATCH',
        body: {
          ...(payload.values.name !== undefined ? { name: payload.values.name } : {}),
          ...(payload.values.categoryId !== undefined
            ? { categoryId: payload.values.categoryId === 'none' ? null : payload.values.categoryId }
            : {}),
          ...(payload.values.barcode !== undefined ? { barcode: payload.values.barcode || '' } : {}),
          ...(payload.values.minStock !== undefined ? { minStock: payload.values.minStock } : {}),
          ...(payload.values.defaultSalePrice !== undefined
            ? { defaultSalePrice: payload.values.defaultSalePrice }
            : {}),
          ...(payload.values.notes !== undefined ? { notes: payload.values.notes } : {}),
          ...(payload.values.active !== undefined ? { active: payload.values.active } : {}),
        },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setFormOpen(false);
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const createReceipt = useMutation({
    mutationFn: (values: ReceiptFormValues) =>
      api<unknown>('/stock/receipts', {
        method: 'POST',
        body: {
          warehouseId: values.warehouseId,
          supplierId: values.supplierId === 'none' ? undefined : values.supplierId,
          note: values.note || undefined,
          lines: values.lines.map((line) => ({
            productId: line.productId,
            lotCode: line.lotCode || undefined,
            expiresAt: line.expiresAt || undefined,
            unitCost: line.unitCost,
            qty: line.qty,
          })),
        },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setReceiptOpen(false);
      setActionError(null);
      setActionInfo('Mal kabul deftere yazıldı.');
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const createConsumption = useMutation({
    mutationFn: (payload: { productId: string; qty: number; note: string }) =>
      api<unknown>('/stock/consumptions', {
        method: 'POST',
        body: {
          // Tüketim deposu: ürünün aktif bakiyesinin ilk deposu
          warehouseId: balancesQuery.data?.items[0]?.warehouseId ?? '',
          note: payload.note || undefined,
          lines: [{ productId: payload.productId, qty: payload.qty }],
        },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setConsumeOpen(false);
      setConsumeQty('1');
      setConsumeNote('');
      setActionError(null);
      setActionInfo('Tüketim FEFO tahsisiyle deftere yazıldı.');
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const products = useMemo(() => productsQuery.data?.items ?? [], [productsQuery.data]);
  const categories = categoriesQuery.data?.items ?? [];
  const units = unitsQuery.data?.items ?? [];
  const suppliers = suppliersQuery.data?.items ?? [];
  const warehousesRaw = warehousesQuery.data;
  const warehouses: WarehouseRaw[] = Array.isArray(warehousesRaw)
    ? warehousesRaw
    : (warehousesRaw?.items ?? []);
  const selected = products.find((p) => p.id === selectedIdFinal) ?? null;
  const editing = formOpen ? (editingId ? (products.find((p) => p.id === editingId) ?? null) : null) : null;
  const balances = balancesQuery.data?.items ?? [];
  const lots = lotsQuery.data?.items ?? [];
  const busy =
    createProduct.isPending || updateProduct.isPending || createReceipt.isPending || createConsumption.isPending;

  const warehouseOptions = warehouses.map((w) => ({
    id: w.id,
    name: w.name,
    branchName: w.branch?.name ?? w.branchName ?? '',
  }));

  return (
    <div className="space-y-6" data-testid="urunler-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Ürünler</h1>
          <p className="text-sm text-muted-foreground">
            Ürün kartları, depo bazlı bakiyeler, parti/SKT takibi ve stok aksiyonları.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canReceive ? (
            <Button
              type="button"
              variant="outline"
              data-testid="mal-kabul-yeni"
              onClick={() => setReceiptOpen(true)}
            >
              <Plus aria-hidden="true" />
              Mal Kabul
            </Button>
          ) : null}
          {canManageProducts ? (
            <Button
              type="button"
              data-testid="urun-yeni"
              onClick={() => {
                setEditingId(null);
                setFormOpen(true);
              }}
            >
              <Plus aria-hidden="true" />
              Yeni Ürün
            </Button>
          ) : null}
        </div>
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

      <div className="relative max-w-md">
        <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ürün adı, SKU veya barkod ara…"
          aria-label="Ürün ara"
          className="pl-9"
          data-testid="urun-arama"
        />
      </div>

      {productsQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : productsQuery.isError ? (
        <ErrorState title="Ürünler yüklenemedi" description="Ürün listesi alınamadı. Sayfayı yenilemeyi deneyin." />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Ürün</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Takip</TableHead>
                    <TableHead>Min. Stok</TableHead>
                    <TableHead>Durum</TableHead>
                    {canManageProducts ? <TableHead aria-label="Eylemler" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody data-testid="urun-tablo">
                  {products.map((product) => (
                    <TableRow
                      key={product.id}
                      className={selectedIdFinal === product.id ? 'bg-brand-50/60' : undefined}
                    >
                      <TableCell className="font-mono text-xs">{product.code}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="text-left font-medium underline-offset-4 hover:underline"
                          onClick={() => setSelectedId(product.id)}
                          data-testid="urun-sec"
                        >
                          {product.name}
                        </button>
                      </TableCell>
                      <TableCell>{product.category?.name ?? '—'}</TableCell>
                      <TableCell>{product.trackingType === 'lot' ? 'Parti/SKT' : 'Partisiz'}</TableCell>
                      <TableCell className="tabular-nums">
                        {formatQty(product.minStock)} {product.baseUnit.name}
                      </TableCell>
                      <TableCell>{product.active ? 'Aktif' : 'Pasif'}</TableCell>
                      {canManageProducts ? (
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`${product.name} düzenle`}
                            data-testid="urun-duzenle"
                            onClick={() => {
                              setEditingId(product.id);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                  {products.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManageProducts ? 7 : 6} className="text-center text-sm text-muted-foreground">
                        Ürün kaydı yok.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardContent className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Depo Bakiyeleri</h2>
                  {selected && canConsume ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid="tuketim-ac"
                      disabled={balances.length === 0}
                      onClick={() => setConsumeOpen(true)}
                    >
                      Tüketim
                    </Button>
                  ) : null}
                </div>
                {selected ? (
                  balances.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Depo</TableHead>
                          <TableHead>Parti</TableHead>
                          <TableHead>Bakiye</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody data-testid="urun-bakiyeler">
                        {balances.map((balance) => (
                          <TableRow key={balance.id}>
                            <TableCell className="text-sm">
                              {balance.warehouseName}
                              {balance.lowStock ? (
                                <span className="ml-2 rounded bg-[var(--status-warning-bg)] px-1.5 py-0.5 text-xs text-status-warning">
                                  düşük
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{balance.lotCode ?? '—'}</TableCell>
                            <TableCell className="tabular-nums">
                              {formatQty(balance.qtyOnHand)} {balance.unit}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground" data-testid="urun-bakiye-bos">
                      Bu ürün için stok bakiyesi yok.
                    </p>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Bakiyeler için listeden bir ürün seçin.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 pt-4">
                <h2 className="font-semibold">Partiler (FEFO)</h2>
                {selected ? (
                  selected.trackingType === 'lot' ? (
                    lotsQuery.isLoading ? (
                      <Skeleton className="h-24 w-full" />
                    ) : (
                      <LotTable lots={lots} testId="urun-partiler" />
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Bu ürün parti takipli değildir; stok depo bazlı toplanır.
                    </p>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">Partiler için ürün seçin.</p>
                )}
              </CardContent>
            </Card>

            {canTransfer && selected ? (
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Truck aria-hidden="true" className="size-4" />
                    Şubeler arası transferler{' '}
                    <a href="/stok-hareketleri?tab=transferler" className="underline underline-offset-4">
                      Stok Hareketleri sayfasından
                    </a>{' '}
                    yönetilir.
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      )}

      <ProductFormDialog
        key={editing?.id ?? 'yeni'}
        open={formOpen}
        editing={editing}
        categories={categories}
        units={units}
        saving={busy}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setActionError(null);
        }}
        onSubmit={(values) => {
          if (editing) {
            updateProduct.mutate({
              id: editing.id,
              values: {
                name: values.name,
                categoryId: values.categoryId,
                barcode: values.barcode,
                minStock: values.minStock,
                defaultSalePrice: values.defaultSalePrice,
                notes: values.notes,
                active: values.active,
              },
            });
          } else {
            createProduct.mutate(values);
          }
        }}
      />

      <ReceiptDialog
        open={receiptOpen}
        warehouses={warehouseOptions}
        products={products}
        suppliers={suppliers}
        saving={busy}
        onOpenChange={setReceiptOpen}
        onSubmit={(values) => createReceipt.mutate(values)}
      />

      <Dialog open={consumeOpen} onOpenChange={setConsumeOpen}>
        <DialogContent data-testid="consume-dialog">
          <DialogHeader>
            <DialogTitle>Stok Tüketimi</DialogTitle>
            <DialogDescription>
              Parti seçilmezse FEFO önerisi uygulanır: en yakın son kullanma tarihli
              kullanılabilir partiden düşülür; süresi geçmiş ve karantina partileri blokludur.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="consume-qty">Miktar</Label>
              <Input
                id="consume-qty"
                data-testid="consume-qty"
                type="number"
                min="0.001"
                step="0.001"
                value={consumeQty}
                onChange={(e) => setConsumeQty(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="consume-note">Not</Label>
              <Input
                id="consume-note"
                data-testid="consume-note"
                value={consumeNote}
                onChange={(e) => setConsumeNote(e.target.value)}
                placeholder="Muayene, dozaj, açıklama…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConsumeOpen(false)}>
              Vazgeç
            </Button>
            <Button
              type="button"
              data-testid="consume-save"
              disabled={busy || !selected || Number(consumeQty) <= 0}
              onClick={() =>
                selected &&
                createConsumption.mutate({
                  productId: selected.id,
                  qty: Number(consumeQty),
                  note: consumeNote,
                })
              }
            >
              {busy ? 'Kaydediliyor…' : 'Tüket'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
