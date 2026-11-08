'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DatabaseBackup, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/design-system/state-views';
import { useAuth } from '@/lib/auth-context';
import { api, apiDownload, ApiError } from '@/lib/api-client';
import type { BackupConfigDto, BackupManifestDto, BackupRunDto } from '@/lib/api-types';
import { BackupRunTable } from '@/components/backup/backup-run-table';

/**
 * Faz 14 — yedekleme: yalnız yönetici (backup.manage). Yedek al, şifreli
 * arşiv + manifest/checksum indir, saklama süresini yönet, staging'de restore
 * çalıştır (env gate: VETCORE_BACKUP_ALLOW_RESTORE).
 */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function YedeklerPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('backup.manage');
  const queryClient = useQueryClient();

  const [retentionInput, setRetentionInput] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const runsQuery = useQuery({
    queryKey: ['backup', 'runs'],
    queryFn: () => api<{ items: BackupRunDto[] }>('/backup/runs'),
    enabled: canManage,
    refetchInterval: 15000,
  });

  const configQuery = useQuery({
    queryKey: ['backup', 'config'],
    queryFn: () => api<BackupConfigDto>('/backup/config'),
    enabled: canManage,
  });

  const runMutation = useMutation({
    mutationFn: () => api<BackupRunDto>('/backup/run', { method: 'POST', body: { kind: 'manual' } }),
    onSuccess: (run) => {
      setMessage(`Yedek tamamlandı: ${run.tableCount} tablo, ${run.totalRows} satır (${formatBytes(run.totalBytes)}).`);
      void queryClient.invalidateQueries({ queryKey: ['backup'] });
    },
    onError: (error) => {
      setMessage(error instanceof ApiError ? `Yedek başarısız: ${error.message}` : 'Yedek başarısız');
    },
  });

  const configMutation = useMutation({
    mutationFn: (retentionDays: number) =>
      api<BackupConfigDto>('/backup/config', { method: 'PATCH', body: { retentionDays } }),
    onSuccess: (config) => {
      setMessage(`Saklama süresi ${config.retentionDays} gün olarak güncellendi.`);
      void queryClient.invalidateQueries({ queryKey: ['backup'] });
    },
    onError: (error) => {
      setMessage(error instanceof ApiError ? `Ayar başarısız: ${error.message}` : 'Ayar başarısız');
    },
  });

  const retentionMutation = useMutation({
    mutationFn: () => api<{ removed: number }>('/backup/retention', { method: 'POST' }),
    onSuccess: (result) => {
      setMessage(`Saklama süresi doldu: ${result.removed} yedek silindi.`);
      void queryClient.invalidateQueries({ queryKey: ['backup'] });
    },
  });

  const manifestQuery = useQuery({
    queryKey: ['backup', 'manifest', runsQuery.data?.items[0]?.id],
    queryFn: () => api<BackupManifestDto>(`/backup/runs/${runsQuery.data!.items[0]!.id}/manifest`),
    enabled: canManage && (runsQuery.data?.items.length ?? 0) > 0,
  });

  async function handleRestore(runId: string) {
    setMessage(null);
    try {
      const result = await api<{ tables: number; totalRows: number; checksumVerified: boolean }>(
        `/backup/runs/${runId}/restore`,
        { method: 'POST' },
      );
      setMessage(
        `Restore tamamlandı: ${result.tables} tablo, ${result.totalRows} satır, checksum doğrulandı.`,
      );
      void queryClient.invalidateQueries({ queryKey: ['backup'] });
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? `Restore: ${error.message} (${error.code})`
          : 'Restore başarısız',
      );
    }
  }

  if (!canManage) {
    return (
      <div className="p-6">
        <ErrorState
          title="Yetkisiz erişim"
          description="Yedekleme yönetimi yalnız klinik yöneticisine açıktır (backup.manage)."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="yedekler-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Yedekleme</h1>
        <p className="text-sm text-muted-foreground mt-1">
          PostgreSQL mantıksal dökümü + özel dosyalar + yapılandırma meta verisi
          tek AES-256-GCM şifreli arşivde; manifest sha256 checksum&apos;larla yanında
          saklanır. Restore yalnız staging&apos;de çalışır —
          docs/RESTORE_RUNBOOK.md.
        </p>
      </div>

      {message && (
        <p className="text-sm rounded-md border bg-muted/40 px-3 py-2" data-testid="backup-message">
          {message}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <DatabaseBackup className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-medium">Yeni Yedek</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Veritabanı, object dosyaları ve config meta verisi şifreli olarak
              arşivlenir; manifest checksum&apos;ları üretilir.
            </p>
            <Button
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              data-testid="backup-run-button"
            >
              <ShieldCheck className="h-4 w-4 mr-1" />
              {runMutation.isPending ? 'Yedek alınıyor…' : 'Yedek Al'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-medium">Saklama Politikası</h2>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="retention-days">Süre (gün)</Label>
                <Input
                  id="retention-days"
                  type="number"
                  min={1}
                  max={3650}
                  placeholder={String(configQuery.data?.retentionDays ?? 30)}
                  value={retentionInput}
                  onChange={(event) => setRetentionInput(event.target.value)}
                  className="w-28"
                  data-testid="retention-input"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const days = Number(retentionInput);
                  if (Number.isInteger(days) && days >= 1) configMutation.mutate(days);
                }}
                data-testid="retention-save"
              >
                Kaydet
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => retentionMutation.mutate()}
                data-testid="retention-apply"
              >
                Süresi geçenleri sil
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {manifestQuery.data && (
        <Card>
          <CardContent className="pt-4">
            <h2 className="text-lg font-medium mb-2">Son Yedeğin Manifesti</h2>
            <div className="grid gap-2 text-sm md:grid-cols-2" data-testid="backup-manifest">
              <div>
                Arşiv checksum:{' '}
                <code className="text-xs break-all">{manifestQuery.data.archiveSha256.slice(0, 32)}…</code>
              </div>
              <div>
                Algoritma: {manifestQuery.data.algorithm} · Tablo: {manifestQuery.data.tables.length} ·
                Satır: {manifestQuery.data.totalRows} · Object: {manifestQuery.data.objectFileCount}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-medium mb-2">Yedek Çalışmaları</h2>
        {runsQuery.isLoading && <Skeleton className="h-40" />}
        <BackupRunTable
          runs={runsQuery.data?.items ?? []}
          onDownload={(run) =>
            apiDownload(`/backup/runs/${run.id}/download`, `vetcore-backup-${run.id.slice(0, 8)}.vcenc`).catch(
              () => setMessage('İndirme başarısız'),
            )
          }
          onRestore={(run) => handleRestore(run.id)}
        />
      </div>
    </div>
  );
}
