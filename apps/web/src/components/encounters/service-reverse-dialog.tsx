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
import type { ServiceRecordDto } from '@/lib/api-types';

/**
 * Faz 08 — kesinleşmiş hizmet kaydının iptali. Gerekçe zorunludur (denetim);
 * iptal orijinal hareketi silmez: ters stok hareketi + negatif ücret satırı
 * yazılır (append-only ilkesi).
 */
export function ServiceReverseDialog({
  record,
  open,
  onOpenChange,
  onConfirm,
  saving,
}: {
  record: ServiceRecordDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (recordId: string, reason: string) => void;
  saving?: boolean;
}) {
  const [reason, setReason] = useState('');

  // Radix DialogContent remount deseni: state'i ilk değerle tazele.
  const [mountedKey, setMountedKey] = useState(record.id);
  if (open && mountedKey !== record.id) {
    setMountedKey(record.id);
    setReason('');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="reverse-dialog">
        <DialogHeader>
          <DialogTitle>Hizmet Kaydını İptal Et</DialogTitle>
          <DialogDescription>
            Orijinal stok hareketi ve ücret satırları korunur; ters hareket ve negatif
            düzeltme satırı yazılır. Gerekçe denetim defterine işlenir.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reverse-reason">Gerekçe</Label>
          <Input
            id="reverse-reason"
            data-testid="reverse-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Örn. Yanlış hizmet girildi"
            maxLength={500}
          />
          {reason.trim().length > 0 && reason.trim().length < 3 ? (
            <p className="text-xs text-muted-foreground">En az 3 karakter gerekli.</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Vazgeç
          </Button>
          <Button
            type="button"
            variant="destructive"
            data-testid="reverse-confirm"
            disabled={saving || reason.trim().length < 3}
            onClick={() => onConfirm(record.id, reason.trim())}
          >
            {saving ? 'İptal ediliyor…' : 'İptal Et'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
