import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { StatementTable } from './statement-table';
import type { StatementRowDto } from '@/lib/api-types';

const meta: Meta<typeof StatementTable> = {
  title: 'Faz 09/Cari Ekstre',
  component: StatementTable,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof StatementTable>;

const ROWS: StatementRowDto[] = [
  {
    id: 'c1',
    kind: 'charge',
    direction: '+',
    amount: '450.00',
    runningBalance: '450.00',
    occurredAt: '2026-11-01T09:00:00.000Z',
    description: 'Genel Muayene + Aşı',
  },
  {
    id: 'p1',
    kind: 'payment',
    direction: '-',
    amount: '200.00',
    runningBalance: '250.00',
    occurredAt: '2026-11-02T09:00:00.000Z',
    description: 'Tahsilat (Nakit)',
  },
  {
    id: 'c2',
    kind: 'charge',
    direction: '+',
    amount: '150.00',
    runningBalance: '400.00',
    occurredAt: '2026-11-03T09:00:00.000Z',
    description: 'Diş Taşı Temizliği',
  },
  {
    id: 'r1',
    kind: 'refund',
    direction: '+',
    amount: '50.00',
    runningBalance: '450.00',
    occurredAt: '2026-11-04T09:00:00.000Z',
    description: 'İade (Nakit) — hizmet iptali',
  },
];

export const UcKayitIliskisi: Story = {
  name: 'Ücret/tahsilat/iade ilişkisi (koşan bakiye)',
  render: () => <StatementTable rows={ROWS} />,
  play: async () => {
    const canvas = within(document.body);
    await expect(canvas.getAllByTestId('statement-row-charge')).toHaveLength(2);
    await expect(canvas.getAllByTestId('statement-row-payment')).toHaveLength(1);
    await expect(canvas.getAllByTestId('statement-row-refund')).toHaveLength(1);
    await expect(canvas.getByTestId('statement-table')).toHaveTextContent('450,00');
  },
};

export const BosEkstre: Story = {
  name: 'Boş ekstre',
  render: () => <StatementTable rows={[]} />,
};
