'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, HeartPulse } from 'lucide-react';
import { useState } from 'react';
import { NAV_GROUPS } from './nav';
import { cn } from '@/lib/utils';

/**
 * Kenar çubuğu — design/DESIGN_SYSTEM.md > Layout > Desktop shell.
 * Sabit 248 px genişlik, derin teal zemin, açılır gruplar.
 * Mobilde AppShell tarafından Sheet içinde aynı bileşenle kullanılır.
 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  // Aktif sayfanın grubu baştan açık gelir
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of NAV_GROUPS) {
      initial[group.label] = group.items.some((item) => item.href === pathname);
    }
    return initial;
  });

  const toggleGroup = (label: string) =>
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  return (
    <div
      className="flex h-full w-[var(--vc-sidebar-width)] flex-col bg-sidebar text-sidebar-foreground"
      data-testid="app-sidebar"
    >
      {/* Marka bloğu */}
      <div className="flex h-[var(--vc-topbar-height)] shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-card">
          <HeartPulse className="size-5" aria-hidden="true" />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-base font-bold tracking-tight">VetCore</span>
          <span className="text-[11px] text-sidebar-foreground/70">
            Veteriner Klinik Yönetimi
          </span>
        </span>
      </div>

      {/* Navigasyon */}
      <nav
        aria-label="Ana navigasyon"
        className="flex-1 overflow-y-auto px-2 py-3"
      >
        <ul className="flex flex-col gap-0.5">
          {NAV_GROUPS.map((group) => {
            const isOpen = openGroups[group.label] ?? false;
            return (
              <li key={group.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={isOpen}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/90',
                    'transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    'focus-visible:outline-2 focus-visible:outline-sidebar-ring',
                  )}
                >
                  <group.icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      'size-3.5 shrink-0 transition-transform duration-200',
                      isOpen && 'rotate-180',
                    )}
                  />
                </button>

                {isOpen && (
                  <ul className="mt-0.5 mb-1 ml-4 flex flex-col gap-0.5 border-l border-sidebar-border pl-3">
                    {group.items.map((item) => {
                      const active = item.href !== undefined && pathname === item.href;
                      if (item.href) {
                        return (
                          <li key={item.label}>
                            <Link
                              href={item.href}
                              onClick={onNavigate}
                              aria-current={active ? 'page' : undefined}
                              className={cn(
                                'flex min-h-9 items-center rounded-md px-3 py-1.5 text-sm',
                                'focus-visible:outline-2 focus-visible:outline-sidebar-ring',
                                active
                                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                              )}
                            >
                              {item.label}
                            </Link>
                          </li>
                        );
                      }
                      // İlgili fazda aktifleşecek yaprak — sahte hedef verilmez
                      return (
                        <li key={item.label}>
                          <span
                            aria-disabled="true"
                            title={`Faz ${String(item.phase).padStart(2, '0')}'de aktifleşecek`}
                            className="flex min-h-9 cursor-default items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm text-sidebar-foreground/45"
                          >
                            {item.label}
                            <span className="rounded-full border border-sidebar-border px-1.5 py-0.5 font-mono text-[10px] leading-none text-sidebar-foreground/55">
                              F{String(item.phase).padStart(2, '0')}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Alt kullanıcı bloğu — kimlik Faz 03'te gerçek olacak */}
      <div className="shrink-0 border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-md px-1 py-1">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
            AD
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-xs font-medium">Dr. Ayşe Demir</span>
            <span className="truncate text-[11px] text-sidebar-foreground/60">
              Veteriner Hekim — Faz 03&apos;te kimlik doğrulaması
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
