import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { AuthGate } from '@/components/auth/auth-gate';

/**
 * (app) rotaları uygulama kabuğu içinde çalışır ve kimlik korumalıdır.
 * Kabuk: sabit kenar çubuğu + üst çubuk + maksimum 1600 px içerik.
 * Yetkilendirme: API guard'ları zorunlu; AuthGate yalnızca yönlendirme sağlar.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
