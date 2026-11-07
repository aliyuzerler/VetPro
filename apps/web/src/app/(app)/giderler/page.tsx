'use client';

import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/design-system/state-views';
import { KpiCard } from '@/components/design-system/kpi-card';
import {
  ExpenseFormDialog,
  type ExpenseFormValues,
} from '@/components/finance/expense-form-dialog';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import { formatMoney } from '@/lib/inventory-format';
import {
  EXPENSE_CATEGORY_CATALOG,
  PAYMENT_METHOD_CATALOG,
  type CashRegisterDto,
  type ExpenseDto,
  type SupplierPayableDto,
} from '@/lib/api-types';

/**
 * Faz 09 — giderler ve tedarikçi borçları. Nakit giderler açık kasa oturumuna
 * yazılır (finance.expense); tedarikçi borçları kısmi ödemeyle kapanır
 * (finance.payable).
 */

function categoryLabel(category: string): string {
  return EXPENSE_CATEGORY_CATALOG.find((entry) => entry.value === category)?.label ?? category;
}

function methodLabel(method: string): string {
  return PAYMENT_METHOD_CATALOG.find((entry) => entry.value === method)?.label ?? method;
}

export default function GiderlerPage() {
  const { activeBranchId, hasPermission } = useAuth();
  const canExpense = hasPermission('finance.expense');
  const canPayable = hasPermission('finance.payable');
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  const expensesQuery = useQuery({
    queryKey: ['expenses', 'liste'],
    queryFn: () => api<{ items: ExpenseDto[]; total: string }>('/finance/expenses?limit=50', { branchId: activeBranchId }),
    placeholderData: keepPreviousData,
  });

  const payablesQuery = useQuery({
    queryKey: ['payables', 'liste'],
    queryFn: () => api<{ items: SupplierPayableDto[]; openTotal: string }>('/finance/payables?limit=50', { branchId: activeBranchId }),
    placeholderData: keepPreviousData,
  });

  const registersQuery = useQuery({
    queryKey: ['cash-registers', 'aktif'],
    queryFn: () => api<{ items: CashRegisterDto[] }>('/cash/registers', { branchId: activeBranchId }),
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', 'aktif'],
    queryFn: () => api<{ items: Array<{ id: string; name: string }> }>('/suppliers?active=true', { branchId: activeBranchId }),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['expenses'] });
    void queryClient.invalidateQueries({ queryKey: ['cash-registers'] });
    void queryClient.invalidateQueries({ queryKey: ['cash-session'] });
  };

  const createExpense = useMutation({
    mutationFn: (values: ExpenseFormValues) =>
      api<{ expense: { id: string } }>('/finance/expenses', {
        method: 'POST',
        body: values,
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setDialogOpen(false);
      setActionError(null);
      setActionInfo('Gider kaydedildi');
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const settlePayable = useMutation({
    mutationFn: (payload: { payableId: string; amount: string }) =>
      api<{ payable: { status: string } }>(`/finance/payables/${payload.payableId}/pay`, {
        method: 'POST',
        body: { amount: payload.amount },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setActionError(null);
      setActionInfo('Tedarikçi ödemesi kaydedildi');
      void queryClient.invalidateQueries({ queryKey: ['payables'] });
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const expenses = expensesQuery.data?.items ?? [];
  const payables = payablesQuery.data?.items ?? [];
  const openSessions = (registersQuery.data?.items ?? [])
    .filter((register) => register.openSession)
    .map((register) => ({
      id: register.openSession?.id ?? '',
      label: `${register.name} — beklenen ${formatMoney(register.openSession?.expected ?? '0')} ₺`,
    }));

  const payOpen = (payable: SupplierPayableDto): void => {
    const remaining = Number(payable.amount) - Number(payable.paidAmount);
    const input = window.prompt(`Ödeme tutarı (TL) — kalan ${formatMoney(remaining)}:`, remaining.toFixed(2));
    if (input === null) return;
    const parsed = Number(input.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setActionError('Geçersiz tutar');
      return;
    }
    settlePayable.mutate({ payableId: payable.id, amount: parsed.toFixed(2) });
  };

  return (
    <div className="space-y-6" data-testid="giderler-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Giderler ve Tedarikçi Borçları</h1>
          <p className="text-sm text-muted-foreground">
            Operasyonel giderler ve tedarikçi ödemeleri; nakit giderler kasa oturumuna işlenir.
          </p>
        </div>
        {canExpense && (
          <Button data-testid="gider-yeni" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" aria-hidden="true" /> Gider Ekle
          </Button>
        )}
      </div>

      {actionInfo && (
        <div
          role="status"
          data-testid="gider-bilgi"
          className="rounded-md border border-status-success/40 bg-[var(--status-success-bg)] px-3 py-2 text-sm text-status-success"
        >
          {actionInfo}
        </div>
      )}
      {actionError && <ErrorState title="İşlem başarısız" description={actionError} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          label="Listelenen Gider Toplamı"
          value={`${formatMoney(expensesQuery.data?.total ?? '0')} ₺`}
          icon={Receipt}
        />
        <KpiCard
          label="Açık Tedarikçi Borcu"
          value={`${formatMoney(payablesQuery.data?.openTotal ?? '0')} ₺`}
          icon={Receipt}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-3 font-semibold">Giderler</h2>
          {expensesQuery.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : expensesQuery.isError ? (
            <ErrorState title="Giderler yüklenemedi" description="Sayfayı yenileyerek tekrar deneyin." />
          ) : expenses.length === 0 ? (
            <ErrorState
              title="Henüz gider yok"
              description={canExpense ? 'Gider Ekle ile ilk gideri kaydedin.' : 'Kayıtlı gider bulunmuyor.'}
            />
          ) : (
            <div className="overflow-hidden rounded-md border" data-testid="gider-liste">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Açıklama</TableHead>
                    <TableHead>Yöntem</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(expense.spentAt).toLocaleDateString('tr-TR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell>{categoryLabel(expense.category)}</TableCell>
                      <TableCell className="max-w-64 truncate text-sm">{expense.description}</TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {methodLabel(expense.method)}
                          {expense.vendor ? ` · ${expense.vendor.name}` : ''}
                        </span>
                      </TableCell>
                      <TableCell className="tnum text-right">{formatMoney(expense.amount)} ₺</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-3 font-semibold">Tedarikçi Borçları</h2>
          {payablesQuery.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : payablesQuery.isError ? (
            <ErrorState title="Borçlar yüklenemedi" description="Sayfayı yenileyerek tekrar deneyin." />
          ) : payables.length === 0 ? (
            <ErrorState
              title="Açık tedarikçi borcu yok"
              description="Borçlar mal kabul ve finans ekranlarından açılır."
            />
          ) : (
            <div className="overflow-hidden rounded-md border" data-testid="borc-liste">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tedarikçi</TableHead>
                    <TableHead>Belge</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                    <TableHead className="text-right">Ödenen</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead className="text-right">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payables.map((payable) => (
                    <TableRow key={payable.id}>
                      <TableCell>{payable.supplier.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{payable.documentNo ?? '—'}</TableCell>
                      <TableCell className="tnum text-right">{formatMoney(payable.amount)} ₺</TableCell>
                      <TableCell className="tnum text-right">{formatMoney(payable.paidAmount)} ₺</TableCell>
                      <TableCell>
                        <Badge
                          variant={payable.status === 'settled' ? 'outline' : 'secondary'}
                          className={
                            payable.status === 'settled'
                              ? 'text-status-success'
                              : payable.status === 'void'
                                ? 'text-muted-foreground'
                                : ''
                          }
                        >
                          {payable.status === 'settled' ? 'Kapandı' : payable.status === 'void' ? 'İptal' : 'Açık'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canPayable && payable.status === 'open' && (
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid={`borc-ode-${payable.id}`}
                            onClick={() => payOpen(payable)}
                          >
                            Ödeme
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ExpenseFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        openSessions={openSessions}
        vendors={suppliersQuery.data?.items ?? []}
        submitting={createExpense.isPending}
        error={createExpense.isError ? createExpense.error.message : null}
        onSubmit={(values) => createExpense.mutate(values)}
      />
    </div>
  );
}
