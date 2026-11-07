'use client';

import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
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
import { countDifference, round3 } from '@/lib/inventory-format';
import type { StockCountDto } from '@/lib/api-types';

/**
 * Sayım başlatma diyaloğu — depo seçilir, açılışta mevcut bakiyeler
 * beklenen miktar olarak dondurulur.
 */
export function StockCountCreateDialog({
  open,
  warehouses,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  warehouses: { id: string; name: string; branchName: string }[];
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { warehouseId: string; note: string }) => void;
}) {
  const [warehouseId, setWarehouseId] = useState('');
  const [note, setNote] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="count-create-dialog">
        <DialogHeader>
          <DialogTitle>Sayım Başlat</DialogTitle>
          <DialogDescription>
            Depodaki mevcut bakiyeler beklenen miktar olarak dondurulur; farklar
            gerekçe ile tamamlandığında düzeltme hareketi olarak işlenir.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="count-warehouse">Depo</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger id="count-warehouse" data-testid="count-warehouse">
                <SelectValue placeholder="Depo seçin" />
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
            <Label htmlFor="count-note">Not</Label>
            <Input
              id="count-note"
              data-testid="count-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Sayım açıklaması (opsiyonel)"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            type="button"
            data-testid="count-create-save"
            disabled={saving || !warehouseId}
            onClick={() => onSubmit({ warehouseId, note })}
          >
            {saving ? 'Oluşturuluyor…' : 'Föyü Oluştur'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Sayım föyü — beklenen/sayılan/fark; tamamlama gerekçe ister (kabul
 * kriteri 5). Sayılmayan satırlar atlanır (değişiklik yapılmaz).
 */
export function StockCountSheet({
  count,
  busy,
  onComplete,
  onCountLine,
}: {
  count: StockCountDto;
  busy?: boolean;
  onComplete: (reason: string) => void;
  onCountLine: (lineId: string, countedQty: number | null) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="space-y-4" data-testid="count-sheet">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">Sayım föyü {count.code}</div>
          <div className="text-sm text-muted-foreground">
            {count.warehouse.name} · {count.warehouse.branch.name}
          </div>
        </div>
        <Badge variant="outline">{count.status === 'draft' ? 'Taslak' : 'Tamamlandı'}</Badge>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ürün</TableHead>
              <TableHead>Parti</TableHead>
              <TableHead>Beklenen</TableHead>
              <TableHead>Sayılan</TableHead>
              <TableHead>Fark</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody data-testid="count-sheet-lines">
            {count.lines.map((line) => {
              const diff = countDifference(Number(line.expectedQty), line.countedQty === null ? null : Number(line.countedQty));
              return (
                <TableRow key={line.id}>
                  <TableCell className="text-sm">{line.product.code} · {line.product.name}</TableCell>
                  <TableCell className="font-mono text-xs">{line.lot?.lotCode ?? '—'}</TableCell>
                  <TableCell className="tabular-nums">{line.expectedQty}</TableCell>
                  <TableCell>
                    {count.status === 'draft' ? (
                      <Input
                        type="number"
                        min="0"
                        step="0.001"
                        className="h-8 w-24"
                        aria-label={`${line.product.code} sayılan miktar`}
                        data-testid="count-line-input"
                        value={line.countedQty ?? ''}
                        onChange={(e) =>
                          onCountLine(
                            line.id,
                            e.target.value === '' ? null : Number(e.target.value),
                          )
                        }
                      />
                    ) : (
                      <span className="tabular-nums">{line.countedQty ?? '—'}</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {diff === null ? (
                      '—'
                    ) : diff === 0 ? (
                      <span className="text-status-success">0</span>
                    ) : (
                      <span className={diff > 0 ? 'text-status-success' : 'text-status-danger'}>
                        {diff > 0 ? `+${diff}` : diff}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {count.status === 'draft' ? (
        <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="count-reason">Tamamlama Gerekçesi (zorunlu)</Label>
            <Input
              id="count-reason"
              data-testid="count-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Örn. Kırık ambalaj, düzeltme senaryosu…"
            />
          </div>
          <Button
            type="button"
            data-testid="count-complete"
            disabled={busy || reason.trim().length < 3}
            onClick={() => onComplete(reason)}
          >
            <ClipboardCheck aria-hidden="true" />
            Sayımı Tamamla
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Sayım {count.completedAt ? new Date(count.completedAt).toLocaleString('tr-TR') : ''} tarihinde tamamlandı.
        </p>
      )}
    </div>
  );
}

export { round3 };
