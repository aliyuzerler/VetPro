'use client';

import { useState } from 'react';
import { Banknote, LockKeyhole, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState } from '@/components/design-system/state-views';
import { KpiCard } from '@/components/design-system/kpi-card';
import { decimalToNumber, formatMoney } from '@/lib/inventory-format';
import type { CashRegisterDto, CashSessionDetailDto } from '@/lib/api-types';

/**
 * Kasa oturum paneli — Faz 09. Açık oturumda beklenen tutar, nakit giriş/
 * çıkış ve kapanış diyaloğu (fark ≠ 0 ise açıklama zorunlu) gösterilir.
 */

export function CashSessionCloseDialog({
  open,
  onOpenChange,
  session,
  submitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: CashSessionDetailDto | null;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (values: { countedTotal: string; differenceNote: string }) => void;
}) {
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Radix DialogContent remount deseni: state'i render fazında ilk değere döndür.
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setCounted('');
    setNote('');
    setFieldError(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const expected = session ? decimalToNumber(session.live.expected) : 0;
  const countedNumber = decimalToNumber(counted);
  const difference = counted ? Math.round((countedNumber - expected) * 100) / 100 : null;

  const handleSubmit = (): void => {
    if (!counted || !Number.isFinite(countedNumber)) {
      setFieldError('Sayım tutarı girilmeli');
      return;
    }
    if (difference !== null && difference !== 0 && note.trim().length < 3) {
      setFieldError('Fark açıklaması zorunlu — sayım beklenen tutarla uyuşmuyor');
      return;
    }
    setFieldError(null);
    onSubmit({
      countedTotal: countedNumber.toFixed(2),
      differenceNote: note.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kasa Kapat</DialogTitle>
          <DialogDescription>
            Beklenen tutar {formatMoney(expected)} TL (açılış + giriş − çıkış). Sayım
            farkı kayda işlenir; fark varsa açıklama zorunludur.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="counted-total">Sayılan Nakit (TL)</Label>
            <Input
              id="counted-total"
              data-testid="counted-total"
              inputMode="decimal"
              placeholder="0,00"
              value={counted}
              onChange={(event) => setCounted(event.target.value)}
            />
          </div>
          {difference !== null && (
            <div
              data-testid="difference-preview"
              className={`rounded-md border px-3 py-2 text-sm ${
                difference === 0
                  ? 'border-status-success/40 bg-[var(--status-success-bg)] text-status-success'
                  : 'border-status-danger/40 bg-[var(--status-danger-bg)] text-status-danger'
              }`}
            >
              Fark: <span className="tnum font-semibold">{formatMoney(difference)} TL</span>
              {difference === 0 ? ' — kasa tam' : ' — açıklama gerekli'}
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="difference-note">Fark Açıklaması</Label>
            <Input
              id="difference-note"
              data-testid="difference-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Fark varsa zorunlu"
            />
          </div>
          {fieldError && (
            <span className="text-xs text-status-danger" role="alert">
              {fieldError}
            </span>
          )}
          {error && <ErrorState title="Kapanış kaydedilemedi" description={error} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} type="button">
            Vazgeç
          </Button>
          <Button data-testid="close-session-submit" onClick={handleSubmit} disabled={submitting} type="button">
            {submitting ? 'Kapatılıyor…' : 'Kasayı Kapat'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Açık kasa oturumunun canlı durumu: beklenen, giriş, çıkış. */
export function CashSessionLivePanel({ session }: { session: CashSessionDetailDto }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3" data-testid="cash-live-panel">
      <KpiCard label="Beklenen Kasa" value={`${formatMoney(session.live.expected)} ₺`} icon={Wallet} />
      <KpiCard label="Nakit Giriş" value={`${formatMoney(session.live.cashIn)} ₺`} icon={Banknote} />
      <KpiCard label="Nakit Çıkış" value={`${formatMoney(session.live.cashOut)} ₺`} icon={LockKeyhole} />
    </div>
  );
}

/** Kasa seçim kartları — açık oturum rozeti ile. */
export function CashRegisterCards({
  registers,
  selectedId,
  onSelect,
}: {
  registers: CashRegisterDto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="register-cards">
      {registers.map((register) => (
        <Card
          key={register.id}
          className={`cursor-pointer transition-colors ${
            selectedId === register.id ? 'border-brand-500 ring-1 ring-brand-500' : ''
          }`}
          onClick={() => onSelect(register.id)}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span>{register.name}</span>
              {register.openSession ? (
                <span className="rounded-full bg-[var(--status-success-bg)] px-2 py-0.5 text-xs font-medium text-status-success">
                  Açık
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Kapalı
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {register.branch.name}
            {register.openSession && (
              <span className="tnum block">
                Beklenen: {formatMoney(register.openSession.expected ?? '0')} ₺
              </span>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
