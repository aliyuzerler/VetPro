'use client';

import { useState } from 'react';
import { Bell, Building2, ChevronDown, CircleHelp, Menu, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { StatusChip } from '@/components/design-system/status-chip';

/**
 * Üst çubuk — design/DESIGN_SYSTEM.md > Layout > Desktop shell (72 px).
 * Şube seçici, global arama, bildirimler, yardım ve profil.
 * Kimlik ve arama Faz 03/04'te gerçekleşir; sahte iş akışı yoktur.
 */
export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const [branch, setBranch] = useState('Merkez Şube');

  return (
    <header
      className="flex h-[var(--vc-topbar-height)] shrink-0 items-center gap-3 border-b border-border bg-card px-4 sm:px-6"
      data-testid="app-topbar"
    >
      {/* Mobil menü düğmesi — ≥44px dokunma hedefi */}
      <Button
        variant="ghost"
        size="icon"
        className="size-11 shrink-0 lg:hidden"
        onClick={onOpenMobileNav}
        aria-label="Menüyü aç"
      >
        <Menu className="size-5" aria-hidden="true" />
      </Button>

      {/* Şube seçici — sentetik demo verisi (prisma seed: VetCore Demo Kliniği) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="min-h-11 gap-2 px-3 font-medium">
            <Building2 className="size-4 text-brand-600" aria-hidden="true" />
            <span className="max-w-40 truncate">{branch}</span>
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>VetCore Demo Kliniği</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setBranch('Merkez Şube')}>
            {branch === 'Merkez Şube' ? '●' : '○'} Merkez Şube
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setBranch('İkinci Şube')}>
            {branch === 'İkinci Şube' ? '●' : '○'} İkinci Şube
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>Şube yönetimi — Faz 03&apos;te</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Global arama — Faz 04'te hasta/hasta sahibi/mikroçip araması */}
      <div className="relative ml-auto hidden w-full max-w-72 md:block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          disabled
          placeholder="Hasta, hasta sahibi, mikroçip… (Faz 04)"
          className="min-h-11 pl-9 text-sm"
          aria-label="Global arama (Faz 04'te aktifleşecek)"
        />
      </div>

      <div className="ml-auto flex items-center gap-1 md:ml-0">
        {/* Bildirimler — sentetik demo içerik */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative size-11" aria-label="Bildirimler">
              <Bell className="size-5" aria-hidden="true" />
              <span
                className="absolute right-2.5 top-2.5 size-2 rounded-full bg-status-danger"
                aria-hidden="true"
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold">
              Bildirimler
            </div>
            <ul className="flex flex-col divide-y divide-border">
              <li className="flex flex-col gap-1 px-4 py-3">
                <span className="text-sm font-medium">Aşı hatırlatması (demo)</span>
                <span className="text-xs text-muted-foreground">
                  Tekir — Kombinizasyon aşısı yarın vadesinde.
                </span>
              </li>
              <li className="flex flex-col gap-1 px-4 py-3">
                <span className="text-sm font-medium">Kritik stok (demo)</span>
                <span className="text-xs text-muted-foreground">
                  İyot solüsyonu 500 ml — Merkez Şube&apos;de 3 adet kaldı.
                </span>
              </li>
            </ul>
            <div className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">
              Gerçek bildirimler Faz 12&apos;de
            </div>
          </PopoverContent>
        </Popover>

        {/* Yardım — çok dar görünümlerde gizlenir (üst çubuk taşmasın) */}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hidden size-11 sm:inline-flex"
                aria-label="Yardım"
              >
                <CircleHelp className="size-5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Kullanım kılavuzu Faz 15&apos;te eklenecek</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Profil */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="min-h-11 gap-2 px-2"
              aria-label="Profil menüsü"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-900">
                AD
              </span>
              <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>
              <span className="flex flex-col">
                <span>Dr. Ayşe Demir</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Veteriner Hekim — demo profil
                </span>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>Profil ve güvenlik — Faz 03&apos;te</DropdownMenuItem>
            <DropdownMenuItem disabled>Çıkış — Faz 03&apos;te</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Canlı sistem rozeti — API sözleşmesiyle doğrulanır */}
      <div className="hidden shrink-0 xl:block">
        <StatusChip tone="info" label="Faz 02 demo kabuk" />
      </div>
    </header>
  );
}
