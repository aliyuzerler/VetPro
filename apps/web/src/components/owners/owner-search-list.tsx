'use client';

import { Search, UserPlus, UsersRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { OwnerSummary } from '@/lib/api-types';

export function OwnerPrimaryContact({ owner }: { owner: Pick<OwnerSummary, 'contacts'> }) {
  const phone =
    owner.contacts.find((c) => c.kind === 'phone' && c.isPrimary) ??
    owner.contacts.find((c) => c.kind === 'phone');
  const email =
    owner.contacts.find((c) => c.kind === 'email' && c.isPrimary) ??
    owner.contacts.find((c) => c.kind === 'email');
  if (!phone && !email) return <span className="text-muted-foreground">İletişim yok</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {phone ? <span data-testid="owner-phone">{phone.value}</span> : null}
      {email ? <span className="text-xs text-muted-foreground">{email.value}</span> : null}
    </div>
  );
}

/**
 * Sahip arama + liste tablosu — saf sunum bileşeni (veri ve geri çağrılar prop'tan).
 * Aktif uyarı rozetleri ve arşiv durumu satırda görünür; mükerrer uyarısı form
 * akışında (DuplicateWarning) verilir.
 */
export function OwnerSearchList({
  owners,
  query,
  onQueryChange,
  onOpen,
  onCreate,
  canManage,
  emptyHint,
}: {
  owners: OwnerSummary[];
  query: string;
  onQueryChange: (value: string) => void;
  onOpen: (id: string) => void;
  onCreate?: () => void;
  canManage: boolean;
  emptyHint?: string;
}) {
  return (
    <div className="flex flex-col gap-4" data-testid="owner-list">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Ad, soyad veya telefon ara…"
            className="pl-8"
            aria-label="Sahip ara"
            data-testid="owner-search"
          />
        </div>
        {canManage && onCreate ? (
          <Button onClick={onCreate} data-testid="owner-create-button">
            <UserPlus className="size-4" aria-hidden />
            Yeni sahip
          </Button>
        ) : null}
      </div>

      {owners.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center text-muted-foreground">
          <UsersRound className="size-8" aria-hidden />
          <p className="text-sm font-medium text-foreground">Kayıtlı sahip bulunamadı</p>
          <p className="text-xs">{emptyHint ?? 'Aramayı değiştirin veya ilk sahibi ekleyin.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad Soyad</TableHead>
                <TableHead>İletişim</TableHead>
                <TableHead className="text-center">Hastalar</TableHead>
                <TableHead>Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {owners.map((owner) => (
                <TableRow
                  key={owner.id}
                  className="cursor-pointer"
                  onClick={() => onOpen(owner.id)}
                  data-testid={`owner-row-${owner.id}`}
                >
                  <TableCell className="font-medium">
                    {owner.firstName} {owner.lastName}
                  </TableCell>
                  <TableCell>
                    <OwnerPrimaryContact owner={owner} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" data-testid={`owner-patient-count-${owner.id}`}>
                      {owner._count?.patients ?? 0}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {owner.mergedIntoOwnerId ? (
                      <Badge variant="outline">Birleştirildi</Badge>
                    ) : owner.archivedAt ? (
                      <Badge variant="outline">Arşiv</Badge>
                    ) : (
                      <Badge variant="secondary">Aktif</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
