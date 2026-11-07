'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/design-system/state-views';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import type { ClinicProfile } from '@/lib/api-types';

/**
 * Klinik profili — settings.manage izni gerektirir; izni olmayan personel
 * salt-okunur görünüm görür (API guard'ı da yazarken zorunlu tutar).
 */
export function KlinikProfili() {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canEdit = hasPermission('settings.manage');

  const query = useQuery({
    queryKey: ['clinic'],
    queryFn: () => api<ClinicProfile>('/clinic'),
  });

  type ClinicForm = {
    name: string;
    legalName: string;
    timezone: string;
    locale: string;
    currency: string;
  };
  const EMPTY_FORM: ClinicForm = {
    name: '',
    legalName: '',
    timezone: '',
    locale: '',
    currency: '',
  };

  /** Taslak desen: sunucu verisi temel, kullanıcı düzenlemesi draft'ta — effect yok. */
  const [draft, setDraft] = useState<ClinicForm | null>(null);
  const data = query.data;
  const form: ClinicForm =
    draft ??
    (data
      ? {
          name: data.name,
          legalName: data.legalName ?? '',
          timezone: data.timezone,
          locale: data.locale,
          currency: data.currency,
        }
      : EMPTY_FORM);

  const mutation = useMutation({
    mutationFn: (payload: ClinicForm) =>
      api<ClinicProfile>('/clinic', { method: 'PATCH', body: payload }),
    onSuccess: () => {
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['clinic'] });
      toast({
        title: 'Klinik profili güncellendi',
        description: 'Değişiklik denetim kaydına yazıldı.',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Güncelleme başarısız', description: error.message, variant: 'destructive' });
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Klinik profili yüklenemedi"
        description={query.error instanceof Error ? query.error.message : 'Bilinmeyen hata'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate(form);
  }

  return (
    <Card data-testid="clinic-profile-card">
      <CardHeader>
        <CardTitle>Klinik Profili</CardTitle>
        <CardDescription>
          Klinik kimliği, yerelleştirme ve para birimi. Değişiklikler denetim kaydına yazılır.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="clinic-name">Klinik adı</Label>
            <Input
              id="clinic-name"
              value={form.name}
              onChange={(event) => setDraft({ ...form, name: event.target.value })}
              disabled={!canEdit}
              required
              minLength={2}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="clinic-legal">Ticari unvan</Label>
            <Input
              id="clinic-legal"
              value={form.legalName}
              onChange={(event) => setDraft({ ...form, legalName: event.target.value })}
              disabled={!canEdit}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="clinic-tz">Saat dilimi</Label>
            <Input
              id="clinic-tz"
              value={form.timezone}
              onChange={(event) => setDraft({ ...form, timezone: event.target.value })}
              disabled={!canEdit}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="clinic-locale">Yerel</Label>
              <Input
                id="clinic-locale"
                value={form.locale}
                onChange={(event) => setDraft({ ...form, locale: event.target.value })}
                disabled={!canEdit}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="clinic-currency">Para birimi</Label>
              <Input
                id="clinic-currency"
                value={form.currency}
                onChange={(event) => setDraft({ ...form, currency: event.target.value })}
                disabled={!canEdit}
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            {canEdit ? (
              <Button type="submit" disabled={mutation.isPending} className="min-h-11">
                {mutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Kaydet
              </Button>
            ) : (
              <p className="rounded-md border border-dashed border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Klinik ayarlarını değiştirme izniniz yok (settings.manage). Salt-okunur görünüm.
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
