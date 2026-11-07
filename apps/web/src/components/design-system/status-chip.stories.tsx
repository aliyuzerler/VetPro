import type { Meta, StoryObj } from '@storybook/nextjs';
import { StatusChip, type StatusTone } from './status-chip';

const TONE_LABELS: Record<StatusTone, string> = {
  success: 'Onaylandı',
  warning: 'Beklemede',
  danger: 'İptal edildi',
  info: 'Bilgi',
  neutral: 'Nötr',
};

const meta: Meta<typeof StatusChip> = {
  title: 'Design System/StatusChip',
  component: StatusChip,
  tags: ['autodocs'],
  argTypes: {
    tone: { control: 'select', options: Object.keys(TONE_LABELS) },
  },
};

export default meta;
type Story = StoryObj<typeof StatusChip>;

export const TumTonlar: Story = {
  name: 'Tüm tonlar',
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {(Object.keys(TONE_LABELS) as StatusTone[]).map((tone) => (
        <StatusChip key={tone} tone={tone} label={TONE_LABELS[tone]} />
      ))}
    </div>
  ),
  parameters: { layout: 'padded' },
};

export const Onaylandi: Story = {
  name: 'Onaylandı (success)',
  args: { tone: 'success', label: 'Onaylandı' },
};

export const Beklemede: Story = {
  name: 'Beklemede (warning)',
  args: { tone: 'warning', label: 'Beklemede' },
};

export const Iptal: Story = {
  name: 'İptal edildi (danger)',
  args: { tone: 'danger', label: 'İptal edildi' },
};

export const Bilgi: Story = {
  name: 'Bilgi (info)',
  args: { tone: 'info', label: 'Beklemede kalan 3 randevu' },
};

export const Notr: Story = {
  name: 'Nötr (neutral)',
  args: { tone: 'neutral', label: 'Arşivlendi' },
};
