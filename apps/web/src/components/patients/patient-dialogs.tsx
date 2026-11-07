'use client';

import { useState, type FormEvent } from 'react';
import { Archive, Loader2 } from 'lucide-react';
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

/** Hasta arşivleme diyaloğu — silme yerine arşiv (sebep zorunlu). */
export function ArchivePatientDialog({
  open,
  onOpenChange,
  patientName,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientName: string;
  onConfirm: (reason: string) => void;
  busy?: boolean;
}) {
  const [reason, setReason] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 3) return;
    onConfirm(reason.trim());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hastayı arşivle</DialogTitle>
          <DialogDescription>
            {patientName} arşivlenir; kayıt kalır, listelerden kalkar ve yeni işlem alamaz. Silme
            yoktur — sebep denetim defterine yazılır.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" data-testid="patient-archive-form">
          <div className="flex flex-col gap-2">
            <Label htmlFor="patient-archive-reason">Arşiv sebebi</Label>
            <Input
              id="patient-archive-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Örn. Kayıt hatası — mükerrer"
              minLength={3}
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Vazgeç
            </Button>
            <Button type="submit" variant="destructive" disabled={busy || reason.trim().length < 3}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Archive className="size-4" aria-hidden />
              )}
              Arşivle
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
