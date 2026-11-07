'use client';

import { useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { ProductCategoryDto, ProductDto, UnitDto } from '@/lib/api-types';

export type ProductFormValues = {
  code: string;
  name: string;
  categoryId: string;
  barcode: string;
  trackingType: 'lot' | 'none';
  baseUnitId: string;
  minStock: number;
  defaultSalePrice: number;
  notes: string;
  active: boolean;
};

export const PRODUCT_FORM_EMPTY: ProductFormValues = {
  code: '',
  name: '',
  categoryId: 'none',
  barcode: '',
  trackingType: 'lot',
  baseUnitId: '',
  minStock: 0,
  defaultSalePrice: 0,
  notes: '',
  active: true,
};

/**
 * Ürün kartı diyaloğu — Faz 07. Parti takip türü sonradan değiştirilemez
 * (defter bütünlüğü); SKU klinik içinde tekildir.
 */
export function ProductFormDialog({
  open,
  editing,
  categories,
  units,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  editing: ProductDto | null;
  categories: ProductCategoryDto[];
  units: UnitDto[];
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ProductFormValues) => void;
}) {
  // Radix DialogContent her açılışta yeniden bağlanır — useState ilk değeri yeterlidir
  const [values, setValues] = useState<ProductFormValues>(() =>
    editing
      ? {
          code: editing.code,
          name: editing.name,
          categoryId: editing.categoryId ?? 'none',
          barcode: editing.barcode ?? '',
          trackingType: editing.trackingType,
          baseUnitId: editing.baseUnit.id,
          minStock: Number(editing.minStock),
          defaultSalePrice: Number(editing.defaultSalePrice ?? 0),
          notes: editing.notes ?? '',
          active: editing.active,
        }
      : PRODUCT_FORM_EMPTY,
  );

  const canSubmit = values.code.length >= 2 && values.name.length >= 2 && values.baseUnitId !== '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="product-form-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? 'Ürünü Düzenle' : 'Yeni Ürün'}</DialogTitle>
          <DialogDescription>
            SKU klinik içinde tekildir. Parti takip türü kayıt sonrası değiştirilemez.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="product-code">SKU (Kod)</Label>
              <Input
                id="product-code"
                data-testid="product-code"
                value={values.code}
                disabled={Boolean(editing)}
                onChange={(e) => setValues({ ...values, code: e.target.value })}
                placeholder="UR-..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-name">Ürün Adı</Label>
              <Input
                id="product-name"
                data-testid="product-name"
                value={values.name}
                onChange={(e) => setValues({ ...values, name: e.target.value })}
                placeholder="Amoksisilin 250 mg Enjeksiyon"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-category">Kategori</Label>
              <Select
                value={values.categoryId}
                onValueChange={(categoryId) => setValues({ ...values, categoryId })}
              >
                <SelectTrigger id="product-category" data-testid="product-category">
                  <SelectValue placeholder="Kategori seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kategorisiz</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-tracking">Parti Takibi</Label>
              <Select
                value={values.trackingType}
                disabled={Boolean(editing)}
                onValueChange={(trackingType) =>
                  setValues({ ...values, trackingType: trackingType as 'lot' | 'none' })
                }
              >
                <SelectTrigger id="product-tracking" data-testid="product-tracking">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lot">Parti/SKT takipli</SelectItem>
                  <SelectItem value="none">Partisiz (toplam stok)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-unit">Baz Birim</Label>
              <Select
                value={values.baseUnitId}
                onValueChange={(baseUnitId) => setValues({ ...values, baseUnitId })}
              >
                <SelectTrigger id="product-unit" data-testid="product-unit">
                  <SelectValue placeholder="Birim seçin" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-barcode">Barkod</Label>
              <Input
                id="product-barcode"
                data-testid="product-barcode"
                value={values.barcode}
                onChange={(e) => setValues({ ...values, barcode: e.target.value })}
                placeholder="869..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-min-stock">Minimum Stok</Label>
              <Input
                id="product-min-stock"
                data-testid="product-min-stock"
                type="number"
                min="0"
                step="0.001"
                value={values.minStock}
                onChange={(e) => setValues({ ...values, minStock: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-sale-price">Referans Satış Fiyatı (₺)</Label>
              <Input
                id="product-sale-price"
                data-testid="product-sale-price"
                type="number"
                min="0"
                step="0.01"
                value={values.defaultSalePrice}
                onChange={(e) =>
                  setValues({ ...values, defaultSalePrice: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-notes">Not</Label>
            <Textarea
              id="product-notes"
              data-testid="product-notes"
              value={values.notes}
              onChange={(e) => setValues({ ...values, notes: e.target.value })}
              rows={2}
              placeholder="Saklama koşulları, uyarılar…"
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label htmlFor="product-active" className="font-normal">
              Aktif
            </Label>
            <Switch
              id="product-active"
              data-testid="product-active"
              checked={values.active}
              onCheckedChange={(active) => setValues({ ...values, active })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            type="button"
            data-testid="product-form-save"
            disabled={saving || !canSubmit}
            onClick={() => onSubmit(values)}
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
