import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn } from 'storybook/test';
import { FlowboardBoard, type FlowboardActions } from './flowboard-board';
import type { FlowboardPayload } from '@/lib/api-types';

const meta: Meta<typeof FlowboardBoard> = {
  title: 'Faz 05/Akış Panosu',
  component: FlowboardBoard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof FlowboardBoard>;

const baseEntry = (over: {
  appointmentId: string;
  status: 'arrived' | 'waiting' | 'in_consultation';
  patient: string;
  code: string;
  type: string;
  colorKey: string;
  waitingMinutes: number;
  alerts?: { kind: string; label: string; severity: string }[];
}) => ({
  appointmentId: over.appointmentId,
  status: over.status,
  scheduledStart: '2026-11-09T08:00:00.000Z',
  scheduledEnd: '2026-11-09T08:20:00.000Z',
  waitingMinutes: over.waitingMinutes,
  notes: null,
  patient: {
    id: `patient-${over.appointmentId}`,
    name: over.patient,
    code: over.code,
    alerts: over.alerts ?? [],
  },
  owner: { id: 'owner-1', fullName: 'Zeynep Aksoy' },
  type: { id: 'type-1', name: over.type, colorKey: over.colorKey, durationMin: 20 },
  staff: { id: 'staff-1', fullName: 'Ayşe Demir' },
  room: { id: 'room-1', name: 'Muayene Odası 1' },
});

const PAYLOAD: FlowboardPayload = {
  date: '2026-11-09',
  lanes: {
    arrived: [
      baseEntry({
        appointmentId: 'a-1',
        status: 'arrived',
        patient: 'Duman',
        code: 'HP-0003',
        type: 'Muayene',
        colorKey: 'brand',
        waitingMinutes: 12,
        alerts: [{ kind: 'allergy', label: 'Kuduz aşısı sonrası reaksiyon', severity: 'high' }],
      }),
    ],
    waiting: [
      baseEntry({
        appointmentId: 'a-2',
        status: 'waiting',
        patient: 'Pamuk',
        code: 'HP-0001',
        type: 'Kontrol',
        colorKey: 'cyan',
        waitingMinutes: 25,
        alerts: [{ kind: 'chronic', label: 'Kronik böbrek yetmezliği', severity: 'medium' }],
      }),
      baseEntry({
        appointmentId: 'a-3',
        status: 'waiting',
        patient: 'Karabaş',
        code: 'HP-0002',
        type: 'Aşı',
        colorKey: 'green',
        waitingMinutes: 5,
      }),
    ],
    in_consultation: [
      baseEntry({
        appointmentId: 'a-4',
        status: 'in_consultation',
        patient: 'Boncuk',
        code: 'HP-0004',
        type: 'Operasyon',
        colorKey: 'red',
        waitingMinutes: 18,
      }),
    ],
  },
  counts: {
    scheduled: 3,
    arrived: 1,
    waiting: 2,
    in_consultation: 1,
    completed: 4,
    no_show: 0,
    cancelled: 1,
  },
};

const ACTIONS: FlowboardActions = {
  onAdvance: fn(),
  onCheckIn: fn(),
  onNoShow: fn(),
  onCancel: fn(),
  canManage: true,
};

export const DoluPano: Story = {
  name: 'Dolu pano — şeritler ve eylemler',
  render: () => <FlowboardBoard payload={PAYLOAD} actions={ACTIONS} isLoading={false} isError={false} onRetry={fn()} />,
  play: async ({ canvas }) => {
    // Kabul kriteri 4: check-in edilen hasta "Geldi" şeridinde görünür
    await expect(canvas.getByText('Geldi (Check-in)')).toBeVisible();
    await expect(canvas.getByText('Muayenede')).toBeVisible();
    // Uyarı rozetleri gerçek veriyle taşınır
    await expect(canvas.getByText('Kronik böbrek yetmezliği')).toBeVisible();
    await expect(canvas.getByText('Kuduz aşısı sonrası reaksiyon')).toBeVisible();
    // Bekleme süresi görünür
    await expect(canvas.getByText('Bekleme: 25 dk')).toBeVisible();
    // İzinli sonraki durum eylemleri: arrived → Beklemeye Al
    await expect(canvas.getByRole('button', { name: 'Beklemeye Al' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Tamamla' })).toBeVisible();
  },
};

export const BosPano: Story = {
  name: 'Boş pano',
  render: () => (
    <FlowboardBoard
      payload={{
        date: '2026-11-09',
        lanes: { arrived: [], waiting: [], in_consultation: [] },
        counts: {
          scheduled: 0,
          arrived: 0,
          waiting: 0,
          in_consultation: 0,
          completed: 0,
          no_show: 0,
          cancelled: 0,
        },
      }}
      actions={ACTIONS}
      isLoading={false}
      isError={false}
      onRetry={fn()}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Bugün için aktif kuyruk yok')).toBeVisible();
  },
};

export const Yukleniyor: Story = {
  name: 'Yükleme durumu (iskelet)',
  render: () => (
    <FlowboardBoard
      payload={undefined}
      actions={ACTIONS}
      isLoading
      isError={false}
      onRetry={fn()}
    />
  ),
};
