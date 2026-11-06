import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';

/**
 * (app) rotaları uygulama kabuğu içinde çalışır.
 * Kabuk: sabit kenar çubuğu + üst çubuk + maksimum 1600 px içerik.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
