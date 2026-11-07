import {
  BarChart3,
  BedDouble,
  Boxes,
  Building2,
  CalendarDays,
  FlaskConical,
  Heart,
  LayoutDashboard,
  Pill,
  Settings,
  ShoppingCart,
  Stethoscope,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Kenar çubuğu navigasyonu — design/DESIGN_SYSTEM.md > Components > Sidebar navigation.
 * Faz 02'de yalnızca kabuk ve iki gerçek hedef mevcuttur (Kontrol Paneli, Tasarım Sistemi);
 * diğer yapraklar ilgili fazda aktifleşecek şekilde planlanmıştır. Sahte iş akışı içermez.
 */
export interface NavLeaf {
  label: string;
  /** Yaprak hangi fazda gerçek veriyle aktifleşecek */
  phase: number;
  /** Faz aktifse gerçek hedef; aksi hâlde tanımsız (devre dışı yaprak) */
  href?: string;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: NavLeaf[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Genel Bakış',
    icon: LayoutDashboard,
    items: [
      { label: 'Kontrol Paneli', phase: 2, href: '/' },
      { label: 'Akış Panosu', phase: 5 },
    ],
  },
  {
    label: 'Klinik',
    icon: Building2,
    items: [
      { label: 'Şubeler ve Personel', phase: 3, href: '/ayarlar' },
      { label: 'Hasta Sahipleri', phase: 4, href: '/sahipler' },
    ],
  },
  {
    label: 'Hastalar',
    icon: Heart,
    items: [
      { label: 'Hasta Listesi', phase: 4, href: '/hastalar' },
      { label: 'Aşı Takvimi', phase: 10 },
    ],
  },
  {
    label: 'Randevular',
    icon: CalendarDays,
    items: [
      { label: 'Takvim', phase: 5 },
      { label: 'Bekleme Listesi', phase: 5 },
    ],
  },
  {
    label: 'Muayene',
    icon: Stethoscope,
    items: [
      { label: 'Muayene İşlemi', phase: 6 },
      { label: 'Hizmet Kataloğu', phase: 6 },
    ],
  },
  {
    label: 'Aşı & Reçete',
    icon: Pill,
    items: [
      { label: 'Reçeteler', phase: 10 },
      { label: 'Aşı Hatırlatmaları', phase: 10 },
    ],
  },
  {
    label: 'Depo & Stok',
    icon: Boxes,
    items: [
      { label: 'Ürünler', phase: 7 },
      { label: 'Partiler ve Son Kullanma', phase: 7 },
      { label: 'Stok Hareketleri', phase: 7 },
    ],
  },
  {
    label: 'Satın Alma',
    icon: ShoppingCart,
    items: [
      { label: 'Tedarikçiler', phase: 7 },
      { label: 'Satın Alma Siparişleri', phase: 7 },
    ],
  },
  {
    label: 'Finans',
    icon: Wallet,
    items: [
      { label: 'Günlük Ciro', phase: 9 },
      { label: 'Hasta Sahibi Bakiyeleri', phase: 9 },
      { label: 'Kasa', phase: 9 },
    ],
  },
  {
    label: 'Laboratuvar',
    icon: FlaskConical,
    items: [{ label: 'Lab Siparişleri', phase: 11 }],
  },
  {
    label: 'Yatış & Cerrahi',
    icon: BedDouble,
    items: [
      { label: 'Yatış Panosu', phase: 11 },
      { label: 'Cerrahi Olgular', phase: 11 },
    ],
  },
  {
    label: 'Raporlar',
    icon: BarChart3,
    items: [
      { label: 'Finans Raporları', phase: 14 },
      { label: 'Stok Raporları', phase: 14 },
    ],
  },
  {
    label: 'Yönetim',
    icon: Settings,
    items: [
      { label: 'Tasarım Sistemi', phase: 2, href: '/stil-rehberi' },
      { label: 'Klinik Ayarları', phase: 3, href: '/ayarlar' },
      { label: 'Denetim Kaydı', phase: 3, href: '/ayarlar?tab=denetim' },
    ],
  },
] as const;
