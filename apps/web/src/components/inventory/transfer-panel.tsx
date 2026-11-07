'use client';

import { useState } from 'react';
import { ArrowRight, PackageCheck, Plus, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { LotViewDto, ProductDto, StockTransferDto } from '@/lib/api-types';

export function TransferStatusBadge({ status }: { status: StockTransferDto['status'] }) {
  const map: Record<StockTransferDto['status'], { label: string; className: string }> = {
    draft: { label: 'Taslak', className: 'bg-muted text-muted-foreground' },
    dispatched: {
      label: 'Yolda',
      className:
        'bg-[var(--status-info-bg)] font-medium text-status-info border border-status-info/40',
    },
    received: {
      label: 'Teslim Alındı',
      className:
        'bg-[var(--status-success-bg)] font-medium text-status-success border border-status-success/30',
    },
    cancelled: { label: 'İptal', className: 'bg-muted text-muted-foreground line-through' },
  };
  const item = map[status];
  return <Badge variant="outline" className={item.className}>{item.label}</Badge>;
}

/**
 * Transfer kurulum diyaloğu — kaynak depo/parti + hedef depo + satırlar.
 * Lot takipli üründe kaynak parti seçimi zorunludur.
 */
export function TransferCreateDialog({
  open,
  warehouses,
  products,
  lotsByWarehouse,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  warehouses: { id: string; name: string; branchName: string }[];
  products: ProductDto[];
  /** warehouseId → seçilebilir partiler (bloklu partiler hariç) */
  lotsByWarehouse: Record<string, LotViewDto[]>;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: {
    fromWarehouseId: string;
    toWarehouseId: string;
    lines: { productId: string; lotId?: string; qty: number }[];
  }) => void;
}) {
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [lines, setLines] = useState<{ productId: string; lotId: string; qty: number }[]>([
    { productId: '', lotId: '', qty: 0 },
  ]);

  const sourceLots = lotsByWarehouse[fromWarehouseId] ?? [];
  const updateLine = (index: number, patch: Partial<{ productId: string; lotId: string; qty: number }>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };
  const lotTrackedSelected = lines.some((line) => {
    const product = products.find((p) => p.id === line.productId);
    return product?.trackingType === 'lot';
  });
  const linesValid = lines.every((line) => {
    if (!line.productId || line.qty <= 0) return false;
    const product = products.find((p) => p.id === line.productId);
    if (product?.trackingType === 'lot') return line.lotId !== '';
    return true;
  });
  const canSubmit = fromWarehouseId !== '' && toWarehouseId !== '' && fromWarehouseId !== toWarehouseId && linesValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" data-testid="transfer-create-dialog">
        <DialogHeader>
          <DialogTitle>Yeni Transfer</DialogTitle>
          <DialogDescription>
            İki aşamalı: sevk kaynak stoğu düşer (yolda), teslim hedef depoyu artırır.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="transfer-from">Kaynak Depo</Label>
              <Select value={fromWarehouseId} onValueChange={(id) => { setFromWarehouseId(id); setLines([{ productId: '', lotId: '', qty: 0 }]); }}>
                <SelectTrigger id="transfer-from" data-testid="transfer-from">
                  <SelectValue placeholder="Kaynak depo" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} · {w.branchName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-to">Hedef Depo</Label>
              <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
                <SelectTrigger id="transfer-to" data-testid="transfer-to">
                  <SelectValue placeholder="Hedef depo" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.filter((w) => w.id !== fromWarehouseId).map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} · {w.branchName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Satırlar</Label>
            {lines.map((line, index) => (
              <div key={index} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-3" data-testid={`transfer-line-${index}`}>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor={`transfer-product-${index}`}>Ürün</Label>
                  <Select value={line.productId} onValueChange={(productId) => updateLine(index, { productId, lotId: '' })}>
                    <SelectTrigger id={`transfer-product-${index}`}>
                      <SelectValue placeholder="Ürün seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.code} · {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`transfer-qty-${index}`}>Miktar</Label>
                  <Input
                    id={`transfer-qty-${index}`}
                    type="number"
                    min="0"
                    step="0.001"
                    value={line.qty}
                    onChange={(e) => updateLine(index, { qty: Number(e.target.value) || 0 })}
                  />
                </div>
                {lotTrackedSelected ? (
                  <div className="space-y-1.5 md:col-span-3">
                    <Label htmlFor={`transfer-lot-${index}`}>Kaynak Parti</Label>
                    <Select value={line.lotId} onValueChange={(lotId) => updateLine(index, { lotId })}>
                      <SelectTrigger id={`transfer-lot-${index}`} data-testid={`transfer-lot-${index}`}>
                        <SelectValue placeholder="Parti seçin (FEFO sıralı)" />
                      </SelectTrigger>
                      <SelectContent>
                        {sourceLots
                          .filter((lot) => lot.qtyOnHand > 0)
                          .map((lot) => (
                            <SelectItem key={lot.id} value={lot.id}>
                              {lot.lotCode} · SKT {lot.expiresAt ? new Date(lot.expiresAt).toLocaleDateString('tr-TR') : '—'} · {lot.qtyOnHand}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLines((prev) => [...prev, { productId: '', lotId: '', qty: 0 }])}
            >
              <Plus aria-hidden="true" />
              Satır Ekle
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            type="button"
            data-testid="transfer-save"
            disabled={saving || !canSubmit}
            onClick={() =>
              onSubmit({
                fromWarehouseId,
                toWarehouseId,
                lines: lines.map((line) => ({
                  productId: line.productId,
                  lotId: line.lotId || undefined,
                  qty: line.qty,
                })),
              })
            }
          >
            {saving ? 'Kaydediliyor…' : 'Transfer Oluştur'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Transfer listesi — sevk/teslim aksiyonları ve yoldaki miktar görünümü
 * (kabul kriteri 4: dispatch sonrası in-transit, receive sonrası hedef artar).
 */
export function TransferPanel({
  transfers,
  canManage,
  busy,
  onCreate,
  onDispatch,
  onReceive,
}: {
  transfers: StockTransferDto[];
  canManage?: boolean;
  busy?: boolean;
  onCreate?: () => void;
  onDispatch?: (transfer: StockTransferDto) => void;
  onReceive?: (transfer: StockTransferDto) => void;
}) {
  return (
    <div className="space-y-3" data-testid="transfer-panel">
      {canManage ? (
        <div className="flex justify-end">
          <Button type="button" size="sm" data-testid="transfer-yeni" onClick={() => onCreate?.()}>
            <Plus aria-hidden="true" />
            Yeni Transfer
          </Button>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kod</TableHead>
              <TableHead>Rota</TableHead>
              <TableHead>Satırlar</TableHead>
              <TableHead>Durum</TableHead>
              {canManage ? (
              <TableHead>
                <span className="sr-only">Eylemler</span>
              </TableHead>
            ) : null}
            </TableRow>
          </TableHeader>
          <TableBody data-testid="transfer-table">
            {transfers.map((transfer) => (
              <TableRow key={transfer.id} data-testid="transfer-table-satir">
                <TableCell className="font-mono text-xs">{transfer.code}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-sm">
                    <span>{transfer.fromWarehouse.name}</span>
                    <ArrowRight aria-hidden="true" className="size-3 text-muted-foreground" />
                    <span>{transfer.toWarehouse.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {transfer.fromWarehouse.branch.name} → {transfer.toWarehouse.branch.name}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5 text-sm">
                    {transfer.lines.map((line) => (
                      <div key={line.id}>
                        {line.product.code} · {line.qty}
                        {line.lot ? ` (${line.lot.lotCode})` : ''}
                        {line.receivedLot ? (
                          <span className="text-status-success"> → {line.receivedLot.lotCode}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <TransferStatusBadge status={transfer.status} />
                </TableCell>
                {canManage ? (
                  <TableCell>
                    <div className="flex gap-2">
                      {transfer.status === 'draft' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-testid="transfer-dispatch"
                          disabled={busy}
                          onClick={() => onDispatch?.(transfer)}
                        >
                          <Truck aria-hidden="true" />
                          Sevk Et
                        </Button>
                      ) : null}
                      {transfer.status === 'dispatched' ? (
                        <Button
                          type="button"
                          size="sm"
                          data-testid="transfer-receive"
                          disabled={busy}
                          onClick={() => onReceive?.(transfer)}
                        >
                          <PackageCheck aria-hidden="true" />
                          Teslim Al
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {transfers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 5 : 4} className="text-center text-sm text-muted-foreground">
                  Transfer kaydı yok.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
