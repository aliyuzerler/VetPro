'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { LotViewDto } from '@/lib/api-types';

/** Son kullanma rozeti: süresi geçmiş / 30 gün içinde / normal. */
export function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  // Render'da Date.now() çağrısı yapmamak için bağlanırken bir kez alınır (purity)
  const [now] = useState(() => Date.now());
  if (!expiresAt) return <span className="text-sm text-muted-foreground">—</span>;
  const days = Math.floor(
    (new Date(expiresAt).getTime() - now) / (24 * 3600 * 1000),
  );
  const dateText = new Date(expiresAt).toLocaleDateString('tr-TR');
  if (days < 0) {
    return (
      <Badge variant="outline" className="border-status-danger/40 bg-[var(--status-danger-bg)] font-medium text-status-danger">
        Süresi geçmiş · {dateText}
      </Badge>
    );
  }
  if (days <= 30) {
    return (
      <Badge variant="outline" className="border-status-warning/40 bg-[var(--status-warning-bg)] font-medium text-status-warning">
        {days} gün · {dateText}
      </Badge>
    );
  }
  return <span className="text-sm">{dateText}</span>;
}

/** Parti blok gerekçesi: expired | quarantined | exhausted → okunur etiket. */
export function LotBlockBadge({ reason }: { reason: LotViewDto['blockReason'] }) {
  if (!reason) {
    return (
      <Badge variant="outline" className="border-status-success/30 bg-[var(--status-success-bg)] font-medium text-status-success">
        Kullanılabilir
      </Badge>
    );
  }
  if (reason === 'expired') {
    return (
      <Badge variant="outline" className="border-status-danger/40 bg-[var(--status-danger-bg)] font-medium text-status-danger">
        Süresi geçmiş
      </Badge>
    );
  }
  if (reason === 'quarantined') {
    return (
      <Badge variant="outline" className="border-status-warning/40 bg-[var(--status-warning-bg)] font-medium text-status-warning">
        Karantina
      </Badge>
    );
  }
  return <Badge variant="secondary">Tükendi</Badge>;
}

/**
 * Parti tablosu — FEFO sıralı parti görünümü (Faz 07). Karantina/serbest
 * aksiyonu inventory.receive izniyle gösterilir; bloklu partiler seçilemez.
 */
export function LotTable({
  lots,
  canManage,
  busy,
  onToggleStatus,
  testId = 'lot-table',
}: {
  lots: LotViewDto[];
  canManage?: boolean;
  busy?: boolean;
  onToggleStatus?: (lot: LotViewDto) => void;
  testId?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Parti Kodu</TableHead>
            <TableHead>Depo</TableHead>
            <TableHead>Son Kullanma</TableHead>
            <TableHead>Kalan</TableHead>
            <TableHead>Birim Maliyet</TableHead>
            <TableHead>Durum</TableHead>
            {canManage ? (
              <TableHead>
                <span className="sr-only">Eylemler</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody data-testid={testId}>
          {lots.map((lot) => (
            <TableRow key={lot.id} data-testid={`${testId}-satir`}>
              <TableCell className="font-mono text-xs">{lot.lotCode}</TableCell>
              <TableCell>
                <div className="text-sm">{lot.warehouseName}</div>
                <div className="text-xs text-muted-foreground">{lot.branchName}</div>
              </TableCell>
              <TableCell>
                <ExpiryBadge expiresAt={lot.expiresAt} />
              </TableCell>
              <TableCell className="font-medium tabular-nums">{lot.qtyOnHand}</TableCell>
              <TableCell className="tabular-nums">{lot.unitCost.toFixed(2)} ₺</TableCell>
              <TableCell>
                <LotBlockBadge reason={lot.blockReason} />
              </TableCell>
              {canManage ? (
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onToggleStatus?.(lot)}
                  >
                    {lot.status === 'quarantined' ? 'Serbest Bırak' : 'Karantinaya Al'}
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
          {lots.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canManage ? 7 : 6} className="text-center text-sm text-muted-foreground">
                Parti kaydı yok.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
