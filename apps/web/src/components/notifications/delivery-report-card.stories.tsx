import type { Meta, StoryObj } from '@storybook/nextjs';
import { DeliveryReportCard } from './delivery-report-card';
import type { DeliveryReportDto } from '@/lib/api-types';

const meta: Meta<typeof DeliveryReportCard> = {
  title: 'Faz 12/Teslim Raporu Kartı',
  component: DeliveryReportCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof DeliveryReportCard>;

/** Sağlıklı kuyruk: çoğunluk gönderilmiş, tek ölü mektup. */
const healthy: DeliveryReportDto = {
  sinceDays: 30,
  total: 128,
  statusCounts: {
    queued: 3,
    processing: 0,
    sent: 121,
    failed: 2,
    dead_letter: 1,
    skipped: 1,
  },
  channelBreakdown: {
    sms: { sent: 74, dead_letter: 1 },
    email: { sent: 39, failed: 2 },
    push: { sent: 8, skipped: 1 },
  },
  deliverabilityPercent: 94.5,
};

/** Boş rapor — yeni klinik, henüz gönderim yok. */
const empty: DeliveryReportDto = {
  sinceDays: 30,
  total: 0,
  statusCounts: {
    queued: 0,
    processing: 0,
    sent: 0,
    failed: 0,
    dead_letter: 0,
    skipped: 0,
  },
  channelBreakdown: {},
  deliverabilityPercent: 100,
};

export const SaglikliKuyruk: Story = {
  name: 'Sağlıklı kuyruk',
  render: () => <DeliveryReportCard report={healthy} />,
};

export const BosRapor: Story = {
  name: 'Boş rapor',
  render: () => <DeliveryReportCard report={empty} />,
};
