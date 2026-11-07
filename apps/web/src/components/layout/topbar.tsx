'use client';

import { Bell, Building2, ChevronDown, CircleHelp, LogOut, Menu, Search, Settings, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { useAuth } from '@/lib/auth-context';

/**
 * Üst çubuk — design/DESIGN_SYSTEM.md > Layout > Desktop shell (72 px).
 * Faz 03: gerçek kimlik bağlamı, aktif şube seçimi (oturuma yazılır) ve çıkış.
 */
export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { session, switchBranch, logout } = useAuth();
  const router = useRouter();
  const initials = session
    ? (session.staff.firstName[0] ?? '') + (session.staff.lastName[0] ?? '')
    : '??';
  const roleNames = session?.roles.map((role) => role.name).join(', ') ?? '';

  async function onSwitchBranch(branchId: string) {
    await switchBranch(branchId);
  }

  async function onLogout() {
    await logout();
    router.replace('/giris');
  }

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

      {/* Aktif şube seçici — oturuma yazılır, API X-Branch-Id kapsamını belirler */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="min-h-11 gap-2 px-3 font-medium"
            data-testid="branch-selector"
            aria-label="Aktif şube seç"
          >
            <Building2 className="size-4 text-brand-600" aria-hidden="true" />
            <span className="max-w-40 truncate">
              {session?.activeBranch?.name ?? 'Şube seçilmedi'}
            </span>
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>VetCore Demo Kliniği</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(session?.branches ?? []).map((branch) => (
            <DropdownMenuItem
              key={branch.id}
              onClick={() => void onSwitchBranch(branch.id)}
              data-testid={`branch-option-${branch.code}`}
            >
              {session?.activeBranch?.id === branch.id ? '●' : '○'} {branch.name}
            </DropdownMenuItem>
          ))}
          {session?.branches.length === 0 ? (
            <DropdownMenuItem disabled>Atanmış şube yok</DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/ayarlar">Şube yönetimi</Link>
          </DropdownMenuItem>
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

        {/* Profil — gerçek kimlik bağlamı */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="min-h-11 gap-2 px-2"
              aria-label="Profil menüsü"
              data-testid="profile-menu"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-900">
                {initials}
              </span>
              <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              <span className="flex flex-col">
                <span>{session?.staff.fullName ?? 'Misafir'}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {session?.staff.title ?? ''} {roleNames ? `· ${roleNames}` : ''}
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {session?.staff.email}
                </span>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/ayarlar">
                <Settings className="size-4" aria-hidden="true" />
                Klinik ayarları
              </Link>
            </DropdownMenuItem>
            {session?.allBranches ? (
              <DropdownMenuItem disabled>
                <ShieldCheck className="size-4" aria-hidden="true" />
                Tüm şubelere erişim
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void onLogout()} data-testid="logout-button">
              <LogOut className="size-4" aria-hidden="true" />
              Çıkış yap
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Canlı sistem rozeti */}
      <div className="hidden shrink-0 xl:block">
        <StatusChip tone="info" label="Faz 03 — kimlik ve şube kapsamı" />
      </div>
    </header>
  );
}
