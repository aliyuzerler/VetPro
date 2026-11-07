import type { Meta, StoryObj } from '@storybook/nextjs';
import { Badge } from './badge';

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Varyantlar: Story = {
  name: 'Varyantlar',
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Varsayılan</Badge>
      <Badge variant="secondary">İkincil</Badge>
      <Badge variant="destructive">Kritik stok</Badge>
      <Badge variant="outline">Taslak</Badge>
    </div>
  ),
  parameters: { layout: 'padded' },
};

export const Ikonlu: Story = {
  name: 'İkonlu',
  args: { variant: 'secondary', children: 'Klinik · Merkez Şube' },
};
