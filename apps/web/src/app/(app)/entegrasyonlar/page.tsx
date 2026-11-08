'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlugZap, RefreshCcw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/design-system/state-views';
import { IntegrationModeBadge } from '@/components/integrations/integration-mode-badge';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import type { IntegrationConnectionDto, IntegrationListResponse } from '@/lib/api-types';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function EntegrasyonlarPage() {
  const { hasPermission, activeBranchId } = useAuth();
  const canManage = hasPermission('settings.manage');
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['integrations', 'list', activeBranchId],
    queryFn: () => api<IntegrationListResponse>('/integrations'),
    enabled: canManage,
  });

  const checkMutation = useMutation({
    mutationFn: (id: string) =>
      api<IntegrationConnectionDto>(`/integrations/${id}/sandbox-check`, { method: 'POST', body: {} }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  if (!canManage) {
    return (
      <ErrorState
        title="Erişim yok"
        description="Entegrasyon bağlantılarını yönetmek için settings.manage izni gerekir."
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="entegrasyonlar-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Entegrasyonlar</h1>
        <p className="text-sm text-muted-foreground">
          E-fatura ve lab entegrasyonu adapter sözleşmeleri; sağlayıcı secret&apos;ları
          yalnızca sunucu tarafında tutulur, veritabanına ve bundle&apos;a girmez.
        </p>
      </div>

      {listQuery.data && !listQuery.data.hasLiveIntegration ? (
        <div
          data-testid="entegrasyon-canli-yok"
          className="flex items-start gap-2 rounded-lg border border-[var(--status-warning-bg)] bg-[var(--status-warning-bg)] p-4 text-sm"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" aria-hidden />
          <div>
            <p className="font-medium text-status-warning">Canlı yetkili entegrasyon yok</p>
            <p className="text-muted-foreground">
              {listQuery.data.liveNotice} Sandbox çıktıları gerçek sağlayıcı verisi
              değildir; canlı mod yalnızca yetkili sözleşmeyle açılır.
            </p>
          </div>
        </div>
      ) : null}

      {listQuery.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : listQuery.isError ? (
        <ErrorState
          title="Bağlantılar yüklenemedi"
          description="Entegrasyon listesi okunamadı. Sayfayı yenileyip tekrar deneyin."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2" data-testid="entegrasyon-kartlar">
          {listQuery.data?.items.map((connection) => (
            <Card key={connection.id} data-testid="entegrasyon-kart">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <PlugZap className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <p className="font-medium">{connection.kindLabel}</p>
                  </div>
                  <IntegrationModeBadge mode={connection.mode} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Sağlayıcı: {connection.providerName} · Durum:{' '}
                  {connection.status === 'active' ? 'Aktif' : 'Pasif'}
                </p>
                {connection.config ? (
                  <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                    {Object.entries(connection.config)
                      .map(([key, value]) => `${key}: ${String(value)}`)
                      .join(' · ')}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Son kontrol: {formatDateTime(connection.lastCheckAt)}
                  {connection.lastCheckResult ? ` — ${connection.lastCheckResult}` : ''}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="entegrasyon-sandbox-kontrol"
                    disabled={checkMutation.isPending}
                    onClick={() => checkMutation.mutate(connection.id)}
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" /> Sandbox Kontrolü
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p data-testid="entegrasyon-secret-politika">
          {listQuery.data?.secretPolicy ??
            'Provider secret yalnızca sunucu tarafında tutulur ve API yanıtlarına dahil edilmez.'}
        </p>
      </div>
    </div>
  );
}
