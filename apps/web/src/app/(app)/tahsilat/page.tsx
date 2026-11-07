'use client';

import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorState } from '@/components/design-system/state-views';
import { KpiCard } from '@/components/design-system/kpi-card';
import {
  PaymentFormDialog,
  type PaymentFormValues,
} from '@/components/finance/payment-form-dialog';
import { RefundDialog, type RefundFormValues } from '@/components/finance/refund-dialog';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import { formatMoney } from '@/lib/inventory-format';
import {
  PAYMENT_METHOD_CATALOG,
  type FinanceChargeDto,
  type PaymentDetailDto,
  type PaymentDto,
  type PaymentMethod,
} from '@/lib/api-types';

/**
 * Faz 09 — tahsilatlar: bugünün toplamı, tahsilat listesi, tahsilat alma ve
 * iade akışları. Yazma uçları finance.pay / finance.refund izniyle; izin yoksa
 * salt-okunur.
 */

function methodLabel(method: string): string {
  return PAYMENT_METHOD_CATALOG.find((entry) => entry.value === method)?.label ?? method;
}

export default function TahsilatPage() {
  const { activeBranchId, hasPermission } = useAuth();
  const canPay = hasPermission('finance.pay');
  const canRefund = hasPermission('finance.refund');
  const queryClient = useQueryClient();

  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<{ id: string; name: string } | null>(null);
  const [ownerSearch, setOwnerSearch] = useState('');
  const [refundTarget, setRefundTarget] = useState<PaymentDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  const paymentsQuery = useQuery({
    queryKey: ['payments', 'liste'],
    queryFn: () => api<{ items: PaymentDto[] }>('/finance/payments?limit=50', { branchId: activeBranchId }),
    placeholderData: keepPreviousData,
  });

  const balancesQuery = useQuery({
    queryKey: ['balances', 'arama', ownerSearch],
    queryFn: () =>
      api<{ items: Array<{ ownerId: string; name: string; balance: string }> }>(
        `/finance/balances${ownerSearch ? `?search=${encodeURIComponent(ownerSearch)}` : ''}`,
        { branchId: activeBranchId },
      ),
    placeholderData: keepPreviousData,
    enabled: canPay,
  });

  const selectedChargesQuery = useQuery({
    queryKey: ['charges', 'sahip', selectedOwner?.id],
    queryFn: () =>
      api<{ items: FinanceChargeDto[] }>(`/finance/charges?ownerId=${selectedOwner?.id}`, {
        branchId: activeBranchId,
      }),
    enabled: payDialogOpen && selectedOwner !== null,
  });

  const refundDetailQuery = useQuery({
    queryKey: ['payment-detail', refundTarget?.id],
    queryFn: () => api<PaymentDetailDto>(`/finance/payments/${refundTarget?.id}`, { branchId: activeBranchId }),
    enabled: refundTarget !== null,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['payments'] });
    void queryClient.invalidateQueries({ queryKey: ['balances'] });
    void queryClient.invalidateQueries({ queryKey: ['charges'] });
    void queryClient.invalidateQueries({ queryKey: ['cash-registers'] });
    void queryClient.invalidateQueries({ queryKey: ['cash-sessions'] });
  };

  const createPayment = useMutation({
    mutationFn: (values: PaymentFormValues) =>
      api<{ payment: { id: string } }>('/finance/payments', {
        method: 'POST',
        body: {
          ownerId: values.ownerId,
          method: values.method,
          amount: values.amount,
          note: values.note || undefined,
          idempotencyKey: `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setPayDialogOpen(false);
      setActionError(null);
      setActionInfo('Tahsilat kaydedildi');
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const createRefund = useMutation({
    mutationFn: (payload: { paymentId: string; values: RefundFormValues }) =>
      api<{ refund: { id: string } }>(`/finance/payments/${payload.paymentId}/refund`, {
        method: 'POST',
        body: payload.values,
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setRefundTarget(null);
      setActionError(null);
      setActionInfo('İade kaydedildi ve denetim defterine yazıldı');
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const payments = paymentsQuery.data?.items ?? [];
  const todayPrefix = new Date().toISOString().slice(0, 10);
  const todayNet = payments
    .filter((payment) => payment.createdAt.slice(0, 10) === todayPrefix)
    .reduce((sum, payment) => sum + Number(payment.net), 0);
  const todayCash = payments
    .filter((payment) => payment.createdAt.slice(0, 10) === todayPrefix && payment.method === 'cash')
    .reduce((sum, payment) => sum + Number(payment.net), 0);

  return (
    <div className="space-y-6" data-testid="tahsilat-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Tahsilatlar</h1>
          <p className="text-sm text-muted-foreground">
            Nakit, kart ve havale tahsilatları; kısmi ödeme FIFO dağıtımıyla ücretlere bağlanır.
          </p>
        </div>
        {canPay && (
          <Button data-testid="tahsilat-yeni" onClick={() => setPayDialogOpen(true)}>
            <Plus className="size-4" aria-hidden="true" /> Tahsilat Al
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3" data-testid="tahsilat-ozet">
        <KpiCard label="Bugün Tahsilat (net)" value={`${formatMoney(todayNet)} ₺`} icon={Banknote} />
        <KpiCard label="Bugün Nakit" value={`${formatMoney(todayCash)} ₺`} icon={Banknote} />
        <KpiCard label="Kayıtlı Tahsilat" value={String(payments.length)} icon={Banknote} />
      </div>

      {actionInfo && (
        <div
          role="status"
          data-testid="tahsilat-bilgi"
          className="rounded-md border border-status-success/40 bg-[var(--status-success-bg)] px-3 py-2 text-sm text-status-success"
        >
          {actionInfo}
        </div>
      )}
      {actionError && <ErrorState title="İşlem başarısız" description={actionError} />}

      {payDialogOpen && (
        <div className="grid gap-3 sm:grid-cols-2" data-testid="owner-secici">
          <Card>
            <CardContent className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="owner-search">
                Sahip Ara
              </label>
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-2.5 size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="owner-search"
                  className="pl-8"
                  value={ownerSearch}
                  onChange={(event) => setOwnerSearch(event.target.value)}
                  placeholder="Ad veya soyad"
                />
              </div>
              <div className="max-h-64 overflow-y-auto" data-testid="owner-liste">
                {(balancesQuery.data?.items ?? []).map((owner) => (
                  <button
                    key={owner.ownerId}
                    type="button"
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${
                      selectedOwner?.id === owner.ownerId ? 'bg-muted' : ''
                    }`}
                    onClick={() => setSelectedOwner({ id: owner.ownerId, name: owner.name })}
                  >
                    <span>{owner.name}</span>
                    <span className="tnum text-xs text-muted-foreground">
                      {formatMoney(owner.balance)} ₺
                    </span>
                  </button>
                ))}
                {(balancesQuery.data?.items ?? []).length === 0 && (
                  <span className="px-2 py-1.5 text-xs text-muted-foreground">Sonuç yok</span>
                )}
              </div>
            </CardContent>
          </Card>
          <div className="grid content-start gap-2 text-sm text-muted-foreground">
            {selectedOwner ? (
              <p>
                Seçili sahip: <strong className="text-foreground">{selectedOwner.name}</strong> —
                tahsilat bu sahip için kaydedilecek.
              </p>
            ) : (
              <p>Tahsilat almak için soldaki listeden sahip seçin.</p>
            )}
          </div>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          {paymentsQuery.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-2/3" />
            </div>
          ) : paymentsQuery.isError ? (
            <ErrorState title="Tahsilatlar yüklenemedi" description="Sayfayı yenileyerek tekrar deneyin." />
          ) : payments.length === 0 ? (
            <ErrorState
              title="Henüz tahsilat yok"
              description={canPay ? 'Tahsilat Al ile ilk ödemeyi kaydedin.' : 'Kayıtlı tahsilat bulunmuyor.'}
            />
          ) : (
            <Table data-testid="tahsilat-liste">
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Sahip</TableHead>
                  <TableHead>Yöntem</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(payment.createdAt).toLocaleString('tr-TR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>{`${payment.owner.firstName} ${payment.owner.lastName}`}</TableCell>
                    <TableCell>{methodLabel(payment.method)}</TableCell>
                    <TableCell className="tnum text-right">{formatMoney(payment.amount)} ₺</TableCell>
                    <TableCell className="tnum text-right">{formatMoney(payment.net)} ₺</TableCell>
                    <TableCell className="text-right">
                      {canRefund && Number(payment.amount) - Number(payment.refunded) > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`iade-${payment.id}`}
                          onClick={() => setRefundTarget(payment)}
                        >
                          İade
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PaymentFormDialog
        open={payDialogOpen && selectedOwner !== null}
        onOpenChange={(next) => {
          setPayDialogOpen(next);
          if (!next) setActionError(null);
        }}
        ownerId={selectedOwner?.id ?? ''}
        ownerName={selectedOwner?.name ?? ''}
        charges={selectedChargesQuery.data?.items ?? []}
        submitting={createPayment.isPending}
        error={createPayment.isError ? createPayment.error.message : null}
        onSubmit={(values) => createPayment.mutate(values)}
      />

      <RefundDialog
        open={refundTarget !== null}
        onOpenChange={(next) => {
          if (!next) setRefundTarget(null);
        }}
        paymentId={refundTarget?.id ?? ''}
        paymentAmount={refundTarget?.amount ?? '0'}
        refundable={refundDetailQuery.data?.refundable ?? refundTarget?.amount ?? '0'}
        submitting={createRefund.isPending}
        error={createRefund.isError ? createRefund.error.message : null}
        onSubmit={(values) => {
          if (refundTarget) createRefund.mutate({ paymentId: refundTarget.id, values });
        }}
      />
    </div>
  );
}
