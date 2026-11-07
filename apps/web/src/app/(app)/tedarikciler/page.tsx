'use client';

import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorState } from '@/components/design-system/state-views';
import {
  SupplierFormDialog,
  type SupplierFormValues,
} from '@/components/inventory/supplier-form-dialog';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import type { SupplierDto } from '@/lib/api-types';

/**
 * Faz 07 — tedarikçiler: klinik kapsamlı tedarikçi kataloğu. Yazma uçları
 * supplier.manage izniyle; izin yoksa salt-okunur liste.
 */
export default function SuppliersPage() {
  const { activeBranchId, hasPermission } = useAuth();
  const canManage = hasPermission('supplier.manage');
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', 'liste', search],
    queryFn: () =>
      api<{ items: SupplierDto[] }>(
        `/suppliers${search ? `?search=${encodeURIComponent(search)}` : ''}`,
        { branchId: activeBranchId },
      ),
    placeholderData: keepPreviousData,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
  };

  const createSupplier = useMutation({
    mutationFn: (values: SupplierFormValues) =>
      api<SupplierDto>('/suppliers', {
        method: 'POST',
        body: {
          name: values.name,
          taxNumber: values.taxNumber || undefined,
          phone: values.phone || undefined,
          email: values.email || undefined,
          notes: values.notes || undefined,
        },
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setFormOpen(false);
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const updateSupplier = useMutation({
    mutationFn: (payload: { id: string; values: Partial<SupplierFormValues> }) =>
      api<SupplierDto>(`/suppliers/${payload.id}`, {
        method: 'PATCH',
        body: payload.values,
        branchId: activeBranchId,
      }),
    onSuccess: () => {
      setFormOpen(false);
      setActionError(null);
      invalidate();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const suppliers = suppliersQuery.data?.items ?? [];
  const editing = editingId ? (suppliers.find((s) => s.id === editingId) ?? null) : null;
  const busy = createSupplier.isPending || updateSupplier.isPending;

  return (
    <div className="space-y-6" data-testid="tedarikciler-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Tedarikçiler</h1>
          <p className="text-sm text-muted-foreground">
            Mal kabul ve tedarikçi iadesi işlemlerinde referans alınan tedarikçi kayıtları.
          </p>
        </div>
        {canManage ? (
          <Button
            type="button"
            data-testid="tedarikci-yeni"
            onClick={() => {
              setEditingId(null);
              setFormOpen(true);
            }}
          >
            <Plus aria-hidden="true" />
            Yeni Tedarikçi
          </Button>
        ) : null}
      </div>

      {actionError ? (
        <div role="alert" className="rounded-md border border-border bg-[var(--status-danger-bg)] px-4 py-3 text-sm text-status-danger">
          {actionError}
        </div>
      ) : null}

      <div className="relative max-w-md">
        <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tedarikçi adı veya vergi no ara…"
          aria-label="Tedarikçi ara"
          className="pl-9"
          data-testid="tedarikci-arama"
        />
      </div>

      <Card>
        <CardContent className="pt-4">
          {suppliersQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : suppliersQuery.isError ? (
            <ErrorState title="Tedarikçiler yüklenemedi" description="Tedarikçi listesi alınamadı." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ad</TableHead>
                  <TableHead>Vergi No</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>E-posta</TableHead>
                  <TableHead>Durum</TableHead>
                  {canManage ? <TableHead aria-label="Eylemler" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody data-testid="tedarikci-tablo">
                {suppliers.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell className="font-mono text-xs">{supplier.taxNumber ?? '—'}</TableCell>
                    <TableCell className="text-sm">{supplier.phone ?? '—'}</TableCell>
                    <TableCell className="text-sm">{supplier.email ?? '—'}</TableCell>
                    <TableCell>{supplier.active ? 'Aktif' : 'Pasif'}</TableCell>
                    {canManage ? (
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`${supplier.name} düzenle`}
                          data-testid="tedarikci-duzenle"
                          onClick={() => {
                            setEditingId(supplier.id);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
                {suppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canManage ? 6 : 5} className="text-center text-sm text-muted-foreground">
                      Tedarikçi kaydı yok.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SupplierFormDialog
        key={editing?.id ?? 'yeni'}
        open={formOpen}
        editing={editing}
        saving={busy}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setActionError(null);
        }}
        onSubmit={(values) => {
          if (editing) {
            updateSupplier.mutate({
              id: editing.id,
              values: {
                name: values.name,
                taxNumber: values.taxNumber,
                phone: values.phone,
                email: values.email,
                notes: values.notes,
                active: values.active,
              },
            });
          } else {
            createSupplier.mutate(values);
          }
        }}
      />
    </div>
  );
}
