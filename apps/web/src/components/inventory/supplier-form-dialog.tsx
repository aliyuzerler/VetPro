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
import { Switch } from '@/components/ui/switch';
import type { SupplierDto } from '@/lib/api-types';

export type SupplierFormValues = {
  name: string;
  taxNumber: string;
  phone: string;
  email: string;
  notes: string;
  active: boolean;
};

export const SUPPLIER_FORM_EMPTY: SupplierFormValues = {
  name: '',
  taxNumber: '',
  phone: '',
  email: '',
  notes: '',
  active: true,
};

/** Tedarikçi oluşturma/düzenleme diyaloğu — supplier.manage izniyle açılır. */
export function SupplierFormDialog({
  open,
  editing,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  editing: SupplierDto | null;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: SupplierFormValues) => void;
}) {
  // Radix DialogContent her açılışta yeniden bağlanır — useState ilk değeri yeterlidir
  const [values, setValues] = useState<SupplierFormValues>(() =>
    editing
      ? {
          name: editing.name,
          taxNumber: editing.taxNumber ?? '',
          phone: editing.phone ?? '',
          email: editing.email ?? '',
          notes: editing.notes ?? '',
          active: editing.active,
        }
      : SUPPLIER_FORM_EMPTY,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="supplier-form-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? 'Tedarikçiyi Düzenle' : 'Yeni Tedarikçi'}</DialogTitle>
          <DialogDescription>
            Mal kabul ve tedarikçi iadelerinde referans alınır.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="supplier-name">Ad</Label>
            <Input
              id="supplier-name"
              data-testid="supplier-name"
              value={values.name}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
              placeholder="VetPharm Dağıtım A.Ş."
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="supplier-tax">Vergi No</Label>
              <Input
                id="supplier-tax"
                data-testid="supplier-tax"
                value={values.taxNumber}
                onChange={(e) => setValues({ ...values, taxNumber: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-phone">Telefon</Label>
              <Input
                id="supplier-phone"
                data-testid="supplier-phone"
                value={values.phone}
                onChange={(e) => setValues({ ...values, phone: e.target.value })}
                placeholder="+90 ..."
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supplier-email">E-posta</Label>
            <Input
              id="supplier-email"
              data-testid="supplier-email"
              type="email"
              value={values.email}
              onChange={(e) => setValues({ ...values, email: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supplier-notes">Not</Label>
            <Input
              id="supplier-notes"
              data-testid="supplier-notes"
              value={values.notes}
              onChange={(e) => setValues({ ...values, notes: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label htmlFor="supplier-active" className="font-normal">
              Aktif
            </Label>
            <Switch
              id="supplier-active"
              data-testid="supplier-active"
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
            data-testid="supplier-form-save"
            disabled={saving || values.name.trim().length < 2}
            onClick={() => onSubmit(values)}
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
