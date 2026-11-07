'use client';

import { useState, type FormEvent } from 'react';
import { Archive, GitMerge, Loader2 } from 'lucide-react';
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
import type { OwnerSummary } from '@/lib/api-types';

/**
 * Arşivleme diyaloğu — silme yerine arşiv (sebep zorunlu, denetime yazılır).
 */
export function ArchiveOwnerDialog({
  open,
  onOpenChange,
  ownerName,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerName: string;
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
          <DialogTitle>Sahibi arşivle</DialogTitle>
          <DialogDescription>
            {ownerName} arşivlenir; kayıt kalır ancak listelerden kalkar. Aktif hastası varsa işlem
            reddedilir. Silme yoktur — sebep denetim defterine yazılır.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" data-testid="owner-archive-form">
          <div className="flex flex-col gap-2">
            <Label htmlFor="archive-reason">Arşiv sebebi</Label>
            <Input
              id="archive-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Örn. Mükerrer kayıt, taşınma…"
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

/**
 * Açık merge diyaloğu — kaynak sahibin hastaları hedef sahibe taşınır; otomatik
 * merge yoktur, hedef ve sebep kullanıcı tarafından açıkça seçilir.
 */
export function MergeOwnerDialog({
  open,
  onOpenChange,
  sourceName,
  candidates,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceName: string;
  /** Hedef adayları (aktif, kaynak dışı sahipler — kapsayıcı filtreler). */
  candidates: OwnerSummary[];
  onConfirm: (intoOwnerId: string, reason: string) => void;
  busy?: boolean;
}) {
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!targetId || reason.trim().length < 3) return;
    onConfirm(targetId, reason.trim());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sahibi birleştir</DialogTitle>
          <DialogDescription>
            {sourceName} kaydındaki hastalar seçilen hedef sahibe taşınır ve kaynak arşivlenir.
            İşlem denetim defterine yazılır; otomatik birleştirme yapılmaz.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" data-testid="owner-merge-form">
          <div className="flex flex-col gap-2">
            <Label htmlFor="merge-target">Hedef sahip</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger id="merge-target" data-testid="merge-target">
                <SelectValue placeholder="Hedef sahibi seçin" />
              </SelectTrigger>
              <SelectContent>
                {candidates.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">Aday sahip yok</div>
                ) : (
                  candidates.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.firstName} {candidate.lastName}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="merge-reason">Birleştirme sebebi</Label>
            <Input
              id="merge-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Örn. Çift kayıt — telefon ile doğrulandı"
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
            <Button
              type="submit"
              disabled={busy || !targetId || reason.trim().length < 3}
              data-testid="merge-confirm"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <GitMerge className="size-4" aria-hidden />
              )}
              Birleştir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
