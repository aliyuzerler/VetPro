import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { ReportExportBadges, ReportTable } from './report-table';

const meta: Meta<typeof ReportTable> = {
  title: 'Faz 14/Rapor Tablosu',
  component: ReportTable,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof ReportTable>;

const GELIR_TABLO = {
  key: 'gelir',
  title: 'Günlük Gelir',
  columns: [
    { key: 'period', label: 'Gün', type: 'date' as const },
    { key: 'payments', label: 'Tahsilat', type: 'money' as const },
    { key: 'refunds', label: 'İade', type: 'money' as const },
    { key: 'net', label: 'Net', type: 'money' as const },
  ],
  rows: [
    { period: '2026-11-07', payments: 4250, refunds: 0, net: 4250 },
    { period: '2026-11-08', payments: 3120.5, refunds: 150, net: 2970.5 },
  ],
  totalColumns: ['payments', 'refunds', 'net'],
};

export const GelirTablosu: Story = {
  name: 'Gelir — TOPLAM satırıyla',
  args: { table: GELIR_TABLO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Para hücresi tr-TR biçimli (binlik nokta + ondalık virgül)
    expect(canvas.getByTestId('report-table')).toBeVisible();
    const totals = canvas.getByTestId('report-totals');
    expect(totals.textContent).toContain('TOPLAM');
    expect(totals.textContent).toContain('7.370,50 ₺');
  },
};

export const BosTablo: Story = {
  name: 'Boş veri — kayıt bulunamadı',
  args: {
    table: { ...GELIR_TABLO, rows: [] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('Kayıt bulunamadı')).toBeVisible();
  },
};

export const ExportRozetleri: StoryObj<typeof ReportExportBadges> = {
  name: 'Dışa aktarma biçimleri',
  render: () => <ReportExportBadges formats={['csv', 'xlsx', 'pdf']} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByTestId('export-badges').textContent).toContain('CSV');
    expect(canvas.getByTestId('export-badges').textContent).toContain('XLSX');
    expect(canvas.getByTestId('export-badges').textContent).toContain('PDF');
  },
};
