'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth-context';

/**
 * (app) rota grubu koruması: kimlik doğrulanana kadar iskelet gösterir,
 * anon ziyaretçiyi /giris sayfasına yönlendirir. Sunucu tarafı koruma API
 * guard'larındadır; bu bileşen yalnızca UX yönlendirmesidir.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anon') {
      router.replace('/giris');
    }
  }, [status, router]);

  if (status !== 'auth') {
    return (
      <div className="flex flex-col gap-4 p-6" aria-busy="true" aria-label="Oturum doğrulanıyor">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return <>{children}</>;
}
