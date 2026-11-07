'use client';

import { useMemo, useState } from 'react';
import { Check, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import type { ConsumptionInput, ServiceDto, ServiceRecordDto } from '@/lib/api-types';
import { ServiceFinalizeDialog } from './service-finalize-dialog';
import { ServiceReverseDialog } from './service-reverse-dialog';

function formatMoney(value: string | number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(
    Number(value),
  );
}

export type ServiceLineInput = { serviceId: string; qty: number };

/**
 * Hizmet kaydı paneli — muayeneye hizmet ekleme (fiyat çözümü API'de: geçerlilik
 * + şube override) ve Faz 08 atomik kesinleştirme. Kesinleştirme, tüketim
 * önizlemesi diyaloğuyla onaylanır: stok çıkışı + ücret tek işlemde yazılır.
 * Kesinleşmiş kayıtta ücret özeti gösterilir; iptal (reversal) gerekçeyle
 * yapılır ve ters hareket üretir — orijinal veriler asla silinmez.
 */
export function ServiceRecordPanel({
  records,
  services,
  encounterId,
  branchId,
  editable,
  onAddRecord,
  onRemoveRecord,
  onFinalize,
  onReverse,
  saving,
}: {
  records: ServiceRecordDto[];
  services: ServiceDto[];
  encounterId: string;
  branchId: string;
  editable: boolean;
  onAddRecord?: (lines: ServiceLineInput[]) => void;
  onRemoveRecord?: (recordId: string) => void;
  onFinalize?: (recordId: string, consumptions: ConsumptionInput[], idempotencyKey: string) => void;
  onReverse?: (recordId: string, reason: string) => void;
  saving?: boolean;
}) {
  const activeServices = useMemo(() => services.filter((s) => s.active), [services]);
  const [serviceId, setServiceId] = useState('');
  const [qty, setQty] = useState('1');
  const [lines, setLines] = useState<ServiceLineInput[]>([]);
  const [finalizeSession, setFinalizeSession] = useState<{ recordId: string; key: string } | null>(
    null,
  );
  const [reverseRecordId, setReverseRecordId] = useState<string | null>(null);

  const addLine = (): void => {
    const parsedQty = Number(qty.replace(',', '.'));
    if (!serviceId || !Number.isFinite(parsedQty) || parsedQty <= 0) return;
    setLines((prev) => [
      ...prev.filter((l) => l.serviceId !== serviceId),
      { serviceId, qty: parsedQty },
    ]);
    setServiceId('');
    setQty('1');
  };

  const serviceName = (id: string): string =>
    services.find((s) => s.id === id)?.name ?? 'Bilinmeyen hizmet';

  const finalizeRecord = records.find((r) => r.id === finalizeSession?.recordId) ?? null;
  const reverseRecord = records.find((r) => r.id === reverseRecordId) ?? null;

  return (
    <div className="space-y-4" data-testid="service-record-panel">
      {editable ? (
        <div className="space-y-3">
          <div className="grid items-end gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="service-select">Hizmet</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger id="service-select" data-testid="service-select">
                  <SelectValue placeholder="Hizmet seçin" />
                </SelectTrigger>
                <SelectContent>
                  {activeServices.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="service-qty">Adet</Label>
              <Input
                id="service-qty"
                data-testid="service-qty"
                type="number"
                step="0.001"
                min="0.001"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <Button type="button" data-testid="service-line-add" onClick={addLine}>
              <Plus aria-hidden="true" />
              Satır Ekle
            </Button>
          </div>

          {lines.length > 0 ? (
            <ul className="space-y-1.5" data-testid="service-line-draft">
              {lines.map((line) => (
                <li
                  key={line.serviceId}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm"
                >
                  <span>
                    {serviceName(line.serviceId)} × {line.qty}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Satırı kaldır"
                    onClick={() =>
                      setLines((prev) => prev.filter((l) => l.serviceId !== line.serviceId))
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            data-testid="service-record-save"
            disabled={saving || lines.length === 0}
            onClick={() => {
              onAddRecord?.(lines);
              setLines([]);
            }}
          >
            {saving ? 'Kaydediliyor…' : 'Hizmet Kaydı Oluştur'}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="service-record-locked-note">
          İmzalı kayıt — hizmet eklenemez.
        </p>
      )}

      {records.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="service-record-empty">
          Hizmet kaydı yok.
        </p>
      ) : (
        <div className="space-y-4">
          {records.map((record) => (
            <div
              key={record.id}
              className="rounded-lg border border-border bg-card"
              data-testid="service-record"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {record.status === 'finalized' ? 'Kesinleşti' : 'Taslak'}
                  </Badge>
                  {record.reversedAt ? (
                    <Badge variant="secondary" className="text-xs" data-testid="service-record-reversed">
                      İptal edildi
                    </Badge>
                  ) : null}
                  {record.charge ? (
                    <Badge
                      variant={record.charge.status === 'void' ? 'secondary' : 'default'}
                      className="text-xs"
                      data-testid="service-record-charge"
                    >
                      Ücret: {formatMoney(record.charge.total)}
                      {record.charge.status === 'void' ? ' (void)' : ''}
                    </Badge>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {record.lines.length} satır
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {editable && record.status === 'draft' ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid="service-record-finalize"
                        // Idempotency anahtarı olay işleyicisinde üretilir:
                        // oturum boyunca sabit → mobil tekrar denemesi güvenli.
                        onClick={() =>
                          setFinalizeSession({ recordId: record.id, key: crypto.randomUUID() })
                        }
                      >
                        <Check aria-hidden="true" />
                        Kesinleştir
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Hizmet kaydını sil"
                        data-testid="service-record-delete"
                        onClick={() => onRemoveRecord?.(record.id)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </>
                  ) : null}
                  {editable && record.status === 'finalized' && !record.reversedAt ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      data-testid="service-record-reverse"
                      onClick={() => setReverseRecordId(record.id)}
                    >
                      <RotateCcw aria-hidden="true" />
                      İptal (Reversal)
                    </Button>
                  ) : null}
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hizmet</TableHead>
                    <TableHead>Adet</TableHead>
                    <TableHead>Birim Fiyat</TableHead>
                    <TableHead>Tutar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {record.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        {line.service.name}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({line.service.code})
                        </span>
                      </TableCell>
                      <TableCell>{Number(line.qty)}</TableCell>
                      <TableCell>{formatMoney(line.unitPrice)}</TableCell>
                      <TableCell className="font-medium">{formatMoney(line.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {record.charge && record.charge.lines.length > 0 ? (
                <div className="border-t border-border px-4 py-2" data-testid="service-record-charge-lines">
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {record.charge.lines.map((line) => (
                      <li key={line.id} className="flex justify-between gap-4">
                        <span>
                          {line.sourceType === 'service_reversal' ? '↩ ' : ''}
                          {line.description} × {Number(line.qty)}
                        </span>
                        <span>{formatMoney(line.total)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Kesinleştirme: tüketim onayı → stok defteri çıkışı + ücret tek işlemde.
            İptal: ters hareket + negatif ücret satırı — orijinal veriler korunur.
          </p>
        </div>
      )}

      {finalizeRecord && finalizeSession ? (
        <ServiceFinalizeDialog
          record={finalizeRecord}
          encounterId={encounterId}
          branchId={branchId}
          idempotencyKey={finalizeSession.key}
          open
          onOpenChange={(open) => {
            if (!open) setFinalizeSession(null);
          }}
          onConfirm={(recordId, consumptions, idempotencyKey) => {
            onFinalize?.(recordId, consumptions, idempotencyKey);
            setFinalizeSession(null);
          }}
          saving={saving}
        />
      ) : null}

      {reverseRecord ? (
        <ServiceReverseDialog
          record={reverseRecord}
          open
          onOpenChange={(open) => {
            if (!open) setReverseRecordId(null);
          }}
          onConfirm={(recordId, reason) => {
            onReverse?.(recordId, reason);
            setReverseRecordId(null);
          }}
          saving={saving}
        />
      ) : null}
    </div>
  );
}
