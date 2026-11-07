'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, LockKeyhole, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState } from '@/components/design-system/state-views';
import { KpiCard } from '@/components/design-system/kpi-card';
import {
  CashRegisterCards,
  CashSessionCloseDialog,
  CashSessionLivePanel,
} from '@/components/finance/cash-session-panel';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import { formatMoney } from '@/lib/inventory-format';
import type { CashRegisterDto, CashSessionDetailDto } from '@/lib/api-types';

/**
 * Faz 09 — kasa: kasalar, açık oturum (canlı beklenen tutar), nakit giriş/
 * çıkış ve kapanış farkı akışı. Yazma uçları finance.cash izniyle.
 */

const SOURCE_LABELS: Record<string, string> = {
  payment: 'Tahsilat',
  refund: 'İade',
  expense: 'Gider',
  manual_in: 'Elle Giriş',
  manual_out: 'Elle Çıkış',
};

export default function KasaPage() {
  const { activeBranchId, hasPermission } = useAuth();
  const canManage = hasPermission('finance.cash');
  const queryClient = useQueryClient();

  const [selectedRegisterId, setSelectedRegisterId] = useState<string | null>(null);
  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const [openingFloat, setOpeningFloat] = useState('');
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [movementKind, setMovementKind] = useState<'manual_in' | 'manual_out'>('manual_in');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  const registersQuery = useQuery({
    queryKey: ['cash-registers', 'aktif'],
    queryFn: () => api<{ items: CashRegisterDto[] }>('/cash/registers', { branchId: activeBranchId }),
  });

  const selectedRegister =
    registersQuery.data?.items.find((register) => register.id === selectedRegisterId) ??
    registersQuery.data?.items[0] ??
    null;
  const effectiveRegisterId = selectedRegister?.id ?? null;

  const sessionQuery = useQuery({
    queryKey: ['cash-session', 'aktif', effectiveRegisterId],
    queryFn: async () => {
      const registers = await api<{ items: CashRegisterDto[] }>('/cash/registers', {
        branchId: activeBranchId,
      });
      const current = registers.items.find((register) => register.id === effectiveRegisterId);
      if (!current?.openSession) return null;
      return api<CashSessionDetailDto>(`/cash/sessions/${current.openSession.id}`, {
        branchId: activeBranchId,
      });
    },
    enabled: effectiveRegisterId !== null,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['cash-registers'] });
    void queryClient.invalidateQueries({ queryKey: ['cash-session'] });
    void queryClient.invalidateQueries({ queryKey: ['payments'] });
  };

  const openSession = useMutation({
    mutationFn: (values: { registerId: string; openingFloat: string }) =>
      api<CashSessionDetailDto>('/cash/sessions/open', {
        method: 'POST',
        body: values,
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setOpenDialogOpen(false);
      setActionError(null);
      setActionInfo('Kasa açıldı');
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const closeSession = useMutation({
    mutationFn: (values: { sessionId: string; countedTotal: string; differenceNote: string }) =>
      api<CashSessionDetailDto>(`/cash/sessions/${values.sessionId}/close`, {
        method: 'POST',
        body: { countedTotal: values.countedTotal, differenceNote: values.differenceNote || undefined },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setActionError(null);
      setActionInfo('Kasa kapatıldı — fark kayda işlendi');
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const createMovement = useMutation({
    mutationFn: (values: { sessionId: string; sourceType: string; amount: string; reason: string }) =>
      api<unknown>(`/cash/sessions/${values.sessionId}/movements`, {
        method: 'POST',
        body: { sourceType: values.sourceType, amount: values.amount, reason: values.reason },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setMovementDialogOpen(false);
      setActionError(null);
      setActionInfo('Kasa hareketi kaydedildi');
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const session = sessionQuery.data ?? null;

  const submitOpen = (): void => {
    const parsed = Number(openingFloat.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setFieldError('Açılış bakiyesi geçerli olmalı');
      return;
    }
    setFieldError(null);
    if (effectiveRegisterId) {
      openSession.mutate({ registerId: effectiveRegisterId, openingFloat: parsed.toFixed(2) });
    }
  };

  const submitMovement = (): void => {
    const parsed = Number(movementAmount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFieldError('Tutar 0,00 TL üzerinde olmalı');
      return;
    }
    if (movementReason.trim().length < 3) {
      setFieldError('Gerekçe en az 3 karakter olmalı');
      return;
    }
    setFieldError(null);
    if (session) {
      createMovement.mutate({
        sessionId: session.id,
        sourceType: movementKind,
        amount: parsed.toFixed(2),
        reason: movementReason.trim(),
      });
    }
  };

  return (
    <div className="space-y-6" data-testid="kasa-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Kasa</h1>
          <p className="text-sm text-muted-foreground">
            Şube kasaları: açılış/kapanış, canlı beklenen tutar ve fark açıklaması.
          </p>
        </div>
        {canManage && effectiveRegisterId && !session && (
          <Button data-testid="kasa-ac" onClick={() => setOpenDialogOpen(true)}>
            <DoorOpen className="size-4" aria-hidden="true" /> Kasa Aç
          </Button>
        )}
      </div>

      {actionInfo && (
        <div
          role="status"
          data-testid="kasa-bilgi"
          className="rounded-md border border-status-success/40 bg-[var(--status-success-bg)] px-3 py-2 text-sm text-status-success"
        >
          {actionInfo}
        </div>
      )}
      {actionError && <ErrorState title="İşlem başarısız" description={actionError} />}

      {registersQuery.isPending ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="h-24 rounded-md border bg-muted/40" />
          <div className="h-24 rounded-md border bg-muted/40" />
          <div className="h-24 rounded-md border bg-muted/40" />
        </div>
      ) : registersQuery.isError ? (
        <ErrorState title="Kasalar yüklenemedi" description="Sayfayı yenileyerek tekrar deneyin." />
      ) : (
        <CashRegisterCards
          registers={registersQuery.data?.items ?? []}
          selectedId={effectiveRegisterId}
          onSelect={(id) => setSelectedRegisterId(id)}
        />
      )}

      {session && (
        <>
          <CashSessionLivePanel session={session} />
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                data-testid="kasa-hareket-giris"
                onClick={() => {
                  setMovementKind('manual_in');
                  setMovementAmount('');
                  setMovementReason('');
                  setMovementDialogOpen(true);
                }}
              >
                <Plus className="size-4" aria-hidden="true" /> Nakit Giriş
              </Button>
              <Button
                variant="outline"
                data-testid="kasa-hareket-cikis"
                onClick={() => {
                  setMovementKind('manual_out');
                  setMovementAmount('');
                  setMovementReason('');
                  setMovementDialogOpen(true);
                }}
              >
                <LockKeyhole className="size-4" aria-hidden="true" /> Nakit Çıkış
              </Button>
              <Button
                data-testid="kasa-kapat"
                onClick={() => {
                  setFieldError(null);
                  setActionError(null);
                }}
                className="hidden"
                type="button"
              >
                Kapat (diyalog)
              </Button>
            </div>
          )}
          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-3 font-semibold">Kasa Hareketleri</h2>
              <div className="overflow-hidden rounded-md border" data-testid="kasa-hareketler">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Zaman</TableHead>
                      <TableHead>Kaynak</TableHead>
                      <TableHead>Gerekçe</TableHead>
                      <TableHead className="text-right">Tutar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {session.movements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                          Henüz hareket yok — tahsilat ve giderler buraya işlenir.
                        </TableCell>
                      </TableRow>
                    ) : (
                      session.movements.map((movement) => (
                        <TableRow key={movement.id}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(movement.createdAt).toLocaleTimeString('tr-TR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </TableCell>
                          <TableCell>{SOURCE_LABELS[movement.sourceType] ?? movement.sourceType}</TableCell>
                          <TableCell className="max-w-64 truncate text-sm">{movement.reason}</TableCell>
                          <TableCell className="tnum text-right">
                            <span className={movement.direction === 'in' ? 'text-status-success' : 'text-status-danger'}>
                              {movement.direction === 'in' ? '+' : '−'}
                              {formatMoney(movement.amount)} ₺
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
      {effectiveRegisterId && !session && !sessionQuery.isPending && (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="Kasa kapalı"
              description={
                canManage
                  ? 'Günlük işlemler için kasayı açılış bakiyesiyle açın.'
                  : 'Kasa açılışı finance.cash yetkisiyle yapılır.'
              }
              action={
                canManage ? (
                  <Button size="sm" onClick={() => setOpenDialogOpen(true)}>
                    Kasa Aç
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      )}

      {/* Kapanış diyaloğu — canlı panelden tetiklenir */}
      {session && (
        <CloseSection
          session={session}
          canManage={canManage}
          onSubmit={(values) =>
            closeSession.mutate({ sessionId: session.id, ...values })
          }
          submitting={closeSession.isPending}
        />
      )}

      <Dialog open={openDialogOpen} onOpenChange={setOpenDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Kasa Aç</DialogTitle>
            <DialogDescription>
              {selectedRegister?.name} — güne başlangıç bakiyesiyle oturum açılır.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="opening-float">Açılış Bakiyesi (TL)</Label>
            <Input
              id="opening-float"
              data-testid="opening-float"
              inputMode="decimal"
              placeholder="0,00"
              value={openingFloat}
              onChange={(event) => setOpeningFloat(event.target.value)}
            />
            {fieldError && (
              <span className="text-xs text-status-danger" role="alert">
                {fieldError}
              </span>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialogOpen(false)} type="button">
              Vazgeç
            </Button>
            <Button data-testid="open-session-submit" onClick={submitOpen} disabled={openSession.isPending} type="button">
              {openSession.isPending ? 'Açılıyor…' : 'Oturumu Aç'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{movementKind === 'manual_in' ? 'Nakit Giriş' : 'Nakit Çıkış'}</DialogTitle>
            <DialogDescription>
              Hareket açık oturuma yazılır ve beklenen tutarı günceller.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="movement-amount">Tutar (TL)</Label>
              <Input
                id="movement-amount"
                data-testid="movement-amount"
                inputMode="decimal"
                placeholder="0,00"
                value={movementAmount}
                onChange={(event) => setMovementAmount(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="movement-reason">Gerekçe</Label>
              <Input
                id="movement-reason"
                data-testid="movement-reason"
                value={movementReason}
                onChange={(event) => setMovementReason(event.target.value)}
                placeholder="Örn. kurye ücreti"
              />
            </div>
            {fieldError && (
              <span className="text-xs text-status-danger" role="alert">
                {fieldError}
              </span>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovementDialogOpen(false)} type="button">
              Vazgeç
            </Button>
            <Button data-testid="movement-submit" onClick={submitMovement} disabled={createMovement.isPending} type="button">
              {createMovement.isPending ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Kapanış bölümü — canlı panelin altında "Kasayı Kapat" eylemi. */
function CloseSection({
  session,
  canManage,
  onSubmit,
  submitting,
}: {
  session: CashSessionDetailDto;
  canManage: boolean;
  onSubmit: (values: { countedTotal: string; differenceNote: string }) => void;
  submitting: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  if (!canManage) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card px-4 py-3">
      <KpiCard label="Açılış Bakiyesi" value={`${formatMoney(session.openingFloat)} ₺`} icon={DoorOpen} />
      <Button data-testid="kasa-kapanis-diyalog" onClick={() => setDialogOpen(true)}>
        Kasayı Kapat
      </Button>
      <CashSessionCloseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        session={session}
        submitting={submitting}
        onSubmit={onSubmit}
      />
    </div>
  );
}
