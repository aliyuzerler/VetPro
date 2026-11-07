'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { ErrorState } from '@/components/design-system/state-views';
import { EXPENSE_CATEGORY_CATALOG, PAYMENT_METHOD_CATALOG, type PaymentMethod } from '@/lib/api-types';

/**
 * Gider diyaloğu — Faz 09. Kategori + yöntem + tutar; nakit gider için açık
 * kasa oturumu seçimi zorunlu (API de ister).
 */

export interface ExpenseFormValues {
  category: string;
  method: PaymentMethod;
  amount: string;
  description: string;
  spentAt: string;
  vendorId?: string;
  cashSessionId?: string;
}

export function ExpenseFormDialog({
  open,
  onOpenChange,
  openSessions,
  vendors,
  submitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openSessions: Array<{ id: string; label: string }>;
  vendors: Array<{ id: string; name: string }>;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (values: ExpenseFormValues) => void;
}) {
  const [category, setCategory] = useState('medication');
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [vendorId, setVendorId] = useState<string>('none');
  const [cashSessionId, setCashSessionId] = useState<string>('none');
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Radix DialogContent remount deseni: state'i render fazında ilk değere döndür.
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setCategory('medication');
    setMethod('card');
    setAmount('');
    setDescription('');
    setVendorId('none');
    setCashSessionId('none');
    setFieldError(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const handleSubmit = (): void => {
    const parsed = Number(amount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFieldError('Tutar 0,00 TL üzerinde olmalı');
      return;
    }
    if (description.trim().length < 3) {
      setFieldError('Açıklama en az 3 karakter olmalı');
      return;
    }
    if (method === 'cash' && (cashSessionId === 'none' || !cashSessionId)) {
      setFieldError('Nakit gider için açık kasa oturumu seçilmeli');
      return;
    }
    setFieldError(null);
    onSubmit({
      category,
      method,
      amount: parsed.toFixed(2),
      description: description.trim(),
      spentAt: new Date().toISOString(),
      vendorId: vendorId !== 'none' ? vendorId : undefined,
      cashSessionId: cashSessionId !== 'none' ? cashSessionId : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gider Ekle</DialogTitle>
          <DialogDescription>
            Nakit giderler açık kasa oturumuna yazılır ve kasadan çıkış hareketi üretir.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="expense-category">Kategori</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="expense-category" aria-label="Kategori">
                  <SelectValue placeholder="Seçin" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORY_CATALOG.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="expense-method">Ödeme Yöntemi</Label>
              <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
                <SelectTrigger id="expense-method" aria-label="Ödeme yöntemi">
                  <SelectValue placeholder="Seçin" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_CATALOG.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="expense-amount">Tutar (TL)</Label>
              <Input
                id="expense-amount"
                data-testid="expense-amount"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="expense-vendor">Tedarikçi (opsiyonel)</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger id="expense-vendor" aria-label="Tedarikçi">
                  <SelectValue placeholder="Seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {method === 'cash' && (
            <div className="grid gap-1.5" data-testid="expense-session-select">
              <Label htmlFor="expense-session">Kasa Oturumu</Label>
              <Select value={cashSessionId} onValueChange={setCashSessionId}>
                <SelectTrigger id="expense-session" aria-label="Kasa oturumu">
                  <SelectValue placeholder="Seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {openSessions.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="expense-description">Açıklama</Label>
            <Input
              id="expense-description"
              data-testid="expense-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Gider açıklaması"
            />
          </div>
          {fieldError && (
            <span className="text-xs text-status-danger" role="alert">
              {fieldError}
            </span>
          )}
          {error && <ErrorState title="Gider kaydedilemedi" description={error} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} type="button">
            Vazgeç
          </Button>
          <Button data-testid="expense-submit" onClick={handleSubmit} disabled={submitting} type="button">
            {submitting ? 'Kaydediliyor…' : 'Gideri Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
