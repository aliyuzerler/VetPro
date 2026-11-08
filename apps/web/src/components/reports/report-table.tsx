'use client';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ReportColumnDto, ReportTableDto } from '@/lib/api-types';

/** tr-TR para gösterimi — API number, UI metni burada biçimler. */
export function formatReportMoney(value: number): string {
  const fixed = Math.abs(value).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const grouped = (intPart ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${value < 0 ? '-' : ''}${grouped},${decPart ?? '00'} ₺`;
}

export function formatReportCell(value: string | number | null, type: ReportColumnDto['type']): string {
  if (value === null || value === undefined) return '—';
  if (type === 'money') {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? formatReportMoney(num) : String(value);
  }
  if (type === 'number') {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num.toLocaleString('tr-TR', { maximumFractionDigits: 3 }) : String(value);
  }
  return String(value);
}

interface ReportTableProps {
  table: ReportTableDto;
  className?: string;
  /** Özet satırı: totalColumns toplamları alt satırda gösterilir */
  showTotals?: boolean;
}

/**
 * Rapor tablosu — Faz 14. Sütun tipine göre hizalama (money/number sağa),
 * istenen kolonlar için TOPLAM satırı. Saf sunum — veri servis sayfasından.
 */
export function ReportTable({ table, className, showTotals = true }: ReportTableProps) {
  const sumOf = (key: string): number | null => {
    if (!table.totalColumns?.includes(key)) return null;
    const sum = table.rows.reduce(
      (acc, row) => acc + (typeof row[key] === 'number' ? (row[key] as number) : 0),
      0,
    );
    return sum;
  };

  return (
    <div className={cn('rounded-lg border overflow-x-auto', className)} data-testid="report-table">
      <Table>
        <TableHeader>
          <TableRow>
            {table.columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(
                  'whitespace-nowrap',
                  column.type === 'money' || column.type === 'number' ? 'text-right' : 'text-left',
                )}
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={table.columns.length}
                className="text-center text-sm text-muted-foreground py-8"
              >
                Kayıt bulunamadı
              </TableCell>
            </TableRow>
          ) : (
            table.rows.map((row, rowIndex) => (
              <TableRow key={rowIndex} data-testid="report-row">
                {table.columns.map((column, colIndex) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      'whitespace-nowrap',
                      column.type === 'money' || column.type === 'number'
                        ? 'text-right tabular-nums'
                        : 'text-left',
                      colIndex === 0 && 'font-medium',
                    )}
                  >
                    {formatReportCell(row[column.key] ?? null, column.type)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
          {showTotals && table.rows.length > 0 && table.totalColumns && table.totalColumns.length > 0 && (
            <TableRow className="bg-muted/50 font-medium" data-testid="report-totals">
              {table.columns.map((column, colIndex) => {
                const sum = sumOf(column.key);
                return (
                  <TableCell
                    key={column.key}
                    className={cn(
                      'whitespace-nowrap',
                      column.type === 'money' || column.type === 'number'
                        ? 'text-right tabular-nums'
                        : 'text-left',
                    )}
                  >
                    {colIndex === 0 ? 'TOPLAM' : sum !== null ? formatReportCell(sum, column.type) : ''}
                  </TableCell>
                );
              })}
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export const REPORT_FORMAT_LABELS: Record<'csv' | 'xlsx' | 'pdf', string> = {
  csv: 'CSV',
  xlsx: 'XLSX',
  pdf: 'PDF',
};

interface ReportExportBadgesProps {
  formats: Array<'csv' | 'xlsx' | 'pdf'>;
}

/** Dışa aktarma biçimi rozetleri — salt okunur gösterim (hikâye/test yardımcısı). */
export function ReportExportBadges({ formats }: ReportExportBadgesProps) {
  return (
    <div className="flex gap-1" data-testid="export-badges">
      {formats.map((format) => (
        <Badge key={format} variant="secondary" className="text-xs">
          {REPORT_FORMAT_LABELS[format]}
        </Badge>
      ))}
    </div>
  );
}
