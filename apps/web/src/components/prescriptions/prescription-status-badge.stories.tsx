import type { Meta, StoryObj } from '@storybook/nextjs';
import { PrescriptionStatusBadge } from './prescription-status-badge';

const meta: Meta<typeof PrescriptionStatusBadge> = {
  title: 'Faz 10/Reçete Durum Rozeti',
  component: PrescriptionStatusBadge,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof PrescriptionStatusBadge>;

/** Taslak reçete — imza bekliyor. */
export const Taslak: Story = {
  name: 'Taslak reçete',
  render: () => <PrescriptionStatusBadge status="draft" />,
};

/** İmzalı reçete — klinik tekil numarası atanmış. */
export const Imzali: Story = {
  name: 'İmzalı reçete (numaralı)',
  render: () => <PrescriptionStatusBadge status="signed" code="REC-0001" />,
};

/** İptal edilmiş taslak. */
export const Iptal: Story = {
  name: 'İptal edilmiş taslak',
  render: () => <PrescriptionStatusBadge status="voided" />,
};
