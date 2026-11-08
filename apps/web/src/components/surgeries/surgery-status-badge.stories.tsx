import type { Meta, StoryObj } from '@storybook/nextjs';
import { SurgeryStatusBadge } from './surgery-status-badge';

const meta: Meta<typeof SurgeryStatusBadge> = {
  title: 'Faz 11/Cerrahi Durum Rozeti',
  component: SurgeryStatusBadge,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof SurgeryStatusBadge>;

/** Planlandı — randevu/plan akışından gelen olgu. */
export const Planlandi: Story = {
  name: 'Planlandı',
  render: () => <SurgeryStatusBadge status="planned" />,
};

/** Hazırlanıyor — kontrol listeleri üretildi. */
export const Hazirlaniyor: Story = {
  name: 'Hazırlanıyor',
  render: () => <SurgeryStatusBadge status="prepped" />,
};

/** Ameliyatta. */
export const Ameliyatta: Story = {
  name: 'Ameliyatta',
  render: () => <SurgeryStatusBadge status="in_surgery" />,
};

/** İyileşmede. */
export const Iyilesmede: Story = {
  name: 'İyileşmede',
  render: () => <SurgeryStatusBadge status="recovery" />,
};

/** Tamamlandı. */
export const Tamamlandi: Story = {
  name: 'Tamamlandı',
  render: () => <SurgeryStatusBadge status="completed" />,
};

/** İptal. */
export const Iptal: Story = {
  name: 'İptal',
  render: () => <SurgeryStatusBadge status="cancelled" />,
};
