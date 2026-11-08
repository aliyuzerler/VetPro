'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, FileText, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { ReportTable } from '@/components/reports/report-table';
import { useAuth } from '@/lib/auth-context';
import { api, apiDownload, ApiError } from '@/lib/api-client';
import type {
  ReportCatalogEntry,
  ReportExportDto,
  ReportTableDto,
} from '@/lib/api-types';

/**
 * Faz 14 — raporlar: katalog seçimi, şube/tarih filtreleri, önizleme ve
 * CSV/XLSX/PDF dışa aktarma. Görüntüleme reports.view; dışa aktarma düğmeleri
 * reports.export izniyle görünür — izinsiz kullanıcı dosya üretemez
 * (kabul kriteri; API düzeyinde de 403).
 */

const FORMAT_MIME: Record<string, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

function buildQuery(params: {
  branchId: string | null;
  dateFrom: string;
  dateTo: string;
  period: string;
}): string {
  const search = new URLSearchParams();
  if (params.branchId) search.set('branchId', params.branchId);
  if (params.dateFrom) search.set('dateFrom', params.dateFrom);
  if (params.dateTo) search.set('dateTo', params.dateTo);
  search.set('period', params.period);
  return search.toString();
}

export default function RaporlarPage() {
  const { hasPermission, activeBranchId, session } = useAuth();
  const branches = session?.branches ?? [];
  const canView = hasPermission('reports.view');
  const canExport = hasPermission('reports.export');

  const [selectedKey, setSelectedKey] = useState<string>('gelir');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [period, setPeriod] = useState<'daily' | 'monthly'>('daily');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [exportError, setExportError] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ['reports', 'catalog'],
    queryFn: () => api<{ items: ReportCatalogEntry[] }>('/reports'),
    enabled: canView,
  });

  const selected = catalogQuery.data?.items.find((entry) => entry.key === selectedKey) ?? null;
  const branchId = branchFilter === 'all' ? null : branchFilter;

  const reportQuery = useQuery({
    queryKey: ['reports', 'run', selectedKey, branchId, dateFrom, dateTo, period],
    queryFn: () =>
      api<ReportTableDto>(`/reports/${selectedKey}?${buildQuery({ branchId, dateFrom, dateTo, period })}`),
    enabled: canView && Boolean(selectedKey),
  });

  const exportsQuery = useQuery({
    queryKey: ['reports', 'exports'],
    queryFn: () => api<{ items: ReportExportDto[] }>('/reports/exports?limit=20'),
    enabled: canView,
    refetchInterval: 15000,
  });

  async function handleExport(format: 'csv' | 'xlsx' | 'pdf') {
    setExportError(null);
    try {
      const query = buildQuery({ branchId, dateFrom, dateTo, period });
      const stamp = new Date().toISOString().slice(0, 10);
      await apiDownload(
        `/reports/${selectedKey}/export?format=${format}&${query}`,
        `${selectedKey}-${stamp}.${format}`,
      );
      void FORMAT_MIME;
    } catch (error) {
      setExportError(
        error instanceof ApiError
          ? `Dışa aktarma başarısız (${error.status}): ${error.message}`
          : 'Dışa aktarma başarısız',
      );
    }
  }

  if (!canView) {
    return (
      <div className="p-6">
        <ErrorState
          title="Yetkisiz erişim"
          description="Raporları görüntülemek için reports.view izni gerekiyor."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="raporlar-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Raporlar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gelir, borç yaşlandırma, hizmet dağılımı, iş yükü, aşı, stok, tüketim,
          satın alma, lab ve doluluk raporları — şube ve tarih filtreleriyle.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5" data-testid="report-catalog">
        {(catalogQuery.data?.items ?? []).map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setSelectedKey(entry.key)}
            className={`text-left rounded-lg border p-3 transition-colors ${
              entry.key === selectedKey
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'hover:bg-muted/50'
            }`}
            data-testid={`report-card-${entry.key}`}
          >
            <div className="flex items-center gap-2">
              <Table2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{entry.title}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{entry.description}</p>
          </button>
        ))}
        {catalogQuery.isLoading && (
          <>
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3" data-testid="report-filters">
            <div className="space-y-1">
              <Label htmlFor="report-date-from">Başlangıç</Label>
              <Input
                id="report-date-from"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="w-40"
                data-testid="report-date-from"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="report-date-to">Bitiş</Label>
              <Input
                id="report-date-to"
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="w-40"
                data-testid="report-date-to"
              />
            </div>
            <div className="space-y-1">
              <Label>Şube</Label>
              <Select
                value={branchFilter}
                onValueChange={(value) => setBranchFilter(value)}
              >
                <SelectTrigger className="w-44" data-testid="report-branch">
                  <SelectValue placeholder="Tüm şubeler" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm şubeler</SelectItem>
                  {(branches ?? []).map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selected?.periodParam && (
              <div className="space-y-1">
                <Label>Dönem</Label>
                <Select value={period} onValueChange={(value) => setPeriod(value as 'daily' | 'monthly')}>
                  <SelectTrigger className="w-32" data-testid="report-period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Günlük</SelectItem>
                    <SelectItem value="monthly">Aylık</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex gap-2 ml-auto" data-testid="report-export-buttons">
              {canExport ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
                    <Download className="h-4 w-4 mr-1" /> CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleExport('xlsx')}>
                    <FileSpreadsheet className="h-4 w-4 mr-1" /> XLSX
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>
                    <FileText className="h-4 w-4 mr-1" /> PDF
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground self-center" data-testid="export-no-permission">
                  Dışa aktarma için reports.export izni gerekir
                </span>
              )}
            </div>
          </div>
          {exportError && (
            <p className="text-sm text-destructive mt-2" data-testid="export-error">
              {exportError}
            </p>
          )}
        </CardContent>
      </Card>

      {reportQuery.isLoading && <Skeleton className="h-64" />}
      {reportQuery.isError && (
        <ErrorState
          title="Rapor üretilemedi"
          description={reportQuery.error instanceof Error ? reportQuery.error.message : ''}
        />
      )}
      {reportQuery.data && (
        <div>
          <h2 className="text-lg font-medium mb-2">{reportQuery.data.title}</h2>
          <ReportTable table={reportQuery.data} />
        </div>
      )}

      <div>
        <h2 className="text-lg font-medium mb-2">Son Dışa Aktarmalar</h2>
        <p className="text-sm text-muted-foreground mb-2">
          Her dışa aktarma denetim defterine REPORT_EXPORT olarak yazılır.
        </p>
        <div className="rounded-lg border overflow-x-auto" data-testid="export-history">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-3 py-2 font-medium">Rapor</th>
                <th className="px-3 py-2 font-medium">Biçim</th>
                <th className="px-3 py-2 font-medium text-right">Satır</th>
                <th className="px-3 py-2 font-medium text-right">Boyut</th>
                <th className="px-3 py-2 font-medium">Zaman</th>
              </tr>
            </thead>
            <tbody>
              {(exportsQuery.data?.items ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    Henüz dışa aktarma yok
                  </td>
                </tr>
              ) : (
                (exportsQuery.data?.items ?? []).map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{item.reportKey}</td>
                    <td className="px-3 py-2 uppercase">{item.format}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.rowCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {item.fileSizeBytes < 1024
                        ? `${item.fileSizeBytes} B`
                        : `${(item.fileSizeBytes / 1024).toFixed(1)} KB`}
                    </td>
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
