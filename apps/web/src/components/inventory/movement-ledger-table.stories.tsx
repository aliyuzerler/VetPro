import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { MovementLedgerTable } from './movement-ledger-table';
import type { StockMovementDto } from '@/lib/api-types';

const meta: Meta<typeof MovementLedgerTable> = {
  title: 'Faz 07/Hareket Defteri',
  component: MovementLedgerTable,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof MovementLedgerTable>;

const day = (offset: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
};

const MOVEMENTS: StockMovementDto[] = [
  {
    id: 'm-1',
    clinicId: 'c1',
    branchId: 'b1',
    warehouseId: 'wh-1',
    warehouse: { id: 'wh-1', name: 'Merkez Ana Depo', branch: { name: 'Merkez' } },
    kind: 'goods_receipt',
    status: 'posted',
    supplier: { id: 's-1', name: 'VetPharm Dağıtım A.Ş.' },
    refType: null,
    refId: null,
    reason: null,
    note: 'İrsaliye 88121',
    performedBy: { id: 'st-1', firstName: 'Ayşe', lastName: 'Demir' },
    idempotencyKey: null,
    postedAt: day(0, 9),
    lines: [
      {
        id: 'ml-1',
        productId: 'p-1',
        product: { id: 'p-1', code: 'UR-AMOX250', name: 'Amoksisilin 250 mg/ml Enjeksiyon' },
        lotId: 'lot-1',
        lot: { id: 'lot-1', lotCode: 'B2503', expiresAt: day(21) },
        qty: '30',
        unitCost: '24',
      },
    ],
  },
  {
    id: 'm-2',
    clinicId: 'c1',
    branchId: 'b1',
    warehouseId: 'wh-1',
    warehouse: { id: 'wh-1', name: 'Merkez Ana Depo', branch: { name: 'Merkez' } },
    kind: 'adjustment',
    status: 'posted',
    supplier: null,
    refType: 'StockCount',
    refId: 'say-1',
    reason: 'Kırık şişe tespit edildi',
    note: null,
    performedBy: { id: 'st-1', firstName: 'Ayşe', lastName: 'Demir' },
    idempotencyKey: null,
    postedAt: day(0, 12),
    lines: [
      {
        id: 'ml-2',
        productId: 'p-1',
        product: { id: 'p-1', code: 'UR-AMOX250', name: 'Amoksisilin 250 mg/ml Enjeksiyon' },
        lotId: 'lot-1',
        lot: { id: 'lot-1', lotCode: 'B2503', expiresAt: day(21) },
        qty: '-3',
        unitCost: '0',
      },
    ],
  },
];

export const DefterKayitlari: Story = {
  name: 'Mal kabul ve düzeltme kayıtları',
  render: () => <MovementLedgerTable movements={MOVEMENTS} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Mal Kabul')).toBeVisible();
    await expect(canvas.getByText('Düzeltme')).toBeVisible();
    await expect(canvas.getByText('+30')).toBeVisible();
    await expect(canvas.getByText('-3')).toBeVisible();
    await expect(canvas.getByText('Kırık şişe tespit edildi')).toBeVisible();
    await expect(canvas.getAllByText(/B2503/).length).toBeGreaterThan(0);
  },
};

export const BosDefter: Story = {
  name: 'Boş defter',
  render: () => <MovementLedgerTable movements={[]} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Hareket kaydı yok.')).toBeVisible();
  },
};
