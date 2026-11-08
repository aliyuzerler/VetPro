'use client';

import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { ImportRowDto } from '@/lib/api-types';

/** Satır durumu rozeti — valid/error/duplicate üçlüsü (kabul kriteri göstergesi). */
export function ImportRowStatusBadge({ row }: { row: ImportRowDto }) {
  if (row.status === 'valid') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5"
        data-testid="row-status-valid"
      >
        <CheckCircle2 className="h-3 w-3" /> Geçerli
      </span>
    );
  }
  if (row.status === 'error') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 rounded px-1.5 py-0.5"
        data-testid="row-status-error"
      >
        <XCircle className="h-3 w-3" /> Hatalı
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 rounded px-1.5 py-0.5"
      data-testid="row-status-duplicate"
    >
      <AlertTriangle className="h-3 w-3" /> Duplicate
    </span>
  );
}

interface ImportPreviewTableProps {
  rows: ImportRowDto[];
  /** Duplicate satır için create/skip kararı (sessiz overwrite yok) */
  onResolve?: (row: ImportRowDto, resolution: 'create' | 'skip') => void;
  resolving?: boolean;
}

/**
 * İçe aktarma önizleme tablosu — Faz 14. Satır durumu + ham veri + hata/karar
 * kolonları. Duplicate satırda Yeni Kayıt/Atla düğmeleri görünür; karar
 * verilene kadar commit 409 IMPORT_RESOLUTION_REQUIRED ile reddedilir.
 */
export function ImportPreviewTable({ rows, onResolve, resolving = false }: ImportPreviewTableProps) {
  return (
    <div className="rounded-lg border overflow-x-auto" data-testid="import-preview-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="px-3 py-2 font-medium">Satır</th>
            <th className="px-3 py-2 font-medium">Durum</th>
            <th className="px-3 py-2 font-medium">Veri</th>
            <th className="px-3 py-2 font-medium">Hata / Karar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0" data-testid={`import-row-${row.rowNumber}`}>
              <td className="px-3 py-2 tabular-nums">{row.rowNumber}</td>
              <td className="px-3 py-2">
                <ImportRowStatusBadge row={row} />
              </td>
              <td className="px-3 py-2 text-muted-foreground max-w-96 truncate">
                {Object.entries(row.rawData)
                  .filter(([, value]) => value !== '')
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(' · ')}
              </td>
              <td className="px-3 py-2">
                {row.status === 'error' && row.errors && (
                  <span className="text-xs text-destructive" data-testid={`row-errors-${row.rowNumber}`}>
                    {Object.entries(row.errors)
                      .map(([field, message]) => `${field}: ${message}`)
                      .join(' · ')}
                  </span>
                )}
                {row.status === 'duplicate' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Eşleşen kayıt: {row.matchedId?.slice(0, 8)}…
                    </span>
                    {onResolve && (
                      <>
                        <Button
                          variant={row.resolution === 'create' ? 'default' : 'outline'}
                          size="sm"
                          className="h-6 text-xs"
                          disabled={resolving}
                          onClick={() => onResolve(row, 'create')}
                          data-testid={`resolve-create-${row.rowNumber}`}
                        >
                          Yeni Kayıt
                        </Button>
                        <Button
                          variant={row.resolution === 'skip' ? 'default' : 'outline'}
                          size="sm"
                          className="h-6 text-xs"
                          disabled={resolving}
                          onClick={() => onResolve(row, 'skip')}
                          data-testid={`resolve-skip-${row.rowNumber}`}
                        >
                          Atla
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
