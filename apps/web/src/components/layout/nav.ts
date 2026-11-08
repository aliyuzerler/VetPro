import {
  BarChart3,
  BedDouble,
  Bell,
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
      { label: 'Akış Panosu', phase: 5, href: '/akis-panosu' },
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
      { label: 'Aşı Takvimi', phase: 10, href: '/asisler' },
    ],
  },
  {
    label: 'Randevular',
    icon: CalendarDays,
    items: [
      { label: 'Takvim', phase: 5, href: '/takvim' },
      { label: 'Bekleme Listesi', phase: 5, href: '/bekleme-listesi' },
    ],
  },
  {
    label: 'Muayene',
    icon: Stethoscope,
    items: [
      { label: 'Muayene İşlemi', phase: 6, href: '/muayene' },
      { label: 'Hizmet Kataloğu', phase: 6, href: '/hizmetler' },
    ],
  },
  {
    label: 'Aşı & Reçete',
    icon: Pill,
    items: [
      { label: 'Reçeteler', phase: 10, href: '/receteler' },
      { label: 'Aşı Hatırlatmaları', phase: 10, href: '/asisler?tab=hatirlatmalar' },
    ],
  },
  {
    label: 'Depo & Stok',
    icon: Boxes,
    items: [
      { label: 'Ürünler', phase: 7, href: '/urunler' },
      { label: 'Partiler ve Son Kullanma', phase: 7, href: '/partiler' },
      { label: 'Stok Hareketleri', phase: 7, href: '/stok-hareketleri' },
    ],
  },
  {
    label: 'Satın Alma',
    icon: ShoppingCart,
    items: [{ label: 'Tedarikçiler', phase: 7, href: '/tedarikciler' }],
  },
  {
    label: 'Finans',
    icon: Wallet,
    items: [
      { label: 'Tahsilatlar', phase: 9, href: '/tahsilat' },
      { label: 'Hasta Sahibi Bakiyeleri', phase: 9, href: '/cari' },
      { label: 'Kasa', phase: 9, href: '/kasa' },
      { label: 'Giderler ve Borçlar', phase: 9, href: '/giderler' },
    ],
  },
  {
    label: 'Laboratuvar',
    icon: FlaskConical,
    items: [{ label: 'Lab Siparişleri', phase: 11, href: '/laboratuvar' }],
  },
  {
    label: 'Yatış & Cerrahi',
    icon: BedDouble,
    items: [
      { label: 'Yatış Panosu', phase: 11, href: '/yatis' },
      { label: 'Cerrahi Olgular', phase: 11, href: '/cerrahi' },
    ],
  },
  {
    label: 'İletişim & Belgeler',
    icon: Bell,
    items: [
      { label: 'Bildirim Merkezi', phase: 12, href: '/bildirimler' },
      { label: 'Belgeler', phase: 12, href: '/belgeler' },
    ],
  },
  {
    label: 'Raporlar',
    icon: BarChart3,
    items: [
      { label: 'Raporlar ve Dışa Aktarma', phase: 14, href: '/raporlar' },
      { label: 'Veri İçe Aktarma', phase: 14, href: '/ice-aktarim' },
    ],
  },
  {
    label: 'Yönetim',
    icon: Settings,
    items: [
      { label: 'Tasarım Sistemi', phase: 2, href: '/stil-rehberi' },
      { label: 'Klinik Ayarları', phase: 3, href: '/ayarlar' },
      { label: 'Denetim Kaydı', phase: 3, href: '/ayarlar?tab=denetim' },
      { label: 'Entegrasyonlar', phase: 12, href: '/entegrasyonlar' },
      { label: 'Yedekleme', phase: 14, href: '/yedekler' },
    ],
  },
] as const;
