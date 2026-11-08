import type { Meta, StoryObj } from '@storybook/nextjs';
import { KennelOccupancyChip } from './kennel-occupancy-chip';

const meta: Meta<typeof KennelOccupancyChip> = {
  title: 'Faz 11/Kennel Doluluk Rozeti',
  component: KennelOccupancyChip,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof KennelOccupancyChip>;

/** Boş orta boy kafes. */
export const Bos: Story = {
  name: 'Boş (orta)',
  render: () => <KennelOccupancyChip occupied={false} active={true} size="medium" />,
};

/** Dolu büyük kafes — yatan hasta adıyla. */
export const Dolu: Story = {
  name: 'Dolu (büyük)',
  render: () => (
    <KennelOccupancyChip occupied={true} active={true} size="large" patientName="Karabaş" />
  ),
};

/** Pasifleştirilmiş kafes — bakım kapalı. */
export const Pasif: Story = {
  name: 'Pasif',
  render: () => <KennelOccupancyChip occupied={false} active={false} size="small" />,
};
