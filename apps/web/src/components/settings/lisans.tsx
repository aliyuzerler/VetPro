'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/design-system/state-views';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import type { LicenseStatus } from '@vetcore/contracts';

/**
 * Faz 15 — kalıcı lisans kartı (Ayarlar > Lisans).
 * Basit ve şeffaf: tek seferlik aktivasyon, abonelik yok, uzaktan kill switch
 * yok, telemetri yok. Durum tüm personele görünür; aktivasyon settings.manage
 * izni ister (API düzeyinde de zorunlu).
 */
export function Lisans() {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canActivate = hasPermission('settings.manage');

  const query = useQuery({
    queryKey: ['license'],
    queryFn: () => api<LicenseStatus>('/license'),
  });

  const [keyDraft, setKeyDraft] = useState('');

  const activate = useMutation({
    mutationFn: () =>
      api<LicenseStatus>('/license/activate', {
        method: 'POST',
        body: { licenseKey: keyDraft.trim() },
      }),
    onSuccess: (status) => {
      toast({
        title: 'Lisans etkinleştirildi',
        description: `${status.licenseeName ?? ''} — kalıcı lisans kaydedildi.`,
      });
      setKeyDraft('');
      void queryClient.invalidateQueries({ queryKey: ['license'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Aktivasyon başarısız', description: error.message, variant: 'destructive' });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (keyDraft.trim().length === 0) return;
    activate.mutate();
  }

  if (query.isLoading) {
    return (
      <Card data-testid="lisans-karti">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card data-testid="lisans-karti">
        <CardHeader>
          <CardTitle>Lisans</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorState
            title="Lisans durumu yüklenemedi"
            description="Lütfen sayfayı yenileyin veya tekrar deneyin."
            onRetry={() => void query.refetch()}
          />
        </CardContent>
      </Card>
    );
  }

  const status = query.data;

  return (
    <Card data-testid="lisans-karti">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BadgeCheck className="h-5 w-5" aria-hidden />
          Lisans
        </CardTitle>
        <CardDescription>
          Kalıcı (tek seferlik) lisans — abonelik yok, uzaktan kapatma yok, telemetri yok.
          Aktivasyon tamamen bu sunucuda çevrimdışı doğrulanır.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status?.activated ? (
          <dl
            className="grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-2"
            data-testid="lisans-durum"
          >
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Durum
              </dt>
              <dd className="mt-1 text-sm font-medium text-foreground">Etkin</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Lisans sahibi
              </dt>
              <dd className="mt-1 text-sm">{status.licenseeName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Sürüm
              </dt>
              <dd className="mt-1 text-sm">{status.productEdition}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Etkinleşme
              </dt>
              <dd className="mt-1 text-sm">
                {status.activatedAt ? new Date(status.activatedAt).toLocaleString('tr-TR') : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Anahtar sonu
              </dt>
              <dd className="mt-1 font-mono text-sm">••••{status.keyTail ?? ''}</dd>
            </div>
          </dl>
        ) : (
          <p
            className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground"
            data-testid="lisans-etkin-degil"
          >
            Henüz lisans aktivasyonu yapılmadı. Kurulum satıcınızdan aldığınız anahtarı girerek
            etkinleştirin; anahtar yalnızca bu sunucuda doğrulanır ve saklanır.
          </p>
        )}

        {canActivate && (
          <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="lisans-form">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lisans-anahtar">Lisans anahtarı</Label>
              <Input
                id="lisans-anahtar"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="VETCORE.…."
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                Anahtar biçimi: VETCORE.&lt;yük&gt;.&lt;imza&gt;. Yanlış imza reddedilir.
              </p>
            </div>
            <Button
              type="submit"
              disabled={activate.isPending || keyDraft.trim().length === 0}
              className="self-start"
              data-testid="lisans-aktivasyon"
            >
              {activate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <KeyRound className="h-4 w-4" aria-hidden />
              )}
              {status?.activated ? 'Yeniden etkinleştir' : 'Etkinleştir'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
