import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn } from 'storybook/test';
import { WaitlistTable, waitlistTimeLabel } from './waitlist-table';
import type { WaitlistEntry } from '@/lib/api-types';

const meta: Meta<typeof WaitlistTable> = {
  title: 'Faz 05/Bekleme Listesi',
  component: WaitlistTable,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof WaitlistTable>;

const ENTRIES: WaitlistEntry[] = [
  {
    id: 'w-1',
    branchId: 'branch-1',
    patientId: 'patient-1',
    ownerId: 'owner-1',
    appointmentTypeId: 'type-1',
    preferredStaffId: 'staff-1',
    preferredDate: '2026-11-10',
    preferredStartMin: 540,
    preferredEndMin: 660,
    note: 'Sabah 09:00–11:00 arası tercih eder',
    status: 'waiting',
    bookedAppointmentId: null,
    createdAt: '2026-11-07T07:00:00.000Z',
    patient: {
      id: 'patient-1',
      name: 'Duman',
      code: 'HP-0003',
      alerts: [{ kind: 'allergy', label: 'Kuduz aşısı sonrası reaksiyon', severity: 'high' }],
    },
    owner: { id: 'owner-1', firstName: 'Mehmet', lastName: 'Yılmaz' },
    type: { id: 'type-1', name: 'Kontrol', colorKey: 'cyan', durationMin: 15 },
    preferredStaff: { id: 'staff-1', firstName: 'Ayşe', lastName: 'Demir' },
    bookedAppointment: null,
  },
  {
    id: 'w-2',
    branchId: 'branch-1',
    patientId: 'patient-2',
    ownerId: 'owner-2',
    appointmentTypeId: null,
    preferredStaffId: null,
    preferredDate: null,
    preferredStartMin: null,
    preferredEndMin: null,
    note: null,
    status: 'waiting',
    bookedAppointmentId: null,
    createdAt: '2026-11-07T08:00:00.000Z',
    patient: { id: 'patient-2', name: 'Karabaş', code: 'HP-0002', alerts: [] },
    owner: { id: 'owner-2', firstName: 'Zeynep', lastName: 'Aksoy' },
    type: null,
    preferredStaff: null,
    bookedAppointment: null,
  },
];

export const DoluTablo: Story = {
  name: 'Bekleyen kayıtlar',
  render: () => (
    <WaitlistTable
      entries={ENTRIES}
      isLoading={false}
      isError={false}
      onRetry={fn()}
      onBook={fn()}
      onCancel={fn()}
      canManage
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Duman (HP-0003)')).toBeVisible();
    // İki bekleyen kayıt → iki eylem düğmesi (getAllBy)
    const bookButtons = canvas.getAllByRole('button', { name: 'Randevuya Çevir' });
    expect(bookButtons.length).toBe(2);
    await expect(bookButtons[0]).toBeVisible();
    // Tercih penceresi etiketi
    await expect(canvas.getByText('2026-11-10 09:00–11:00')).toBeVisible();
    // Boş tercih etiketi (helper fonksiyon çıktısı)
    expect(waitlistTimeLabel(ENTRIES[1]!)).toBe('Herhangi bir zaman');
  },
};

export const BosTablo: Story = {
  name: 'Boş liste',
  render: () => (
    <WaitlistTable
      entries={[]}
      isLoading={false}
      isError={false}
      onRetry={fn()}
      onBook={fn()}
      onCancel={fn()}
      canManage
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Bekleme listesi boş')).toBeVisible();
  },
};

export const YonetimIzniYok: Story = {
  name: 'İzinsiz kullanıcı — eylemler gizli',
  render: () => (
    <WaitlistTable
      entries={ENTRIES}
      isLoading={false}
      isError={false}
      onRetry={fn()}
      onBook={fn()}
      onCancel={fn()}
      canManage={false}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.queryByText('Randevuya Çevir')).toBeNull();
  },
};
