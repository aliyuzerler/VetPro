import type { Meta, StoryObj } from '@storybook/nextjs';
import { LabOrderStatusBadge } from './lab-order-status-badge';

const meta: Meta<typeof LabOrderStatusBadge> = {
  title: 'Faz 11/Lab Sipariş Durumu',
  component: LabOrderStatusBadge,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof LabOrderStatusBadge>;

/** Sipariş oluşturuldu, numune bekleniyor. */
export const Istendi: Story = {
  name: 'İstendi',
  render: () => <LabOrderStatusBadge status="ordered" />,
};

/** Numune alındı, laboratuvara gönderildi. */
export const NumuneAlindi: Story = {
  name: 'Numune alındı',
  render: () => <LabOrderStatusBadge status="sample_collected" />,
};

/** Analiz sürüyor. */
export const Analizde: Story = {
  name: 'Analizde',
  render: () => <LabOrderStatusBadge status="in_progress" />,
};

/** Sonuç girildi, sipariş kapandı. */
export const Tamamlandi: Story = {
  name: 'Tamamlandı',
  render: () => <LabOrderStatusBadge status="completed" />,
};

/** İptal edildi. */
export const Iptal: Story = {
  name: 'İptal',
  render: () => <LabOrderStatusBadge status="cancelled" />,
};
