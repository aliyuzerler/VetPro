'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2, LogIn, PawPrint, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';

/**
 * Giriş sayfası — scrypt doğrulamalı kimlik akışı (Faz 03).
 * Yalnızca sentetik demo hesaplar geçerlidir; gerçek klinik verisi yoktur.
 */
export default function GirisPage() {
  const { status, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('admin@vetcore-demo.example');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'auth') {
      router.replace('/');
    }
  }, [status, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş başarısız');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-10"
      data-testid="login-page"
    >
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-brand-600 text-white">
            <PawPrint className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">VetCore</h1>
          <p className="text-sm text-muted-foreground">
            Veteriner klinik yönetim platformu
          </p>
        </div>

        <Card data-testid="login-card">
          <CardHeader>
            <CardTitle>Personel Girişi</CardTitle>
            <CardDescription>
              Klinik hesabınızla oturum açın. Oturumlar kısa ömürlü token ile
              yönetilir; şube seçiminiz kaydedilir.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
              {error ? (
                <Alert variant="destructive" data-testid="login-error">
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  <AlertTitle>Giriş yapılamadı</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-col gap-2">
                <Label htmlFor="email">E-posta</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="ad@klinik.example"
                  className="min-h-11"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Parola</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="min-h-11"
                />
              </div>

              <Button type="submit" className="min-h-11" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Doğrulanıyor…
                  </>
                ) : (
                  <>
                    <LogIn className="size-4" aria-hidden="true" />
                    Giriş yap
                  </>
                )}
              </Button>
            </form>

            <div className="mt-4 rounded-md border border-dashed border-border bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                <KeyRound className="size-3.5" aria-hidden="true" />
                Sentetik demo hesapları
              </p>
              <p>
                Yönetici: <code>admin@vetcore-demo.example</code> · Veteriner:{' '}
                <code>veteriner@vetcore-demo.example</code> · Resepsiyon:{' '}
                <code>resepsiyon@vetcore-demo.example</code>
              </p>
              <p className="mt-1">
                Parola (tümü): <code>VetCore2026!</code>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
