'use client';

import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney } from '@/lib/inventory-format';
import type { StatementRowDto } from '@/lib/api-types';

/**
 * Cari ekstre tablosu — Faz 09. Ücret(+), tahsilat(−), iade(+) satırları ve
 * koşan bakiye; kabul kriteri: üç kayıt tipinin ilişkisi görünürdür.
 */

const KIND_LABELS: Record<StatementRowDto['kind'], string> = {
  charge: 'Ücret',
  payment: 'Tahsilat',
  refund: 'İade',
};

export function StatementTable({ rows }: { rows: StatementRowDto[] }) {
  return (
    <div className="overflow-hidden rounded-md border" data-testid="statement-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tarih</TableHead>
            <TableHead>Tür</TableHead>
            <TableHead>Açıklama</TableHead>
            <TableHead className="text-right">Tutar</TableHead>
            <TableHead className="text-right">Bakiye</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} data-testid={`statement-row-${row.kind}`}>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {new Date(row.occurredAt).toLocaleDateString('tr-TR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    row.kind === 'charge'
                      ? 'bg-muted text-foreground'
                      : row.kind === 'payment'
                        ? 'bg-[var(--status-success-bg)] text-status-success'
                        : 'bg-[var(--status-danger-bg)] text-status-danger'
                  }`}
                >
                  {row.kind === 'payment' ? (
                    <ArrowDownLeft className="size-3" aria-hidden="true" />
                  ) : (
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  )}
                  {KIND_LABELS[row.kind]}
                </span>
              </TableCell>
              <TableCell className="max-w-64 truncate text-sm">{row.description}</TableCell>
              <TableCell className="tnum text-right">
                <span className={row.direction === '-' ? 'text-status-success' : ''}>
                  {row.direction === '-' ? '−' : '+'}
                  {formatMoney(row.amount)} ₺
                </span>
              </TableCell>
              <TableCell className="tnum text-right font-medium">
                {formatMoney(row.runningBalance)} ₺
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
