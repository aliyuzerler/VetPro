'use client';

import { useMemo, useState } from 'react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorState } from '@/components/design-system/state-views';
import { decimalToNumber, formatMoney } from '@/lib/inventory-format';
import { PAYMENT_METHOD_CATALOG, type FinanceChargeDto, type PaymentMethod } from '@/lib/api-types';

/**
 * Tahsilat diyaloğu — Faz 09. Sahip açık ücretleri üzerinde FIFO önerisi
 * gösterir; tutar girdikçe dağıtım önizlemesi güncellenir (kısmi ödeme ve
 * ücretler aşan tutar "ileri kredi" olarak işaretlenir).
 */

export interface PaymentFormValues {
  ownerId: string;
  method: PaymentMethod;
  amount: string;
  note: string;
  /** Boşsa otomatik FIFO — API tarafı da FIFO uygular */
  allocations?: { chargeId: string; amount: string }[];
}

/** Açık ücretler üzerinden basit FIFO önizlemesi (görüntüleme amaçlı). */
export function previewFifoAllocations(
  amount: number,
  charges: Array<{ id: string; balance: string }>,
): Array<{ chargeId: string; amount: number }> {
  const plan: Array<{ chargeId: string; amount: number }> = [];
  let remaining = amount;
  for (const charge of charges) {
    if (remaining <= 0) break;
    const balance = decimalToNumber(charge.balance);
    if (balance <= 0) continue;
    const applied = Math.min(balance, remaining);
    plan.push({ chargeId: charge.id, amount: Math.round(applied * 100) / 100 });
    remaining = Math.round((remaining - applied) * 100) / 100;
  }
  return plan;
}

export function PaymentFormDialog({
  open,
  onOpenChange,
  charges,
  ownerId,
  ownerName,
  submitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  charges: FinanceChargeDto[];
  ownerId: string;
  ownerName: string;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (values: PaymentFormValues) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);

  // Radix DialogContent remount deseni: state'i render fazında ilk değere döndür.
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setMethod('cash');
    setAmount('');
    setNote('');
    setAmountError(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const openCharges = useMemo(
    () =>
      charges
        .filter((charge) => charge.status !== 'void' && decimalToNumber(charge.balance) > 0)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [charges],
  );

  const amountNumber = decimalToNumber(amount);
  const plan = useMemo(
    () => (amountNumber > 0 ? previewFifoAllocations(amountNumber, openCharges) : []),
    [amountNumber, openCharges],
  );
  const allocatedTotal = plan.reduce((sum, item) => sum + item.amount, 0);
  const unallocated = Math.round((amountNumber - allocatedTotal) * 100) / 100;

  const handleSubmit = (): void => {
    const parsed = Number(amount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setAmountError('Tutar 0,00 TL üzerinde olmalı');
      return;
    }
    setAmountError(null);
    onSubmit({ ownerId, method, amount: parsed.toFixed(2), note });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Tahsilat Al</DialogTitle>
          <DialogDescription>
            {ownerName} — açık ücretler üzerinden FIFO dağıtım önerilir; kalan tutar ileri
            kredi olarak cari hesapta izlenir.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="payment-amount">Tutar (TL)</Label>
              <Input
                id="payment-amount"
                data-testid="payment-amount"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              {amountError && (
                <span className="text-xs text-status-danger" role="alert">
                  {amountError}
                </span>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="payment-method">Ödeme Yöntemi</Label>
              <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
                <SelectTrigger id="payment-method" data-testid="payment-method" aria-label="Ödeme yöntemi">
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

          <div className="grid gap-1.5">
            <Label htmlFor="payment-note">Not (opsiyonel)</Label>
            <Input
              id="payment-note"
              data-testid="payment-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Tahsilat açıklaması"
            />
          </div>

          {openCharges.length === 0 ? (
            <ErrorState
              title="Açık ücret yok"
              description="Bu sahip için dağıtılabilir ücret bulunmuyor; tutar ileri kredi olarak kaydedilir."
            />
          ) : (
            <div className="overflow-hidden rounded-md border" data-testid="allocation-preview">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ücret</TableHead>
                    <TableHead className="text-right">Bakiye</TableHead>
                    <TableHead className="text-right">Bu Tahsilattan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openCharges.map((charge) => {
                    const applied = plan.find((item) => item.chargeId === charge.id);
                    return (
                      <TableRow key={charge.id}>
                        <TableCell className="max-w-48 truncate">{charge.description ?? charge.id.slice(0, 8)}</TableCell>
                        <TableCell className="tnum text-right">{formatMoney(charge.balance)}</TableCell>
                        <TableCell className="tnum text-right font-medium">
                          {applied ? formatMoney(applied.amount) : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {amountNumber > 0 && (
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm" data-testid="allocation-summary">
              <span className="text-muted-foreground">Dağıtılacak</span>
              <span className="tnum font-semibold">{formatMoney(allocatedTotal)} TL</span>
              {unallocated > 0 && (
                <span className="text-xs text-muted-foreground">
                  İleri kredi: {formatMoney(unallocated)} TL
                </span>
              )}
            </div>
          )}

          {error && (
            <ErrorState title="Tahsilat kaydedilemedi" description={error} />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} type="button">
            Vazgeç
          </Button>
          <Button
            data-testid="payment-submit"
            onClick={handleSubmit}
            disabled={submitting}
            type="button"
          >
            {submitting ? 'Kaydediliyor…' : 'Tahsilatı Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
