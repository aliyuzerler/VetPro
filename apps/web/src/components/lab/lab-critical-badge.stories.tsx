import type { Meta, StoryObj } from '@storybook/nextjs';
import { LabCriticalBadge } from './lab-critical-badge';

const meta: Meta<typeof LabCriticalBadge> = {
  title: 'Faz 11/Kritik Sonuç Rozeti',
  component: LabCriticalBadge,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof LabCriticalBadge>;

/** Onay bekleyen kritik düşük sonuç — uyarı açık. */
export const KritikDusukAcik: Story = {
  name: 'Kritik düşük (onay bekliyor)',
  render: () => <LabCriticalBadge flag="critical_low" acknowledged={false} />,
};

/** Onay bekleyen kritik yüksek sonuç. */
export const KritikYuksekAcik: Story = {
  name: 'Kritik yüksek (onay bekliyor)',
  render: () => <LabCriticalBadge flag="critical_high" acknowledged={false} />,
};

/** Yetkili klinisyen tarafından onaylanmış uyarı. */
export const Onaylandi: Story = {
  name: 'Kritik · onaylandı',
  render: () => <LabCriticalBadge flag="critical_low" acknowledged={true} />,
};
