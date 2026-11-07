import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn } from 'storybook/test';
import { CalendarBoard, localParts } from './calendar-board';
import type { Appointment } from '@/lib/api-types';

const meta: Meta<typeof CalendarBoard> = {
  title: 'Faz 05/Takvim Panosu',
  component: CalendarBoard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof CalendarBoard>;

function appointment(input: {
  id: string;
  patientName: string;
  patientCode: string;
  status: Appointment['status'];
  startISO: string;
  endISO: string;
  typeName: string;
  typeColor: string;
  alerts?: { kind: string; label: string; severity: string }[];
}): Appointment {
  return {
    id: input.id,
    clinicId: 'clinic-1',
    branchId: 'branch-1',
    patientId: `patient-${input.id}`,
    ownerId: 'owner-1',
    appointmentTypeId: 'type-1',
    staffId: 'staff-1',
    roomId: null,
    scheduledStart: input.startISO,
    scheduledEnd: input.endISO,
    status: input.status,
    notes: null,
    cancelledReason: null,
    checkedInAt: null,
    waitingAt: null,
    inConsultationAt: null,
    completedAt: null,
    closedAt: null,
    overrideReason: null,
    patient: {
      id: `patient-${input.id}`,
      name: input.patientName,
      code: input.patientCode,
      branchId: 'branch-1',
      ownerId: 'owner-1',
      alerts: input.alerts ?? [],
    },
    owner: { id: 'owner-1', firstName: 'Zeynep', lastName: 'Aksoy' },
    type: { id: 'type-1', name: input.typeName, colorKey: input.typeColor, durationMin: 20 },
    staff: { id: 'staff-1', firstName: 'Ayşe', lastName: 'Demir', title: 'Veteriner Hekim' },
    room: { id: 'room-1', name: 'Muayene Odası 1' },
    branch: { id: 'branch-1', name: 'Merkez Şube', code: 'MRKZ' },
  };
}

const APPOINTMENTS: Appointment[] = [
  appointment({
    id: 'ap-1',
    patientName: 'Pamuk',
    patientCode: 'HP-0001',
    status: 'completed',
    startISO: '2026-11-09T07:00:00.000Z',
    endISO: '2026-11-09T07:15:00.000Z',
    typeName: 'Kontrol',
    typeColor: 'cyan',
  }),
  appointment({
    id: 'ap-2',
    patientName: 'Karabaş',
    patientCode: 'HP-0002',
    status: 'in_consultation',
    startISO: '2026-11-09T08:00:00.000Z',
    endISO: '2026-11-09T08:15:00.000Z',
    typeName: 'Aşı',
    typeColor: 'green',
  }),
  appointment({
    id: 'ap-3',
    patientName: 'Duman',
    patientCode: 'HP-0003',
    status: 'waiting',
    startISO: '2026-11-09T11:00:00.000Z',
    endISO: '2026-11-09T11:20:00.000Z',
    typeName: 'Muayene',
    typeColor: 'brand',
    alerts: [{ kind: 'allergy', label: 'Kuduz aşısı sonrası reaksiyon', severity: 'high' }],
  }),
];

const ACTIONS = {
  onOpenAppointment: fn(),
  onCheckIn: fn(),
  onAdvance: fn(),
  onNoShow: fn(),
  onCancel: fn(),
  canManage: true,
};

export const GunGorunumu: Story = {
  name: 'Gün görünümü — zaman çizelgesi',
  render: () => (
    <CalendarBoard
      view="day"
      appointments={APPOINTMENTS}
      weekDays={[]}
      monthCells={[]}
      title="9 Kasım 2026 Pazartesi"
      actions={ACTIONS}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Pamuk (HP-0001)')).toBeVisible();
    await expect(canvas.getByText('Karabaş (HP-0002)')).toBeVisible();
    await expect(canvas.getByText('Duman (HP-0003)')).toBeVisible();
    // Durum rozetleri
    await expect(canvas.getByText('Muayenede')).toBeVisible();
    // Uyarı rozeti
    await expect(canvas.getByText('Kuduz aşısı sonrası reaksiyon')).toBeVisible();
    // Check-in eylemi yalnız planlanmış randevuda — bu kümede planlı yok, düğme yok
    await expect(canvas.queryByRole('button', { name: /Check-in/ })).toBeNull();
  },
};

export const AyGorunumu: Story = {
  name: 'Ay görünümü — 6x7 ızgara',
  render: () => {
    // 2026-11-01 Pazar; Pazartesi başlangıçlı ızgara: 5 boş hücre + 30 gün + 7 boşluk
    const cells = Array.from({ length: 42 }, (_, index) => {
      const dayNumber = index - 5;
      const inMonth = dayNumber >= 1 && dayNumber <= 30;
      return {
        key: `cell-${index}`,
        dayOfMonth: inMonth ? dayNumber : 1 + ((index + 2) % 28),
        inMonth,
        isToday: false,
      };
    });
    return (
      <CalendarBoard
        view="month"
        appointments={APPOINTMENTS}
        weekDays={[]}
        monthCells={cells}
        title="Kasım 2026"
        actions={ACTIONS}
      />
    );
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('calendar-month-grid')).toBeVisible();
  },
};

export const SaatDilimiYardimcisi: Story = {
  name: 'localParts — UTC instant → İstanbul yerel parçaları',
  render: () => {
    const parts = localParts('2026-11-09T20:59:00.000Z'); // 23:59 yerel
    return (
      <p data-testid="tz-parts">
        {parts.y}-{String(parts.m).padStart(2, '0')}-{String(parts.d).padStart(2, '0')} ·{' '}
        {Math.floor(parts.min / 60)}:{String(parts.min % 60).padStart(2, '0')}
      </p>
    );
  },
  play: async ({ canvas }) => {
    // Kabul kriteri 6: UTC 20:59 = yerel 23:59 (aynı gün); 21:00 = ertesi gün 00:00
    await expect(canvas.getByTestId('tz-parts').textContent).toContain('2026-11-09');
    await expect(canvas.getByTestId('tz-parts').textContent).toContain('23:59');
  },
};
