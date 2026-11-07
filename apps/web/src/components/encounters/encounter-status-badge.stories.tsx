import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import {
  EncounterStatusBadge,
  ENCOUNTER_STATUS_LABELS,
} from './encounter-status-badge';
import type { EncounterStatus } from '@/lib/api-types';

const meta: Meta<typeof EncounterStatusBadge> = {
  title: 'Faz 06/Muayene Durum Rozeti',
  component: EncounterStatusBadge,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof EncounterStatusBadge>;

const STATUSES = Object.keys(ENCOUNTER_STATUS_LABELS) as EncounterStatus[];

export const TumDurumlar: Story = {
  name: 'Tüm durumlar',
  render: () => (
    <ul className="flex flex-wrap gap-2" aria-label="Muayene durumları">
      {STATUSES.map((status) => (
        <li key={status}>
          <EncounterStatusBadge status={status} />
        </li>
      ))}
    </ul>
  ),
  play: async ({ canvas }) => {
    // a11y kuralı: durum yalnızca renkle iletilmez — etiket metni görünür
    for (const status of STATUSES) {
      await expect(canvas.getByText(ENCOUNTER_STATUS_LABELS[status])).toBeVisible();
    }
  },
};

export const TekliImzalandi: Story = {
  name: 'Tekli: İmzalandı (kilitli kayıt)',
  render: () => <EncounterStatusBadge status="signed" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('İmzalandı')).toBeVisible();
  },
};
