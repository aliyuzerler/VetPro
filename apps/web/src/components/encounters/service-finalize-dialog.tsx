'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Plus, Trash2 } from 'lucide-react';
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
import { api, ApiError } from '@/lib/api-client';
import type {
  ConsumptionInput,
  ConsumptionPreview,
  ConsumptionPreviewLine,
  ServiceRecordDto,
} from '@/lib/api-types';

function formatMoney(value: number | string): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(
    Number(value),
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short' }).format(new Date(value));
}

/** Bir ürün için düzenlenebilir tahsis satırı (lot + depo + miktar). */
type AllocRow = { key: string; lotId: string | null; warehouseId: string | null; qty: string };

function defaultRows(line: ConsumptionPreviewLine): AllocRow[] {
  if (line.trackingType === 'none') {
    return [
      {
        key: `${line.productId}-none`,
        lotId: null,
        warehouseId: line.suggestedWarehouseId,
        qty: String(line.qty),
      },
    ];
  }
  return line.suggestedAllocations.map((a, i) => ({
    key: `${line.productId}-${a.lotId}-${i}`,
    lotId: a.lotId,
    warehouseId: line.suggestedWarehouseId,
    qty: String(a.qty),
  }));
}

/**
 * Faz 08 — kesinleştirme diyaloğu: kural planı + parti/depo/miktar onayı.
 * Preview API'den tüketim planını çeker; kullanıcı gerçek miktarı, depoyu ve
 * lotu düzenleyip onaylar. Yükleme/boş/hata/uyarı durumları açıkça gösterilir.
 * Idempotency anahtarı diyaloğu açan olay işleyicisinde üretilir — oturum
 * boyunca sabit kalır, mobil tekrar denemeleri duplicate yaratmaz.
 * Radix remount deseni: gövde yalnız open iken mount olur, state ilk değerle
 * tazelenir; ilk yükleme await-önce setState desenindedir (set-state-in-effect).
 */
export function ServiceFinalizeDialog({
  record,
  encounterId,
  branchId,
  idempotencyKey,
  open,
  onOpenChange,
  onConfirm,
  saving,
}: {
  record: ServiceRecordDto;
  encounterId: string;
  branchId: string;
  /** Diyaloğu açan olay işleyicisinde üretilir; oturum boyunca sabittir. */
  idempotencyKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    recordId: string,
    consumptions: ConsumptionInput[],
    idempotencyKey: string,
  ) => void;
  saving?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <FinalizeBody
          key={record.id}
          record={record}
          encounterId={encounterId}
          branchId={branchId}
          idempotencyKey={idempotencyKey}
          onOpenChange={onOpenChange}
          onConfirm={onConfirm}
          saving={saving}
        />
      ) : null}
    </Dialog>
  );
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; preview: ConsumptionPreview; rows: Record<string, AllocRow[]> };

