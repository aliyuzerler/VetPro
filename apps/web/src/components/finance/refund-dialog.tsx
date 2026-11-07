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
import { formatMoney } from '@/lib/inventory-format';
import { PAYMENT_METHOD_CATALOG, type PaymentMethod } from '@/lib/api-types';

/**
 * İade diyaloğu — Faz 09. Orijinal tahsilata bağlı kayıt; iade edilebilir
 * kalan tutar üstünde sınır gösterilir. finance.refund izni required.
 */

export interface RefundFormValues {
  method: PaymentMethod;
  amount: string;
  reason: string;
}

export function RefundDialog({
  open,
  onOpenChange,
  paymentId,
  paymentAmount,
  refundable,
  submitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string;
  paymentAmount: string;
  refundable: string;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (values: RefundFormValues) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Radix DialogContent remount deseni: state'i render fazında ilk değere döndür.
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setMethod('cash');
    setAmount('');
    setReason('');
    setFieldError(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const handleSubmit = (): void => {
    const parsed = Number(amount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFieldError('İade tutarı 0,00 TL üzerinde olmalı');
      return;
    }
    if (parsed > Number(refundable)) {
      setFieldError(`İade edilebilir tutar: ${formatMoney(refundable)} TL`);
      return;
    }
    if (reason.trim().length < 3) {
      setFieldError('İade gerekçesi en az 3 karakter olmalı');
      return;
    }
    setFieldError(null);
    onSubmit({ method, amount: parsed.toFixed(2), reason: reason.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tahsilat İadesi</DialogTitle>
          <DialogDescription>
            Tahsilat {formatMoney(paymentAmount)} TL — iade edilebilir kalan{' '}
            {formatMoney(refundable)} TL. İade kaydı silinmez ve denetim defterine yazılır.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="refund-amount">İade Tutarı (TL)</Label>
            <Input
              id="refund-amount"
              data-testid="refund-amount"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="refund-method">İade Yöntemi</Label>
            <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
              <SelectTrigger id="refund-method" aria-label="İade yöntemi">
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
          <div className="grid gap-1.5">
            <Label htmlFor="refund-reason">Gerekçe</Label>
            <Input
              id="refund-reason"
              data-testid="refund-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Örn. hizmet iptali"
            />
          </div>
          {fieldError && (
            <span className="text-xs text-status-danger" role="alert">
              {fieldError}
            </span>
          )}
          {error && <ErrorState title="İade kaydedilemedi" description={error} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} type="button">
            Vazgeç
          </Button>
          <Button
            variant="destructive"
            data-testid="refund-submit"
            onClick={handleSubmit}
            disabled={submitting}
            type="button"
          >
            {submitting ? 'Kaydediliyor…' : 'İadeyi Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
