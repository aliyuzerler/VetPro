'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { KpiCard } from '@/components/design-system/kpi-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/design-system/state-views';
import { StatementTable } from '@/components/finance/statement-table';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import { formatMoney } from '@/lib/inventory-format';
import type { OwnerBalanceDto, StatementDto } from '@/lib/api-types';

/**
 * Faz 09 — hasta sahibi bakiyeleri ve cari ekstre. Sahip seçilir; ücret(+),
 * tahsilat(−), iade(+) satırları koşan bakiyeyle listelenir (kabul kriteri:
 * ekstre üç kayıt ilişkisini gösterir).
 */

export default function CariPage() {
  const { activeBranchId } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedOwner, setSelectedOwner] = useState<{ id: string; name: string } | null>(null);

  const balancesQuery = useQuery({
    queryKey: ['balances', 'cari', search],
    queryFn: () =>
      api<{ items: OwnerBalanceDto[] }>(
        `/finance/balances${search ? `?search=${encodeURIComponent(search)}` : ''}`,
        { branchId: activeBranchId },
      ),
    placeholderData: keepPreviousData,
  });

  const statementQuery = useQuery({
    queryKey: ['statement', selectedOwner?.id],
    queryFn: () => api<StatementDto>(`/finance/owners/${selectedOwner?.id}/statement`, { branchId: activeBranchId }),
    enabled: selectedOwner !== null,
  });

  const owners = balancesQuery.data?.items ?? [];

  return (
    <div className="space-y-6" data-testid="cari-page">
      <div>
        <h1 className="text-xl font-semibold">Hasta Sahibi Bakiyeleri</h1>
        <p className="text-sm text-muted-foreground">
          Cari hesap: ücretler, tahsilatlar ve iadeler tek ekstrede; bakiye kuruş hassasiyetiyle izlenir.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="self-start">
          <CardContent className="grid gap-2 pt-6">
            <label htmlFor="cari-arama" className="text-sm font-medium">
              Sahip Ara
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="cari-arama"
                data-testid="cari-arama"
                className="pl-8"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Ad veya soyad"
              />
            </div>
            <div className="max-h-[480px] overflow-y-auto" data-testid="cari-liste">
              {balancesQuery.isPending ? (
                <div className="space-y-2 p-1">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-3/4" />
                </div>
              ) : balancesQuery.isError ? (
                <ErrorState title="Liste yüklenemedi" description="Sayfayı yenileyerek tekrar deneyin." />
              ) : owners.length === 0 ? (
                <span className="px-2 py-1.5 text-xs text-muted-foreground">Sonuç yok</span>
              ) : (
                owners.map((owner) => (
                  <button
                    key={owner.ownerId}
                    type="button"
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${
                      selectedOwner?.id === owner.ownerId ? 'bg-muted' : ''
                    }`}
                    onClick={() => setSelectedOwner({ id: owner.ownerId, name: owner.name })}
                  >
                    <span className="flex items-center gap-1.5">
                      {owner.name}
                      {owner.archived && (
                        <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">arşiv</span>
                      )}
                    </span>
                    <span
                      className={`tnum text-xs font-medium ${
                        Number(owner.balance) > 0 ? 'text-status-danger' : 'text-muted-foreground'
                      }`}
                    >
                      {formatMoney(owner.balance)} ₺
                    </span>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid content-start gap-4">
          {selectedOwner === null ? (
            <ErrorState
              title="Sahip seçilmedi"
              description="Ekstresini görmek için soldaki listeden bir hasta sahibi seçin."
            />
          ) : statementQuery.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : statementQuery.isError ? (
            <ErrorState title="Ekstre yüklenemedi" description="Sahibi yeniden seçin." />
          ) : statementQuery.data ? (
            <>
              <div className="grid gap-3 sm:grid-cols-4" data-testid="cari-ozet">
                <KpiCard label="Sahip" value={statementQuery.data.owner.name} icon={Wallet} />
                <KpiCard label="Ücretler" value={`${formatMoney(statementQuery.data.summary.charges)} ₺`} icon={Wallet} />
                <KpiCard label="Tahsilatlar" value={`${formatMoney(statementQuery.data.summary.payments)} ₺`} icon={Wallet} />
                <KpiCard
                  label="Bakiye"
                  value={`${formatMoney(statementQuery.data.closingBalance)} ₺`}
                  icon={Wallet}
                />
              </div>
              <StatementTable rows={statementQuery.data.rows} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
