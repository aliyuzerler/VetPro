import type { Meta, StoryObj } from '@storybook/nextjs';
import { CalendarDays, PawPrint, Wallet } from 'lucide-react';
import { KpiCard } from './kpi-card';

const meta: Meta<typeof KpiCard> = {
  title: 'Design System/KpiCard',
  component: KpiCard,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof KpiCard>;

export const KartDizilimi: Story = {
  name: 'Kart dizilimi (trend varyantları)',
  render: () => (
    <div className="grid w-[720px] max-w-full gap-4 sm:grid-cols-3">
      <KpiCard
        label="Aylık ciro"
        value="₺184.250"
        hint="Kasım 2026"
        icon={Wallet}
        trend={{ direction: 'up', text: '+%12 geçen aya göre' }}
      />
      <KpiCard
        label="Aktif hasta"
        value="1.284"
        hint="Son 30 gün"
        icon={PawPrint}
        trend={{ direction: 'flat', text: 'değişim yok' }}
      />
      <KpiCard
        label="Bugünkü randevu"
        value="37"
        hint="14 tanesi beklemede"
        icon={CalendarDays}
        trend={{ direction: 'down', text: '-%4 dünkü doluluk' }}
      />
    </div>
  ),
  parameters: { layout: 'padded' },
};

export const Yukleme: Story = {
  name: 'Yükleme (minimal)',
  args: {
    label: 'Bekleyen ödeme',
    value: '₺12.900',
    icon: Wallet,
  },
};

export const Ipucu: Story = {
  name: 'İpucu metinli',
  args: {
    label: 'Aşı hatırlatması',
    value: '58',
    hint: 'Önümüzdeki 7 gün içinde 12 kombine aşı',
    icon: PawPrint,
  },
};
