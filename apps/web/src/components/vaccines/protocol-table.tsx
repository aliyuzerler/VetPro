'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { VaccineProtocolDto } from '@/lib/api-types';

/**
 * Aşı protokol tablosu — klinik kapsamlı, düzenlenebilir protokoller
 * (kabul kriteri 5: takvim klinik protokolüyle yapılandırılır, sabit
 * evrensel takvim yoktur).
 */
export function ProtocolTable({ protocols }: { protocols: VaccineProtocolDto[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Protokol</TableHead>
          <TableHead>Aşı ürünü</TableHead>
          <TableHead>Tür</TableHead>
          <TableHead>İlk doz</TableHead>
          <TableHead>Tekrar</TableHead>
          <TableHead>Hatırlatma</TableHead>
          <TableHead>Durum</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody data-testid="protokol-tablo">
        {protocols.map((protocol) => (
          <TableRow key={protocol.id} data-testid="protokol-satir">
            <TableCell className="font-medium">{protocol.name}</TableCell>
            <TableCell>{protocol.product.name}</TableCell>
            <TableCell>{protocol.species?.name ?? 'Tüm türler'}</TableCell>
            <TableCell>{protocol.firstDoseAgeDays} gün</TableCell>
            <TableCell>{protocol.boosterIntervalDays} gün</TableCell>
            <TableCell>{protocol.reminderLeadDays} gün önce</TableCell>
            <TableCell>
              <Badge variant={protocol.active ? 'default' : 'outline'}>
                {protocol.active ? 'Aktif' : 'Pasif'}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
        {protocols.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
              Protokol kaydı yok — kliniğiniz kendi aşı takvimini burada tanımlar.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
