'use client';

import { useState, type ReactNode } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

/**
 * Uygulama kabuğu — design/DESIGN_SYSTEM.md > Layout.
 * Masaüstü (≥1024px): sabit 248 px kenar çubuğu + 72 px üst çubuk,
 * içerik en fazla 1600 px, 28 px sayfa dolgusu.
 * Tablet/mobil: kenar çubuğu Sheet çekmecesiyle açılır; düzen taşmaz.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Masaüstü kenar çubuğu */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden lg:block">
        <Sidebar />
      </aside>

      {/* Mobil çekmece */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[var(--vc-sidebar-width)] bg-sidebar p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigasyon menüsü</SheetTitle>
            <span className="sr-only">VetCore bölüm menüsü</span>
          </SheetHeader>
          <Sidebar onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Sağ içerik alanı */}
      <div className="flex min-h-screen w-full flex-col lg:pl-[var(--vc-sidebar-width)]">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main
          className="mx-auto w-full max-w-[var(--vc-content-max-width)] flex-1 px-4 py-6 sm:px-6 lg:px-[var(--vc-page-padding)]"
          data-testid="app-content"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
