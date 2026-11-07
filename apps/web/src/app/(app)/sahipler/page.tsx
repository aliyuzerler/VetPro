'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UsersRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/design-system/state-views';
import { OwnerSearchList } from '@/components/owners/owner-search-list';
import {
  EMPTY_OWNER_FORM,
  OwnerFormDialog,
  type OwnerFormValues,
} from '@/components/owners/owner-form-dialog';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import type { OwnerDuplicateCandidate, OwnerSummary } from '@/lib/api-types';

/**
 * Faz 04 — Hasta sahipleri listesi. Mükerrer akış: form gönderimi önce
 * /owners/duplicates sorgular; aday varsa uyarı gösterilir, kullanıcı "yine de
 * kaydet" derse oluşturma devam eder (otomatik merge yok — kabul kriteri).
 */
export default function OwnersPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = hasPermission('owner.manage');

  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<OwnerFormValues>(EMPTY_OWNER_FORM);
  const [duplicates, setDuplicates] = useState<OwnerDuplicateCandidate[] | null>(null);

  const ownersQuery = useQuery({
    queryKey: ['owners', query],
    queryFn: () =>
      api<OwnerSummary[]>(`/owners${query ? `?search=${encodeURIComponent(query)}` : ''}`),
    placeholderData: keepPreviousData,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['owners'] });
  }, [queryClient]);

  const duplicateMutation = useMutation({
    mutationFn: (values: OwnerFormValues) => {
      const params = new URLSearchParams();
      if (values.firstName) params.set('firstName', values.firstName);
      if (values.lastName) params.set('lastName', values.lastName);
      if (values.phone) params.set('phone', values.phone);
      if (values.email) params.set('email', values.email);
      return api<OwnerDuplicateCandidate[]>(`/owners/duplicates?${params.toString()}`);
    },
    onSuccess: (candidates) => {
      if (candidates.length > 0) {
        setDuplicates(candidates);
      } else {
        createMutation.mutate(form);
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Mükerrer kontrolü başarısız',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: OwnerFormValues) =>
      api<OwnerSummary>('/owners', {
        method: 'POST',
        body: {
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          address: values.address.trim() || null,
          notes: values.notes.trim() || null,
          contacts: [
            { kind: 'phone', value: values.phone.trim(), label: 'Cep', isPrimary: true },
            ...(values.email.trim()
              ? [{ kind: 'email', value: values.email.trim(), isPrimary: true }]
              : []),
          ],
          consents: values.consents,
        },
      }),
    onSuccess: (owner) => {
      invalidate();
      setDialogOpen(false);
      setForm(EMPTY_OWNER_FORM);
      setDuplicates(null);
      toast({ title: 'Sahip oluşturuldu', description: 'Kayıt denetim defterine yazıldı.' });
      router.push(`/sahipler/${owner.id}`);
    },
    onError: (error: Error) => {
      toast({ title: 'Sahip oluşturulamadı', description: error.message, variant: 'destructive' });
    },
  });

  const owners = useMemo(() => ownersQuery.data ?? [], [ownersQuery.data]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <UsersRound className="size-6 text-brand-700" aria-hidden />
          Hasta Sahipleri
        </h1>
        <p className="text-sm text-muted-foreground">
          Sahip kayıtları klinik geneline açıktır; silme yoktur — arşivleme ve açık birleştirme
          kullanılır.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sahip Kayıtları</CardTitle>
          <CardDescription>
            Ad, soyad veya telefon ile arayın. Telefon aramaları biçimden bağımsız normalize edilir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ownersQuery.isLoading ? (
            <Skeleton className="h-64" />
          ) : ownersQuery.isError ? (
            <ErrorState
              title="Sahipler yüklenemedi"
              description={
                ownersQuery.error instanceof Error ? ownersQuery.error.message : 'Bilinmeyen hata'
              }
              onRetry={() => void ownersQuery.refetch()}
            />
          ) : owners.length === 0 && !query ? (
            <EmptyState
              title="Henüz kayıtlı sahip yok"
              description={
                canManage
                  ? 'İlk sahibi ekleyerek hasta kayıtlarını başlatın.'
                  : 'İlk sahip kaydı yetkili personel tarafından eklenecek.'
              }
              action={
                canManage ? (
                  <button
                    type="button"
                    className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
                    onClick={() => setDialogOpen(true)}
                  >
                    Sahip ekle
                  </button>
                ) : undefined
              }
            />
          ) : (
            <OwnerSearchList
              owners={owners}
              query={query}
              onQueryChange={setQuery}
              onOpen={(id) => router.push(`/sahipler/${id}`)}
              onCreate={() => setDialogOpen(true)}
              canManage={canManage}
            />
          )}
        </CardContent>
      </Card>

      <OwnerFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setDuplicates(null);
          }
        }}
        values={form}
        onValuesChange={setForm}
        onSubmit={(values) => duplicateMutation.mutate(values)}
        duplicates={duplicates}
        onProceedAnyway={() => createMutation.mutate(form)}
        onCancelDuplicate={() => setDuplicates(null)}
        busy={duplicateMutation.isPending}
        duplicateBusy={createMutation.isPending}
      />
    </div>
  );
}
