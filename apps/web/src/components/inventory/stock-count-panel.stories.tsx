import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  StockCountCreateDialog,
  StockCountSheet,
} from './stock-count-panel';
import type { StockCountDto } from '@/lib/api-types';

const meta: Meta<typeof StockCountSheet> = {
  title: 'Faz 07/Stok Sayımı',
  component: StockCountSheet,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof StockCountSheet>;

const DRAFT_COUNT: StockCountDto = {
  id: 'say-1',
  clinicId: 'c1',
  code: 'SAY-0001',
  warehouse: { id: 'wh-1', name: 'Merkez Ana Depo', branch: { name: 'Merkez' } },
  status: 'draft',
  note: null,
  completedAt: null,
  completedBy: null,
  createdAt: new Date().toISOString(),
  lines: [
    {
      id: 'cl-1',
      productId: 'p-1',
      product: { id: 'p-1', code: 'UR-AMOX250', name: 'Amoksisilin 250 mg/ml Enjeksiyon' },
      lotId: 'lot-1',
      lot: { id: 'lot-1', lotCode: 'B2503', expiresAt: null },
      expectedQty: '30',
      countedQty: null,
    },
    {
      id: 'cl-2',
      productId: 'p-2',
      product: { id: 'p-2', code: 'UR-ELDIVEN', name: 'Muayene Eldiveni (100lü kutu)' },
      lotId: null,
      lot: null,
      expectedQty: '9',
      countedQty: null,
    },
  ],
};

export const TaslakFoy: Story = {
  name: 'Taslak sayım föyü',
  render: () => (
    <StockCountSheet
      count={DRAFT_COUNT}
      onComplete={fn()}
      onCountLine={fn()}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Sayım föyü SAY-0001')).toBeVisible();
    await expect(canvas.getByText('Taslak')).toBeVisible();
    // Gerekçe girilmeden tamamlama düğmesi kapalıdır
    const complete = canvas.getByTestId('count-complete');
    await expect(complete).toBeDisabled();
  },
};

export const SayimGirisiVeTamamlama: Story = {
  name: 'Sayım girişi + gerekçe ile tamamlama',
  render: () => (
    <StockCountSheet
      count={DRAFT_COUNT}
      onComplete={fn()}
      onCountLine={fn()}
    />
  ),
  play: async ({ canvas }) => {
    const inputs = canvas.getAllByTestId('count-line-input');
    await userEvent.type(inputs[0]!, '28');
    await userEvent.type(canvas.getByTestId('count-reason'), 'Kırık şişe tespit edildi');
    const complete = canvas.getByTestId('count-complete');
    await expect(complete).toBeEnabled();
    await userEvent.click(complete);
  },
};

export const TamamlanmisFoy: Story = {
  name: 'Tamamlanmış föy (salt okunur)',
  render: () => (
    <StockCountSheet
      count={{
        ...DRAFT_COUNT,
        status: 'completed',
        completedAt: new Date().toISOString(),
        completedBy: { id: 'st-1', firstName: 'Ayşe', lastName: 'Demir' },
        lines: DRAFT_COUNT.lines.map((line, index) => ({
          ...line,
          countedQty: index === 0 ? '28' : '9',
        })),
      }}
      onComplete={fn()}
      onCountLine={fn()}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Tamamlandı')).toBeVisible();
    await expect(canvas.getByText('-2')).toBeVisible();
  },
};

export const SayimBaslatmaDiyalogu: Story = {
  name: 'Sayım başlatma diyaloğu',
  render: () => (
    <StockCountCreateDialog
      open
      warehouses={[{ id: 'wh-1', name: 'Merkez Ana Depo', branchName: 'Merkez' }]}
      onOpenChange={() => {}}
      onSubmit={fn()}
    />
  ),
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByText('Sayım Başlat')).toBeVisible();
    });
    await expect(body.getByTestId('count-create-save')).toBeDisabled();
  },
};
