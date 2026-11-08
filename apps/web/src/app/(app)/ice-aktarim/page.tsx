'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileUp, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/design-system/state-views';
import { useAuth } from '@/lib/auth-context';
import { api, apiDownload, ApiError } from '@/lib/api-client';
import type { ImportJobDto, ImportKind } from '@/lib/api-types';
import { ImportPreviewTable } from '@/components/imports/import-preview';

/**
 * Faz 14 — içe aktarma: şablon indir → CSV yükle → önizleme (hatalı satır +
 * duplicate olasılığı) → duplicate kararı (create/skip) → commit. Sessiz
 * overwrite yok: kararsız duplicate'te commit 409 IMPORT_RESOLUTION_REQUIRED.
 */

const KIND_LABELS: Record<ImportKind, string> = {
  owners: 'Hasta Sahipleri',
  patients: 'Hastalar',
  products: 'Ürünler',
};

const TEMPLATE_FILES: Record<ImportKind, string> = {
  owners: 'sahipler-sablon.csv',
  patients: 'hastalar-sablon.csv',
  products: 'urunler-sablon.csv',
};

export default function IceAktarimPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('import.manage');
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<ImportKind>('owners');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState<string | null>(null);

  const jobsQuery = useQuery({
    queryKey: ['imports', 'jobs'],
    queryFn: () => api<{ items: ImportJobDto[] }>('/imports'),
    enabled: canManage,
  });

  const selectedJobId = jobsQuery.data?.items.find((job) => job.status === 'preview')?.id ?? null;

  const detailQuery = useQuery({
    queryKey: ['imports', 'detail', selectedJobId],
    queryFn: () => api<ImportJobDto>(`/imports/${selectedJobId}`),
    enabled: canManage && Boolean(selectedJobId),
    refetchInterval: 10000,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ rowId, resolution }: { rowId: string; resolution: 'create' | 'skip' }) => {
      await api(`/imports/${selectedJobId}/rows/${rowId}`, {
        method: 'PATCH',
        body: { resolution },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
  });

  const commitMutation = useMutation({
    mutationFn: async (jobId: string) => {
      return api<ImportJobDto>(`/imports/${jobId}/commit`, { method: 'POST' });
    },
    onSuccess: (job) => {
      setCommitMessage(`İçe aktarma tamamlandı: ${job.committedRows} kayıt oluşturuldu.`);
      void queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
    onError: (error) => {
      setCommitMessage(
        error instanceof ApiError ? `Commit reddedildi: ${error.message} (${error.code})` : 'Commit başarısız',
      );
    },
  });

  async function handleUpload() {
    setUploadError(null);
    setCommitMessage(null);
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setUploadError('CSV dosyası seçin');
      return;
    }
    const body = new FormData();
    body.append('file', file);
    body.append('kind', kind);
    try {
      const token = window.localStorage.getItem('vetcore.accessToken');
      const res = await fetch('/api/v1/imports/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      });
      if (!res.ok) {
        const payload: unknown = await res.json().catch(() => null);
        const message =
          payload && typeof payload === 'object' && 'message' in payload
            ? String((payload as { message: unknown }).message)
            : `Yükleme başarısız (${res.status})`;
        throw new ApiError(res.status, message);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
      void queryClient.invalidateQueries({ queryKey: ['imports'] });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Yükleme başarısız');
    }
  }

  if (!canManage) {
    return (
      <div className="p-6">
        <ErrorState
          title="Yetkisiz erişim"
          description="İçe aktarma için import.manage izni gerekiyor."
        />
      </div>
    );
  }

  const job = detailQuery.data;

  return (
    <div className="space-y-6" data-testid="ice-aktarim-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Veri İçe Aktarma</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Başlangıç verisi: sahip, hasta ve ürün listelerini şablonla yükleyin.
          Önizleme hatalı satırları ve duplicate olasılığını gösterir; sessiz
          üzerine yazım yoktur.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Veri Türü</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as ImportKind)}>
                <SelectTrigger className="w-48" data-testid="import-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABELS) as ImportKind[]).map((entry) => (
                    <SelectItem key={entry} value={entry}>
                      {KIND_LABELS[entry]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                apiDownload(`/imports/template?kind=${kind}`, TEMPLATE_FILES[kind]).catch(() =>
                  setUploadError('Şablon indirilemedi'),
                )
              }
              data-testid="import-template-button"
            >
              <Download className="h-4 w-4 mr-1" /> Şablon İndir
            </Button>
            <div className="space-y-1">
              <Label htmlFor="import-file">CSV Dosyası</Label>
              <input
                id="import-file"
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="text-sm"
                data-testid="import-file-input"
              />
            </div>
            <Button size="sm" onClick={() => handleUpload()} data-testid="import-upload-button">
              <Upload className="h-4 w-4 mr-1" /> Yükle ve Önizle
            </Button>
          </div>
          {uploadError && (
            <p className="text-sm text-destructive" data-testid="import-error">
              {uploadError}
            </p>
          )}
          {commitMessage && (
            <p className="text-sm text-muted-foreground" data-testid="import-commit-message">
              {commitMessage}
            </p>
          )}
        </CardContent>
      </Card>

      {detailQuery.isLoading && selectedJobId && <Skeleton className="h-64" />}
      {job && job.status === 'preview' && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-medium">{KIND_LABELS[job.kind]} — Önizleme</h2>
              <span className="text-sm text-muted-foreground">{job.fileName}</span>
              <span className="text-sm" data-testid="import-summary">
                Toplam {job.totalRows} satır · {job.validRows} geçerli · {job.errorRows} hatalı ·{' '}
                {job.duplicateRows} duplicate
              </span>
              <Button
                size="sm"
                className="ml-auto"
                onClick={() => commitMutation.mutate(job.id)}
                disabled={commitMutation.isPending || job.errorRows > 0}
                data-testid="import-commit-button"
              >
                <FileUp className="h-4 w-4 mr-1" /> Commit
              </Button>
            </div>
            {job.errorRows > 0 && (
              <p className="text-sm text-destructive">
                Hatalı satırlar düzeltilmeden commit yapılamaz.
              </p>
            )}
            <ImportPreviewTable
              rows={job.rows ?? []}
              onResolve={(row, resolution) => resolveMutation.mutate({ rowId: row.id, resolution })}
              resolving={resolveMutation.isPending}
            />
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-medium mb-2">İçe Aktarma Geçmişi</h2>
        <div className="rounded-lg border overflow-x-auto" data-testid="import-history">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-3 py-2 font-medium">Dosya</th>
                <th className="px-3 py-2 font-medium">Tür</th>
                <th className="px-3 py-2 font-medium">Durum</th>
                <th className="px-3 py-2 font-medium text-right">Toplam</th>
                <th className="px-3 py-2 font-medium text-right">Commit</th>
                <th className="px-3 py-2 font-medium">Zaman</th>
              </tr>
            </thead>
            <tbody>
              {(jobsQuery.data?.items ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    Henüz içe aktarma yok
                  </td>
                </tr>
              ) : (
                (jobsQuery.data?.items ?? []).map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{item.fileName}</td>
                    <td className="px-3 py-2">{KIND_LABELS[item.kind]}</td>
                    <td className="px-3 py-2">{item.status === 'committed' ? 'Tamamlandı' : 'Önizleme'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.totalRows}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.committedRows}</td>
                    <td className="px-3 py-2">
                      {new Date(item.createdAt).toLocaleString('tr-TR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
