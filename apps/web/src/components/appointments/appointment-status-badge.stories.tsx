import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { AppointmentStatusBadge, APPOINTMENT_STATUS_LABELS } from './appointment-status-badge';
import type { AppointmentStatus } from '@/lib/api-types';

const meta: Meta<typeof AppointmentStatusBadge> = {
  title: 'Faz 05/Randevu Durum Rozeti',
  component: AppointmentStatusBadge,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof AppointmentStatusBadge>;

const STATUSES = Object.keys(APPOINTMENT_STATUS_LABELS) as AppointmentStatus[];

export const TumDurumlar: Story = {
  name: 'Tüm durumlar (metin her zaman görünür)',
  render: () => (
    <ul className="flex flex-wrap gap-2" aria-label="Randevu durumları">
      {STATUSES.map((status) => (
        <li key={status}>
          <AppointmentStatusBadge status={status} />
        </li>
      ))}
    </ul>
  ),
  play: async ({ canvas }) => {
    // a11y kuralı: durum yalnızca renkle iletilmez — etiket metni görünür
    for (const status of STATUSES) {
      await expect(canvas.getByText(APPOINTMENT_STATUS_LABELS[status])).toBeVisible();
    }
  },
};

export const TekliPlanlandi: Story = {
  name: 'Tekli: Planlandı',
  render: () => <AppointmentStatusBadge status="scheduled" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Planlandı')).toBeVisible();
  },
};