function FinalizeBody({
  record,
  encounterId,
  branchId,
  idempotencyKey,
  onOpenChange,
  onConfirm,
  saving,
}: {
  record: ServiceRecordDto;
  encounterId: string;
  branchId: string;
  idempotencyKey: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    recordId: string,
    consumptions: ConsumptionInput[],
    idempotencyKey: string,
  ) => void;
  saving?: boolean;
}) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [rowSeq, setRowSeq] = useState(0);

  // Preview — react-query ile: yükleme/hata/yenileme durumları kütüphanede,
  // effect içinde setState gerekmez (set-state-in-effect uyumu).
  const previewQuery = useQuery({
    queryKey: ['service-record-consumption-preview', encounterId, record.id],
    queryFn: () =>
      api<ConsumptionPreview>(
        `/encounters/${encounterId}/service-records/${record.id}/consumption-preview`,
        { branchId },
      ),
    enabled: true,
    staleTime: 5_000,
  });

  const preview = previewQuery.data ?? null;
  const rows: Record<string, AllocRow[]> = useMemo(() => {
    if (!preview) return {};
    if (load.status === 'ready' && load.preview === preview) return load.rows;
    const next: Record<string, AllocRow[]> = {};
    for (const line of preview.consumptions) {
      next[line.productId] = defaultRows(line);
    }
    return next;
  }, [preview, load]);
  const loading = previewQuery.isPending;
  const loadError =
    previewQuery.error instanceof ApiError
      ? `${previewQuery.error.message} (${previewQuery.error.code ?? 'HATA'})`
      : previewQuery.error
        ? 'Önizleme alınamadı'
        : null;

  const lotByProduct = useMemo(() => {
    const map = new Map<string, ConsumptionPreviewLine['lots']>();
    for (const line of preview?.consumptions ?? []) {
      map.set(line.productId, line.lots);
    }
    return map;
  }, [preview]);

  const allocatedQty = (line: ConsumptionPreviewLine): number => {
    const list = rows[line.productId] ?? [];
    return list.reduce((acc, r) => acc + (Number(r.qty.replace(',', '.')) || 0), 0);
  };

  const missingLot = (line: ConsumptionPreviewLine): boolean => {
    if (line.trackingType === 'none') return false;
    return (rows[line.productId] ?? []).some((r) => !r.lotId);
  };

  const requiredUnmet = (line: ConsumptionPreviewLine): boolean =>
    line.required && allocatedQty(line) + 0.0001 < line.qty;

  const blockingIssue = (line: ConsumptionPreviewLine): string | null => {
    if (line.shortfall > 0 && allocatedQty(line) + 0.0001 < line.qty) {
      return `Seçilebilir stok yetersiz: gereken ${line.qty}, mevcut ${line.qty - line.shortfall}`;
    }
    if (missingLot(line)) return 'Parti takipli ürün için parti seçilmelidir';
    if (requiredUnmet(line)) return 'Zorunlu tüketim eksiksiz onaylanmalı';
    return null;
  };

  const anyBlocking = (preview?.consumptions ?? []).some((l) => blockingIssue(l) !== null);

  const buildConsumptions = (): ConsumptionInput[] => {
    const out: ConsumptionInput[] = [];
    for (const line of preview?.consumptions ?? []) {
      for (const row of rows[line.productId] ?? []) {
        const qty = Number(row.qty.replace(',', '.'));
        if (!Number.isFinite(qty) || qty <= 0) continue;
        if (line.trackingType !== 'none' && !row.lotId) continue;
        const lot = (lotByProduct.get(line.productId) ?? []).find((l) => l.lotId === row.lotId);
        out.push({
          productId: line.productId,
          warehouseId: lot?.warehouseId ?? row.warehouseId ?? line.suggestedWarehouseId ?? '',
          ...(line.trackingType !== 'none' && row.lotId ? { lotId: row.lotId } : {}),
          qty,
        });
      }
    }
    return out;
  };

  const updateRow = (productId: string, key: string, patch: Partial<AllocRow>): void => {
    setLoad({
      status: 'ready',
      preview: preview!,
      rows: {
        ...rows,
        [productId]: (rows[productId] ?? []).map((r) =>
          r.key === key ? { ...r, ...patch } : r,
        ),
      },
    });
  };

  const removeRow = (productId: string, key: string): void => {
    setLoad({
      status: 'ready',
      preview: preview!,
      rows: {
        ...rows,
        [productId]: (rows[productId] ?? []).filter((r) => r.key !== key),
      },
    });
  };

  const addRow = (line: ConsumptionPreviewLine): void => {
    // Saat yerine sayıcı: render-saf (react-hooks/purity)
    const seq = rowSeq + 1;
    setRowSeq(seq);
    setLoad({
      status: 'ready',
      preview: preview!,
      rows: {
        ...rows,
        [line.productId]: [
          ...(rows[line.productId] ?? []),
          {
            key: `${line.productId}-new-${seq}`,
            lotId: null,
            warehouseId: line.suggestedWarehouseId,
            qty: '1',
          },
        ],
      },
    });
  };

  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl" data-testid="finalize-dialog">
        <DialogHeader>
          <DialogTitle>Hizmet Kaydını Kesinleştir</DialogTitle>
          <DialogDescription>
            Kural planındaki malzeme tüketimini onaylayın. Kesinleştirme stok çıkışı ve
            ücreti tek işlemde yazar; iptal için ters hareket oluşturulur.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div
            className="flex items-center gap-2 py-8 text-sm text-muted-foreground"
            data-testid="finalize-preview-loading"
          >
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Tüketim planı hazırlanıyor…
          </div>
        ) : loadError ? (
          <div className="space-y-3 py-4" data-testid="finalize-preview-error">
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle aria-hidden="true" className="size-4" />
              {loadError}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void previewQuery.refetch()}
            >
              Yeniden Dene
            </Button>
          </div>
        ) : !preview ? null : (
          <div className="space-y-4" data-testid="finalize-preview">
            {preview.consumptions.length === 0 && preview.issues.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="finalize-preview-empty">
                Bu kayıt için malzeme tüketimi önerilmiyor.
              </p>
            ) : null}

            {preview.issues.length > 0 ? (
              <ul className="space-y-1" data-testid="finalize-issues">
                {preview.issues.map((issue) => (
                  <li key={issue.code} className="text-xs text-muted-foreground">
                    • {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}

            {preview.consumptions.map((line) => {
              const block = blockingIssue(line);
              return (
                <div
                  key={line.ruleId}
                  className="rounded-md border border-border p-3"
                  data-testid={`finalize-line-${line.productCode ?? line.productId}`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {line.productName ?? line.productId}
                      </span>
                      {line.productCode ? (
                        <Badge variant="outline" className="text-[10px]">
                          {line.productCode}
                        </Badge>
                      ) : null}
                      {line.required ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Zorunlu
                        </Badge>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Plan: {line.qty} {line.unit ?? ''} ({line.allocationPolicy === 'manual' ? 'manuel' : line.allocationPolicy === 'nearest_expiry' ? 'SKT yakın' : 'FIFO'})
                    </span>
                  </div>

                  {line.trackingType === 'none' ? (
                    <div className="grid items-end gap-2 sm:grid-cols-[1fr_120px]">
                      <div className="space-y-1">
                        <Label htmlFor={`wh-${line.productId}`}>Depo</Label>
                        <Input
                          id={`wh-${line.productId}`}
                          value={line.suggestedWarehouseId ? 'Önerilen depo' : 'Depo yok'}
                          disabled
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`qty-${line.productId}`}>Miktar</Label>
                        <Input
                          id={`qty-${line.productId}`}
                          type="number"
                          step="0.001"
                          min="0"
                          value={rows[line.productId]?.[0]?.qty ?? ''}
                          onChange={(e) =>
                            rows[line.productId]?.[0] &&
                            updateRow(line.productId, rows[line.productId]![0]!.key, {
                              qty: e.target.value,
                            })
                          }
                          data-testid={`finalize-qty-${line.productCode ?? line.productId}`}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(rows[line.productId] ?? []).map((row) => (
                        <div
                          key={row.key}
                          className="grid items-end gap-2 sm:grid-cols-[1fr_110px_40px]"
                        >
                          <div className="space-y-1">
                            <Label>Parti (lot · SKT · kalan)</Label>
                            {/* undefined başlangıç değeri → placeholder görünür (axe button-name) */}
                            <Select
                              value={row.lotId ?? undefined}
                              onValueChange={(v) => updateRow(line.productId, row.key, { lotId: v })}
                            >
                              <SelectTrigger
                                aria-label={`Parti seçin — ${line.productName ?? line.productId}`}
                                data-testid={`finalize-lot-${line.productCode ?? line.productId}`}
                              >
                                <SelectValue placeholder="Parti seçin" />
                              </SelectTrigger>
                              <SelectContent>
                                {line.lots.map((lot) => (
                                  <SelectItem
                                    key={lot.lotId}
                                    value={lot.lotId}
                                    disabled={lot.blockReason !== null}
                                  >
                                    {lot.lotCode} · {formatDate(lot.expiresAt)} · {lot.qtyOnHand}
                                    {lot.blockReason ? ` (${lot.blockReason})` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`qty-${line.productId}-${row.key}`}>Miktar</Label>
                            <Input
                              id={`qty-${line.productId}-${row.key}`}
                              aria-label={`Miktar — ${line.productName ?? line.productId}`}
                              type="number"
                              step="0.001"
                              min="0"
                              value={row.qty}
                              onChange={(e) => updateRow(line.productId, row.key, { qty: e.target.value })}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Tahsis satırını kaldır"
                            onClick={() => removeRow(line.productId, row.key)}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addRow(line)}
                        data-testid={`finalize-addlot-${line.productCode ?? line.productId}`}
                      >
                        <Plus aria-hidden="true" />
                        Parti Ekle
                      </Button>
                    </div>
                  )}

                  {block ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive" data-testid="finalize-line-warning">
                      <AlertTriangle aria-hidden="true" className="size-3.5" />
                      {block}
                    </p>
                  ) : line.warning ? (
                    <p className="mt-2 text-xs text-amber-600">{line.warning}</p>
                  ) : null}
                </div>
              );
            })}

            <div className="rounded-md bg-muted/50 p-3" data-testid="finalize-charge-preview">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Ücret önizlemesi</p>
              <ul className="space-y-0.5 text-sm">
                {preview.charge.lines.map((l) => (
                  <li key={l.description} className="flex justify-between gap-4">
                    <span>{l.description}</span>
                    <span>{formatMoney(l.total)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 flex justify-between gap-4 border-t border-border pt-1 text-sm font-medium">
                <span>Toplam</span>
                <span>{formatMoney(preview.charge.total)}</span>
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Vazgeç
          </Button>
          <Button
            type="button"
            data-testid="finalize-confirm"
            disabled={saving || loading || loadError !== null || anyBlocking}
            onClick={() =>
              onConfirm(record.id, buildConsumptions(), idempotencyKey || crypto.randomUUID())
            }
          >
            {saving ? 'Kesinleştiriliyor…' : 'Kesinleştir'}
          </Button>
        </DialogFooter>
      </DialogContent>
  );
}
