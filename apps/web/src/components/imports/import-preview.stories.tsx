import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, userEvent, within } from 'storybook/test';
import { ImportPreviewTable, ImportRowStatusBadge } from './import-preview';
import type { ImportRowDto } from '@/lib/api-types';

const meta: Meta<typeof ImportPreviewTable> = {
  title: 'Faz 14/İçe Aktarma Önizleme',
  component: ImportPreviewTable,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof ImportPreviewTable>;

const ROWS: ImportRowDto[] = [
  {
    id: 'r-1',
    rowNumber: 2,
    status: 'valid',
    rawData: { ad: 'Ayşe', soyad: 'Yılmaz', eposta: 'ayse@ornek.com' },
    errors: null,
    matchedId: null,
    resolution: 'create',
    createdRecordId: null,
  },
  {
    id: 'r-2',
    rowNumber: 3,
    status: 'error',
    rawData: { ad: 'Mehmet', soyad: '' },
    errors: { soyad: 'zorunlu alan', eposta: 'eposta veya telefon en az biri dolu olmalı' },
    matchedId: null,
    resolution: null,
    createdRecordId: null,
  },
  {
    id: 'r-3',
    rowNumber: 4,
    status: 'duplicate',
    rawData: { ad: 'Ayşe', soyad: 'Yılmaz', eposta: 'ayse@ornek.com' },
    errors: null,
    matchedId: 'a1b2c3d4-0000-0000-0000-000000000000',
    resolution: null,
    createdRecordId: null,
  },
];

export const KarisikDurumlar: Story = {
  name: 'Geçerli + Hatalı + Duplicate',
  args: {
    rows: ROWS,
    onResolve: () => undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Üç durum rozeti bir arada
    expect(canvas.getByTestId('row-status-valid')).toBeVisible();
    expect(canvas.getByTestId('row-status-error')).toBeVisible();
    expect(canvas.getByTestId('row-status-duplicate')).toBeVisible();
    // Hata kolonu alan bazlı mesajları gösterir
    expect(canvas.getByTestId('row-errors-3').textContent).toContain('zorunlu alan');
    // Duplicate satırda karar düğmeleri — sessiz overwrite yok
    expect(canvas.getByTestId('resolve-create-4')).toBeVisible();
    expect(canvas.getByTestId('resolve-skip-4')).toBeVisible();
  },
};

export const DuplicateKarari: Story = {
  name: 'Duplicate — Atla kararı seçili',
  args: {
    rows: [{ ...ROWS[2]!, resolution: 'skip' }],
    onResolve: () => undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const skipButton = canvas.getByTestId('resolve-skip-4');
    // Seçili karar primary varyantta (bg-primary token'ı)
    expect(skipButton.className).toContain('bg-primary');
    await userEvent.click(canvas.getByTestId('resolve-create-4'));
  },
};

export const DurumRozetleri: StoryObj<typeof ImportRowStatusBadge> = {
  name: 'Durum rozetleri (üçlü)',
  render: () => (
    <div className="flex gap-2">
      {ROWS.map((row) => (
        <ImportRowStatusBadge key={row.id} row={row} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByTestId('row-status-valid').textContent).toContain('Geçerli');
    expect(canvas.getByTestId('row-status-error').textContent).toContain('Hatalı');
    expect(canvas.getByTestId('row-status-duplicate').textContent).toContain('Duplicate');
  },
};
