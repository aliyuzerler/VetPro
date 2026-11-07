'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
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
import type { Branch, ServiceConsumptionRuleDto, ServiceDto, ServicePriceDto } from '@/lib/api-types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR');
}

function formatMoney(value: string | number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(
    Number(value),
  );
}

/** Hizmet fiyatı diyaloğu — geçerlilik aralığı + şube override girişi. */
export function ServicePriceDialog({
  open,
  serviceName,
  branches,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  serviceName: string;
  branches: Branch[];
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: {
    branchId: string;
    amount: string;
    taxCode: string;
    validFrom: string;
    validTo: string;
  }) => void;
}) {
  // Radix DialogContent her açılışta yeniden bağlanır — useState ilk değeri yeterlidir
  const [branchId, setBranchId] = useState('all');
  const [amount, setAmount] = useState('');
  const [taxCode, setTaxCode] = useState('KDV20');
  const [validFrom, setValidFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [validTo, setValidTo] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="service-price-dialog">
        <DialogHeader>
          <DialogTitle>Fiyat Tanımla — {serviceName}</DialogTitle>
          <DialogDescription>
            Şube seçimi boş bırakılırsa fiyat tüm şubelerde geçerli olur; şubeye özel fiyat
            genel fiyatı geçersiz kılar (override).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="price-branch">Şube</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger id="price-branch" data-testid="price-branch">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm şubeler</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price-amount">Tutar (TRY)</Label>
              <Input
                id="price-amount"
                data-testid="price-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price-from">Geçerlilik Başlangıcı</Label>
              <Input
                id="price-from"
                data-testid="price-valid-from"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price-to">Geçerlilik Bitişi (opsiyonel)</Label>
              <Input
                id="price-to"
                data-testid="price-valid-to"
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            type="button"
            data-testid="price-save"
            disabled={saving || !amount}
            onClick={() =>
              onSubmit({
                branchId,
                amount,
                taxCode,
                validFrom: `${validFrom}T00:00:00.000Z`,
                validTo: validTo ? `${validTo}T23:59:59.999Z` : '',
              })
            }
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Hizmet tüketim kuralı diyaloğu — varsayılan miktar/birim/zorunluluk. */
export function ServiceRuleDialog({
  open,
  serviceName,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  serviceName: string;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { defaultQty: string; unit: string; required: boolean }) => void;
}) {
  // Radix DialogContent her açılışta yeniden bağlanır — useState ilk değeri yeterlidir
  const [defaultQty, setDefaultQty] = useState('1');
  const [unit, setUnit] = useState('');
  const [required, setRequired] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="service-rule-dialog">
        <DialogHeader>
          <DialogTitle>Tüketim Kuralı — {serviceName}</DialogTitle>
          <DialogDescription>
            Hizmetin varsayılan ürün tüketimi; Faz 08&apos;de stok hareketine dönüşür.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="rule-qty">Varsayılan Miktar</Label>
            <Input
              id="rule-qty"
              data-testid="rule-default-qty"
              type="number"
              min="0.001"
              step="0.001"
              value={defaultQty}
              onChange={(e) => setDefaultQty(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-unit">Birim</Label>
            <Input
              id="rule-unit"
              data-testid="rule-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="ml, doz, tüp…"
            />
          </div>
          <div className="flex items-end space-y-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid="rule-required"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="size-4"
              />
              Zorunlu
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            type="button"
            data-testid="rule-save"
            disabled={saving || !defaultQty}
            onClick={() => onSubmit({ defaultQty, unit, required })}
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Katalog detay paneli — fiyat geçmişi + tüketim kuralları (seçili hizmet). */
export function ServiceDetailPanel({
  service,
  branches,
  canManage,
  busy,
  onAddPrice,
  onAddRule,
  onDeactivateRule,
}: {
  service: ServiceDto;
  branches: Branch[];
  canManage: boolean;
  busy?: boolean;
  onAddPrice?: () => void;
  onAddRule?: () => void;
  onDeactivateRule?: (ruleId: string) => void;
}) {
  // Geçerlilik penceresi render'da Date.now() çağrısı yapmamak için bağlanırken alınır
  const [now] = useState(() => Date.now());
  return (
    <div className="space-y-4" data-testid="service-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Fiyat Geçmişi — {service.name} ({service.code})
        </h3>
        {canManage ? (
          <Button type="button" size="sm" data-testid="price-add" onClick={onAddPrice}>
            <Plus aria-hidden="true" />
            Fiyat Ekle
          </Button>
        ) : null}
      </div>
      {service.prices.length === 0 ? (
        <p className="text-sm text-muted-foreground">Fiyat tanımı yok.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Şube</TableHead>
              <TableHead>Tutar</TableHead>
              <TableHead>Geçerlilik</TableHead>
              <TableHead>Durum</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {service.prices.map((price: ServicePriceDto) => {
              const activeNow =
                new Date(price.validFrom).getTime() <= now &&
                (price.validTo === null || new Date(price.validTo).getTime() > now);
              return (
                <TableRow key={price.id}>
                  <TableCell>{price.branch ? price.branch.name : 'Tüm şubeler'}</TableCell>
                  <TableCell className="font-medium">{formatMoney(price.amount)}</TableCell>
                  <TableCell>
                    {formatDate(price.validFrom)} — {price.validTo ? formatDate(price.validTo) : '∞'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {activeNow ? 'Geçerli' : 'Süresi doldu'}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Tüketim Kuralları</h3>
        {canManage ? (
          <Button type="button" size="sm" variant="outline" data-testid="rule-add" onClick={onAddRule}>
            <Plus aria-hidden="true" />
            Kural Ekle
          </Button>
        ) : null}
      </div>
      {service.consumptionRules.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tüketim kuralı yok.</p>
      ) : (
        <ul className="space-y-1.5" data-testid="rule-list">
          {service.consumptionRules.map((rule: ServiceConsumptionRuleDto) => (
            <li
              key={rule.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span>
                {Number(rule.defaultQty)} {rule.unit ?? 'birim'}
                {rule.required ? (
                  <Badge variant="outline" className="ml-2 text-xs">
                    Zorunlu
                  </Badge>
                ) : null}
              </span>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => onDeactivateRule?.(rule.id)}
                >
                  Devre dışı bırak
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
