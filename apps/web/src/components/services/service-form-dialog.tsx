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
import {
  SERVICE_CATEGORY_CATALOG,
  type ServiceDto,
} from '@/lib/api-types';

export const SERVICE_CATEGORIES_UI = SERVICE_CATEGORY_CATALOG;

export type ServiceFormValues = {
  code: string;
  name: string;
  category: string;
  durationMin: number;
  notes: string;
  active: boolean;
};

export const SERVICE_FORM_EMPTY: ServiceFormValues = {
  code: '',
  name: '',
  category: 'muayene',
  durationMin: 15,
  notes: '',
  active: true,
};

/** Hizmet oluşturma/düzenleme diyaloğu — service.manage izniyle açılır. */
export function ServiceFormDialog({
  open,
  editing,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  editing: ServiceDto | null;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ServiceFormValues) => void;
}) {
  // Radix DialogContent her açılışta yeniden bağlanır — useState ilk değeri yeterlidir
  // (setState-in-effect yerine React önerisi; form açıkken dışı veri değişmez).
  const [values, setValues] = useState<ServiceFormValues>(() =>
    editing
      ? {
          code: editing.code,
          name: editing.name,
          category: editing.category,
          durationMin: editing.durationMin,
          notes: editing.notes ?? '',
          active: editing.active,
        }
      : SERVICE_FORM_EMPTY,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="service-form-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? 'Hizmeti Düzenle' : 'Yeni Hizmet'}</DialogTitle>
          <DialogDescription>
            Kod klinik içinde tekildir; süre randevu önerisinde kullanılır.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="service-code">Kod</Label>
              <Input
                id="service-code"
                data-testid="service-code"
                value={values.code}
                disabled={Boolean(editing)}
                onChange={(e) => setValues({ ...values, code: e.target.value })}
                placeholder="HIZ-..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="service-name">Ad</Label>
              <Input
                id="service-name"
                data-testid="service-name"
                value={values.name}
                onChange={(e) => setValues({ ...values, name: e.target.value })}
                placeholder="Genel Muayene"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="service-category">Kategori</Label>
              <Select
                value={values.category}
                onValueChange={(category) => setValues({ ...values, category })}
              >
                <SelectTrigger id="service-category" data-testid="service-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_CATEGORIES_UI.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="service-duration">Süre (dakika)</Label>
              <Input
                id="service-duration"
                data-testid="service-duration"
                type="number"
                min="1"
                max="1440"
                value={values.durationMin}
                onChange={(e) =>
                  setValues({ ...values, durationMin: Number(e.target.value) || 1 })
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="service-notes">Not</Label>
            <Input
              id="service-notes"
              data-testid="service-notes"
              value={values.notes}
              onChange={(e) => setValues({ ...values, notes: e.target.value })}
              placeholder="Kurumsal not (opsiyonel)"
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label htmlFor="service-active" className="font-normal">
              Aktif
            </Label>
            <Switch
              id="service-active"
              data-testid="service-active"
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
            data-testid="service-form-save"
            disabled={saving || !values.code || !values.name}
            onClick={() => onSubmit(values)}
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
