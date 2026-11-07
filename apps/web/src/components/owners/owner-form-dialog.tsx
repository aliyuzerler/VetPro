'use client';

import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { DuplicateWarning } from './duplicate-warning';
import type { OwnerDuplicateCandidate } from '@/lib/api-types';

export type OwnerFormValues = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  consents: Record<string, boolean>;
};

export const EMPTY_OWNER_FORM: OwnerFormValues = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
  consents: { kvkk: false, sms: false, email: false, whatsapp: false, marketing: false },
};

const CONSENT_LABELS: { key: string; label: string; hint: string }[] = [
  { key: 'kvkk', label: 'KVKK aydınlatma metni', hint: 'Kişisel verilerin işlenmesine onay' },
  { key: 'sms', label: 'SMS', hint: "Hatırlatma ve bilgilendirme SMS'i" },
  { key: 'email', label: 'E-posta', hint: 'E-posta ile iletişim' },
  { key: 'whatsapp', label: 'WhatsApp', hint: 'WhatsApp üzerinden iletişim' },
  { key: 'marketing', label: 'Pazarlama', hint: 'Kampanya ve duyurular' },
];

/**
 * Sahip oluşturma/duzenleme formu — saf bileşen. Mükerrer kontrolü kapsayıcıda
 * yapılır; adaylar varsa form yerini DuplicateWarning adımına bırakır
 * (otomatik birleştirme yok — kabul kriteri).
 */
export function OwnerFormDialog({
  open,
  onOpenChange,
  values,
  onValuesChange,
  onSubmit,
  duplicates,
  onProceedAnyway,
  onCancelDuplicate,
  busy,
  duplicateBusy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: OwnerFormValues;
  onValuesChange: (values: OwnerFormValues) => void;
  onSubmit: (values: OwnerFormValues) => void;
  /** Doluysa mükerrer uyarı adımı gösterilir (form gizlenir). */
  duplicates: OwnerDuplicateCandidate[] | null;
  onProceedAnyway: () => void;
  onCancelDuplicate: () => void;
  busy?: boolean;
  duplicateBusy?: boolean;
}) {
  const [touched, setTouched] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!values.firstName.trim() || !values.lastName.trim() || !values.phone.trim()) return;
    onSubmit(values);
  }

  function setField(field: keyof OwnerFormValues, value: string) {
    onValuesChange({ ...values, [field]: value });
  }

  function toggleConsent(kind: string) {
    onValuesChange({
      ...values,
      consents: { ...values.consents, [kind]: !values.consents[kind] },
    });
  }

  const showForm = duplicates === null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {showForm ? (
          <>
            <DialogHeader>
              <DialogTitle>Yeni sahip</DialogTitle>
              <DialogDescription>
                Sahip kaydı klinik geneline açılır; hastalar kayıt şubesine bağlı tutulur.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="owner-form">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="owner-first-name">Ad</Label>
                  <Input
                    id="owner-first-name"
                    value={values.firstName}
                    onChange={(event) => setField('firstName', event.target.value)}
                    aria-invalid={touched && !values.firstName.trim()}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="owner-last-name">Soyad</Label>
                  <Input
                    id="owner-last-name"
                    value={values.lastName}
                    onChange={(event) => setField('lastName', event.target.value)}
                    aria-invalid={touched && !values.lastName.trim()}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="owner-phone">Telefon</Label>
                  <Input
                    id="owner-phone"
                    value={values.phone}
                    onChange={(event) => setField('phone', event.target.value)}
                    inputMode="tel"
                    placeholder="+90 5xx xxx xx xx"
                    aria-invalid={touched && !values.phone.trim()}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="owner-email">E-posta (opsiyonel)</Label>
                  <Input
                    id="owner-email"
                    type="email"
                    value={values.email}
                    onChange={(event) => setField('email', event.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="owner-address">Adres (opsiyonel)</Label>
                <Input
                  id="owner-address"
                  value={values.address}
                  onChange={(event) => setField('address', event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="owner-notes">Notlar (opsiyonel)</Label>
                <Input
                  id="owner-notes"
                  value={values.notes}
                  onChange={(event) => setField('notes', event.target.value)}
                />
              </div>

              <fieldset className="flex flex-col gap-2 rounded-md border p-3">
                <legend className="px-1 text-sm font-medium">Rızalar</legend>
                {CONSENT_LABELS.map((consent) => (
                  <label
                    key={consent.key}
                    className="flex items-start gap-2 text-sm"
                    htmlFor={`consent-${consent.key}`}
                  >
                    <Checkbox
                      id={`consent-${consent.key}`}
                      checked={Boolean(values.consents[consent.key])}
                      onCheckedChange={() => toggleConsent(consent.key)}
                    />
                    <span className="flex flex-col">
                      <span>{consent.label}</span>
                      <span className="text-xs text-muted-foreground">{consent.hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={busy}
                >
                  Vazgeç
                </Button>
                <Button type="submit" disabled={busy} data-testid="owner-form-submit">
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Kaydı kontrol et
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Mükerrer kayıt kontrolü</DialogTitle>
              <DialogDescription>
                Kaydetmeden önce olası çift kayıtlar gösterilir; birleştirme açık ve ayrı bir
                işlemdir.
              </DialogDescription>
            </DialogHeader>
            <DuplicateWarning
              candidates={duplicates}
              onProceed={onProceedAnyway}
              onCancel={onCancelDuplicate}
              busy={duplicateBusy}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
