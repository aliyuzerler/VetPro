'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
import type { ProductDto, SupplierDto } from '@/lib/api-types';

export type ReceiptLineValues = {
  productId: string;
  lotCode: string;
  expiresAt: string;
  unitCost: number;
  qty: number;
};

export type ReceiptFormValues = {
  warehouseId: string;
  supplierId: string;
  note: string;
  lines: ReceiptLineValues[];
};

const EMPTY_LINE: ReceiptLineValues = {
  productId: '',
  lotCode: '',
  expiresAt: '',
  unitCost: 0,
  qty: 0,
};

/**
 * Mal kabul diyaloğu — Faz 07. Parti takipli üründe lot kodu ve son kullanma
 * zorunlu; kabul bakiyeyi artırır ve deftere 'goods_receipt' yazar.
 */
export function ReceiptDialog({
  open,
  warehouses,
  products,
  suppliers,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  warehouses: { id: string; name: string; branchName: string }[];
  products: ProductDto[];
  suppliers: SupplierDto[];
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ReceiptFormValues) => void;
}) {
  const [values, setValues] = useState<ReceiptFormValues>(() => ({
    warehouseId: '',
    supplierId: 'none',
    note: '',
    lines: [{ ...EMPTY_LINE }],
  }));

  const updateLine = (index: number, patch: Partial<ReceiptLineValues>): void => {
    setValues((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  };

  const linesValid = values.lines.every((line) => {
    if (!line.productId || line.qty <= 0) return false;
    const product = products.find((p) => p.id === line.productId);
    if (product?.trackingType === 'lot') return line.lotCode.trim().length >= 1;
    return true;
  });
  const canSubmit = values.warehouseId !== '' && linesValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="receipt-dialog">
        <DialogHeader>
          <DialogTitle>Mal Kabul</DialogTitle>
          <DialogDescription>
            Lot/son kullanma/maliyet ile stok girişi; deftere mal kabul hareketi yazılır.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="receipt-warehouse">Depo</Label>
              <Select
                value={values.warehouseId}
                onValueChange={(warehouseId) => setValues({ ...values, warehouseId })}
              >
                <SelectTrigger id="receipt-warehouse" data-testid="receipt-warehouse">
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
              <Label htmlFor="receipt-supplier">Tedarikçi</Label>
              <Select
                value={values.supplierId}
                onValueChange={(supplierId) => setValues({ ...values, supplierId })}
              >
                <SelectTrigger id="receipt-supplier" data-testid="receipt-supplier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Belirtilmedi</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Satırlar</Label>
            {values.lines.map((line, index) => {
              const selectedProduct = products.find((p) => p.id === line.productId);
              const isLotTracked = selectedProduct?.trackingType === 'lot';
              return (
                <div
                  key={index}
                  className="rounded-md border border-border p-3"
                  data-testid={`receipt-line-${index}`}
                >
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1.5 md:col-span-2">
                      <Label htmlFor={`receipt-product-${index}`}>Ürün</Label>
                      <Select
                        value={line.productId}
                        onValueChange={(productId) => updateLine(index, { productId })}
                      >
                        <SelectTrigger id={`receipt-product-${index}`} data-testid={`receipt-product-${index}`}>
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
                    {isLotTracked ? (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor={`receipt-lot-${index}`}>Parti Kodu</Label>
                          <Input
                            id={`receipt-lot-${index}`}
                            data-testid={`receipt-lot-${index}`}
                            value={line.lotCode}
                            onChange={(e) => updateLine(index, { lotCode: e.target.value })}
                            placeholder="LOT-..."
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`receipt-expiry-${index}`}>Son Kullanma</Label>
                          <Input
                            id={`receipt-expiry-${index}`}
                            data-testid={`receipt-expiry-${index}`}
                            type="date"
                            value={line.expiresAt}
                            onChange={(e) => updateLine(index, { expiresAt: e.target.value })}
                          />
                        </div>
                      </>
                    ) : null}
                    <div className="space-y-1.5">
                      <Label htmlFor={`receipt-cost-${index}`}>Birim Maliyet (₺)</Label>
                      <Input
                        id={`receipt-cost-${index}`}
                        data-testid={`receipt-cost-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitCost}
                        onChange={(e) => updateLine(index, { unitCost: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`receipt-qty-${index}`}>Miktar</Label>
                      <Input
                        id={`receipt-qty-${index}`}
                        data-testid={`receipt-qty-${index}`}
                        type="number"
                        min="0"
                        step="0.001"
                        value={line.qty}
                        onChange={(e) => updateLine(index, { qty: Number(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  {values.lines.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-status-danger"
                      aria-label={`${index + 1}. satırı kaldır`}
                      onClick={() =>
                        setValues((prev) => ({
                          ...prev,
                          lines: prev.lines.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      <Trash2 aria-hidden="true" />
                      Satırı Kaldır
                    </Button>
                  ) : null}
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="receipt-line-ekle"
              onClick={() => setValues((prev) => ({ ...prev, lines: [...prev.lines, { ...EMPTY_LINE }] }))}
            >
              <Plus aria-hidden="true" />
              Satır Ekle
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="receipt-note">Not</Label>
            <Input
              id="receipt-note"
              data-testid="receipt-note"
              value={values.note}
              onChange={(e) => setValues({ ...values, note: e.target.value })}
              placeholder="İrsaliye no, açıklama…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            type="button"
            data-testid="receipt-save"
            disabled={saving || !canSubmit}
            onClick={() => onSubmit(values)}
          >
            {saving ? 'Kaydediliyor…' : 'Kabul Et'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
