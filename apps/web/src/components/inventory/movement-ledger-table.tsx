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
import { MOVEMENT_KIND_CATALOG, type StockMovementDto } from '@/lib/api-types';

export function movementKindLabel(kind: string): string {
  return MOVEMENT_KIND_CATALOG.find((k) => k.value === kind)?.label ?? kind;
}

/** Defter satır rozeti: giriş +, çıkış −, düzeltme ±. */
export function MovementQtyBadge({ qty }: { qty: string }) {
  const value = Number(qty);
  if (value > 0) {
    return (
      <Badge variant="outline" className="border-status-success/30 bg-[var(--status-success-bg)] font-medium text-status-success">
        +{qty}
      </Badge>
    );
  }
  if (value < 0) {
    return (
      <Badge variant="outline" className="border-status-danger/40 bg-[var(--status-danger-bg)] font-medium text-status-danger">
        {qty}
      </Badge>
    );
  }
  return <Badge variant="secondary">{qty}</Badge>;
}

/**
 * Stok hareket defteri — salt okunur (append-only). Kayıtlar güncellenemez ve
 * silinemez; düzeltme yalnızca telafi hareketiyle yapılır. Filtreler üstte.
 */
export function MovementLedgerTable({
  movements,
  testId = 'movement-table',
}: {
  movements: StockMovementDto[];
  testId?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tarih</TableHead>
            <TableHead>Tür</TableHead>
            <TableHead>Depo</TableHead>
            <TableHead>Ürün / Parti</TableHead>
            <TableHead>Miktar</TableHead>
            <TableHead>Gerekçe / Not</TableHead>
            <TableHead>Personel</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody data-testid={testId}>
          {movements.map((movement) => (
            <TableRow key={movement.id} data-testid={`${testId}-satir`}>
              <TableCell className="whitespace-nowrap text-xs">
                {new Date(movement.postedAt).toLocaleString('tr-TR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{movementKindLabel(movement.kind)}</Badge>
              </TableCell>
              <TableCell>
                <div className="text-sm">{movement.warehouse.name}</div>
                <div className="text-xs text-muted-foreground">{movement.warehouse.branch.name}</div>
              </TableCell>
              <TableCell>
                <div className="space-y-0.5">
                  {movement.lines.map((line) => (
                    <div key={line.id} className="text-sm">
                      <span className="font-medium">{line.product.code}</span>{' '}
                      <span className="text-muted-foreground">
                        {line.lot ? `· ${line.lot.lotCode}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-0.5">
                  {movement.lines.map((line) => (
                    <MovementQtyBadge key={line.id} qty={line.qty} />
                  ))}
                </div>
              </TableCell>
              <TableCell className="max-w-48 text-xs text-muted-foreground">
                {movement.reason ?? movement.note ?? '—'}
              </TableCell>
              <TableCell className="text-xs">
                {movement.performedBy
                  ? `${movement.performedBy.firstName} ${movement.performedBy.lastName}`
                  : '—'}
              </TableCell>
            </TableRow>
          ))}
          {movements.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                Hareket kaydı yok.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
