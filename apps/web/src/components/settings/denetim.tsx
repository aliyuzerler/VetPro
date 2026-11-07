'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, RefreshCw, ScrollText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState, UnauthorizedState } from '@/components/design-system/state-views';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import type { AuditListResponse } from '@/lib/api-types';

const PAGE_SIZE = 20;

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(value));
}

function metadataSummary(metadata: Record<string, unknown> | null): string {
  if (!metadata) return '—';
  const parts: string[] = [];
  if (Array.isArray(metadata.before)) parts.push(`önce: ${metadata.before.length} kayıt`);
  if (Array.isArray(metadata.after)) parts.push(`sonra: ${metadata.after.length} kayıt`);
  if (typeof metadata.name === 'string') parts.push(metadata.name);
  if (typeof metadata.email === 'string') parts.push(metadata.email);
  if (typeof metadata.passwordChanged === 'boolean' && metadata.passwordChanged) parts.push('parola değişti');
  return parts.length > 0 ? parts.join(' · ') : JSON.stringify(metadata).slice(0, 60);
}

/** Denetim kaydı — yalnızca audit.view izni olan personel görüntüleyebilir. */
export function Denetim() {
  const { hasPermission } = useAuth();
  const canView = hasPermission('audit.view');
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState('');

  const query = useQuery({
    queryKey: ['audit-events', page, actionFilter],
    queryFn: () =>
      api<AuditListResponse>(
        `/audit-events?take=${PAGE_SIZE}&skip=${page * PAGE_SIZE}${actionFilter ? `&action=${encodeURIComponent(actionFilter)}` : ''}`,
      ),
    enabled: canView,
    placeholderData: keepPreviousData,
  });

  if (!canView) {
    return (
      <UnauthorizedState
        title="Denetim kaydı yetkiniz yok"
        description="Denetim defterini görüntülemek için audit.view izni gerekir."
      />
    );
  }

  if (query.isLoading) return <Skeleton className="h-80" />;
  if (query.isError) {
    return (
      <ErrorState
        title="Denetim kaydı yüklenemedi"
        description={query.error instanceof Error ? query.error.message : 'Bilinmeyen hata'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const { items, total } = query.data ?? { items: [], total: 0 };
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card data-testid="audit-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Denetim Kaydı</CardTitle>
          <CardDescription>
            Silinmez defter — giriş, yetki ve ayar değişiklikleri. Toplam {total} kayıt.
          </CardDescription>
        </div>
        <Input
          placeholder="Eylem filtresi: role.permissions.update"
          value={actionFilter}
          onChange={(event) => {
            setPage(0);
            setActionFilter(event.target.value);
          }}
          className="max-w-72"
          aria-label="Eyleme göre filtrele"
        />
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            title="Kayıt bulunamadı"
            description="Bu filtreyle eşleşen denetim kaydı yok."
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zaman</TableHead>
                  <TableHead>Personel</TableHead>
                  <TableHead>Eylem</TableHead>
                  <TableHead>Şube</TableHead>
                  <TableHead>Özet</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((event) => (
                  <TableRow key={event.id} data-testid="audit-row">
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDateTime(event.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {event.staff ? `${event.staff.firstName} ${event.staff.lastName}` : 'Sistem'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={event.action.startsWith('auth.login') ? 'secondary' : 'outline'}>
                        {event.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{event.branch?.code ?? '—'}</TableCell>
                    <TableCell className="max-w-64 truncate text-xs text-muted-foreground">
                      {metadataSummary(event.metadata)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-9"
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                <ChevronLeft className="size-4" /> Önceki
              </Button>
              <span className="text-xs text-muted-foreground">
                Sayfa {page + 1} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="min-h-9"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((current) => current + 1)}
              >
                Sonraki <ChevronRight className="size-4" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
