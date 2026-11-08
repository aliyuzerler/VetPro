'use client';

import { Button } from '@/components/ui/button';
import { Download, HardDriveDownload } from 'lucide-react';
import type { BackupRunDto } from '@/lib/api-types';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface BackupRunTableProps {
  runs: BackupRunDto[];
  onDownload?: (run: BackupRunDto) => void;
  onRestore?: (run: BackupRunDto) => void;
}

/**
 * Yedek çalışmaları tablosu — Faz 14. Durum + checksum kısaltması + boyut/
 * tablo/satır/object sayaçları; tamamlanmış çalışmalarda arşiv indir ve
 * restore (env gate'li) aksiyonları.
 */
export function BackupRunTable({ runs, onDownload, onRestore }: BackupRunTableProps) {
  return (
    <div className="rounded-lg border overflow-x-auto" data-testid="backup-runs">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="px-3 py-2 font-medium">Başlangıç</th>
            <th className="px-3 py-2 font-medium">Durum</th>
            <th className="px-3 py-2 font-medium text-right">Boyut</th>
            <th className="px-3 py-2 font-medium text-right">Tablo</th>
            <th className="px-3 py-2 font-medium text-right">Satır</th>
            <th className="px-3 py-2 font-medium text-right">Object</th>
            <th className="px-3 py-2 font-medium">Checksum</th>
            <th className="px-3 py-2 font-medium">İşlem</th>
          </tr>
        </thead>
        <tbody>
          {runs.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                Henüz yedek yok
              </td>
            </tr>
          ) : (
            runs.map((run) => (
              <tr key={run.id} className="border-b last:border-0" data-testid={`backup-run-${run.id}`}>
                <td className="px-3 py-2 whitespace-nowrap">
                  {new Date(run.startedAt).toLocaleString('tr-TR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={
                      run.status === 'completed'
                        ? 'text-emerald-700'
                        : run.status === 'failed'
                          ? 'text-red-700'
                          : 'text-amber-700'
                    }
                    data-testid={`backup-status-${run.status}`}
                  >
                    {run.status === 'completed'
                      ? 'Tamamlandı'
                      : run.status === 'failed'
                        ? 'Başarısız'
                        : 'Çalışıyor'}
                  </span>
                  {run.error && (
                    <div className="text-xs text-destructive max-w-48 truncate">{run.error}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatBytes(run.totalBytes)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{run.tableCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">{run.totalRows}</td>
                <td className="px-3 py-2 text-right tabular-nums">{run.objectFileCount}</td>
                <td className="px-3 py-2">
                  <code className="text-xs">{run.archiveSha256?.slice(0, 12) ?? '—'}…</code>
                </td>
                <td className="px-3 py-2">
                  {run.status === 'completed' && (
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => onDownload?.(run)}
                        data-testid={`backup-download-${run.id}`}
                      >
                        <Download className="h-3 w-3 mr-1" /> Arşiv
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => onRestore?.(run)}
                        data-testid={`backup-restore-${run.id}`}
                      >
                        <HardDriveDownload className="h-3 w-3 mr-1" /> Restore
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
