'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FlowboardBoard, type FlowboardActions } from '@/components/appointments/flowboard-board';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import type { FlowboardPayload } from '@/lib/api-types';

/**
 * Faz 05 — akış panosu sayfası. 15 saniyelik aralıklarla yenilenir (kuyruk
 * canlı akışı); check-in ve durum geçişleri gerçek API üzerinden yapılır ve
 * panoya yansır (kabul kriteri 4).
 */
export default function FlowboardPage() {
  const { session, activeBranchId } = useAuth();
  const queryClient = useQueryClient();
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const canManage = Boolean(session?.permissions.includes('appointment.manage'));

  const flowboardQuery = useQuery({
    queryKey: ['flowboard', activeBranchId],
    queryFn: () => api<FlowboardPayload>('/flowboard'),
    refetchInterval: 15_000,
    placeholderData: (previous) => previous,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['flowboard'] });
    void queryClient.invalidateQueries({ queryKey: ['appointments'] });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/appointments/${id}/status`, { method: 'POST', body: { status } }),
    onSuccess: invalidate,
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Bilinmeyen hata'),
  });

  const checkInMutation = useMutation({
    mutationFn: (id: string) => api(`/appointments/${id}/check-in`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Bilinmeyen hata'),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`/appointments/${id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      invalidate();
      setCancelTarget(null);
      setCancelReason('');
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Bilinmeyen hata'),
  });

  const actions: FlowboardActions = {
    onCheckIn: (id) => checkInMutation.mutate(id),
    onAdvance: (id, status) => statusMutation.mutate({ id, status }),
    onNoShow: (id) => statusMutation.mutate({ id, status: 'no_show' }),
    onCancel: (id) => {
      setCancelTarget(id);
      setCancelReason('');
    },
    canManage,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Activity className="size-6 text-brand-700" aria-hidden />
            Akış Panosu
          </h1>
          <p className="text-sm text-muted-foreground">
            Hasta kuyruğu gerçek randevu verisinden türetilir; 15 saniyede bir yenilenir.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void flowboardQuery.refetch()}
          aria-label="Panoyu yenile"
        >
          <RefreshCw className="size-4" aria-hidden />
          Yenile
        </Button>
      </div>

      {actionError && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {actionError}
        </p>
      )}

      <FlowboardBoard
        payload={flowboardQuery.data}
        actions={actions}
        isLoading={flowboardQuery.isLoading}
        isError={flowboardQuery.isError}
        errorMessage={
          flowboardQuery.error instanceof Error ? flowboardQuery.error.message : undefined
        }
        onRetry={() => void flowboardQuery.refetch()}
      />

      {cancelTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Randevu iptal onayı"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-lg bg-card p-4 shadow-lg">
            <h2 className="text-lg font-semibold">Randevuyu İptal Et</h2>
            <Label htmlFor="flowboard-cancel-reason" className="mt-3">
              İptal gerekçesi
            </Label>
            <Input
              id="flowboard-cancel-reason"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Örn. sahip iptal etti"
              data-testid="flowboard-cancel-reason-input"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCancelTarget(null)}>
                Vazgeç
              </Button>
              <Button
                variant="destructive"
                disabled={cancelReason.trim().length < 3}
                onClick={() => cancelMutation.mutate({ id: cancelTarget, reason: cancelReason.trim() })}
                data-testid="flowboard-confirm-cancel-button"
              >
                İptal Et
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
