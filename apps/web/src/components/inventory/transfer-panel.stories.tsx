import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  TransferPanel,
  TransferCreateDialog,
  TransferStatusBadge,
} from './transfer-panel';
import type { LotViewDto, ProductDto, StockTransferDto } from '@/lib/api-types';

const meta: Meta<typeof TransferPanel> = {
  title: 'Faz 07/Transferler',
  component: TransferPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof TransferPanel>;

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString();
};

const PRODUCTS: ProductDto[] = [
  {
    id: 'p-1',
    clinicId: 'c1',
    categoryId: null,
    category: null,
    code: 'UR-AMOX250',
    barcode: null,
    name: 'Amoksisilin 250 mg/ml Enjeksiyon',
    trackingType: 'lot',
    baseUnit: { id: 'u-1', key: 'ml', name: 'Mililitre' },
    minStock: '10',
    defaultSalePrice: null,
    notes: null,
    active: true,
    conversions: [],
  },
];
const LOTS: LotViewDto[] = [
  {
    id: 'lot-1',
    lotCode: 'B2503',
    expiresAt: day(21),
    status: 'active',
    unitCost: 24,
    receivedAt: day(-30),
    qtyOnHand: 30,
    warehouseId: 'wh-1',
    warehouseName: 'Merkez Ana Depo',
    branchName: 'Merkez',
    blockReason: null,
  },
];

const TRANSFERS: StockTransferDto[] = [
  {
    id: 't-0',
    clinicId: 'c1',
    code: 'TRF-0003',
    fromWarehouse: { id: 'wh-1', name: 'Merkez Ana Depo', branch: { name: 'Merkez' } },
    toWarehouse: { id: 'wh-2', name: 'Şube Deposu', branch: { name: 'Şube 2' } },
    status: 'draft',
    note: 'Planlanan ikmal',
    dispatchedAt: null,
    receivedAt: null,
    createdAt: day(0),
    lines: [
      {
        id: 'tl-0',
        productId: 'p-1',
        product: { id: 'p-1', code: 'UR-AMOX250', name: 'Amoksisilin 250 mg/ml Enjeksiyon' },
        lotId: 'lot-1',
        lot: { id: 'lot-1', lotCode: 'B2503', expiresAt: day(21) },
        qty: '4',
        receivedLot: null,
      },
    ],
  },
  {
    id: 't-1',
    clinicId: 'c1',
    code: 'TRF-0001',
    fromWarehouse: { id: 'wh-1', name: 'Merkez Ana Depo', branch: { name: 'Merkez' } },
    toWarehouse: { id: 'wh-2', name: 'Şube Deposu', branch: { name: 'Şube 2' } },
    status: 'dispatched',
    note: 'Haftalık ikmal',
    dispatchedAt: day(0),
    receivedAt: null,
    createdAt: day(0),
    lines: [
      {
        id: 'tl-1',
        productId: 'p-1',
        product: { id: 'p-1', code: 'UR-AMOX250', name: 'Amoksisilin 250 mg/ml Enjeksiyon' },
        lotId: 'lot-1',
        lot: { id: 'lot-1', lotCode: 'B2503', expiresAt: day(21) },
        qty: '10',
        receivedLot: null,
      },
    ],
  },
  {
    id: 't-2',
    clinicId: 'c1',
    code: 'TRF-0002',
    fromWarehouse: { id: 'wh-1', name: 'Merkez Ana Depo', branch: { name: 'Merkez' } },
    toWarehouse: { id: 'wh-2', name: 'Şube Deposu', branch: { name: 'Şube 2' } },
    status: 'received',
    note: null,
    dispatchedAt: day(-2),
    receivedAt: day(-1),
    createdAt: day(-2),
    lines: [
      {
        id: 'tl-2',
        productId: 'p-1',
        product: { id: 'p-1', code: 'UR-AMOX250', name: 'Amoksisilin 250 mg/ml Enjeksiyon' },
        lotId: 'lot-1',
        lot: { id: 'lot-1', lotCode: 'B2503', expiresAt: day(21) },
        qty: '5',
        receivedLot: { id: 'lot-2', lotCode: 'B2503' },
      },
    ],
  },
];

export const TransferListesi: Story = {
  name: 'Taslak, yolda ve teslim alınmış transferler',
  render: () => <TransferPanel transfers={TRANSFERS} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Taslak')).toBeVisible();
    await expect(canvas.getByText('Yolda')).toBeVisible();
    await expect(canvas.getByText('Teslim Alındı')).toBeVisible();
    // Partili satır: 'B2503' birden çok düğümde parçalı olabilir → regex eşleşme
    await expect(canvas.getAllByText(/\(B2503\)/).length).toBeGreaterThan(0);
    await expect(canvas.getByText(/→ B2503/)).toBeVisible();
  },
};

export const SevkVeTeslimEylemleri: Story = {
  name: 'Sevk/teslim aksiyonları',
  render: () => (
    <TransferPanel
      transfers={TRANSFERS}
      canManage
      onDispatch={fn()}
      onReceive={fn()}
    />
  ),
  play: async ({ canvas }) => {
    const dispatch = canvas.getByTestId('transfer-dispatch');
    const receive = canvas.getByTestId('transfer-receive');
    await expect(dispatch).toBeVisible();
    await expect(receive).toBeVisible();
    await userEvent.click(receive);
  },
};

export const DurumRozetleri: Story = {
  name: 'Tüm durum rozetleri',
  render: () => (
    <div className="flex flex-wrap gap-2 p-2">
      <TransferStatusBadge status="draft" />
      <TransferStatusBadge status="dispatched" />
      <TransferStatusBadge status="received" />
      <TransferStatusBadge status="cancelled" />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Taslak')).toBeVisible();
    await expect(canvas.getByText('İptal')).toBeVisible();
  },
};

export const TransferKurulumDiyalogu: Story = {
  name: 'Transfer kurulum diyaloğu',
  render: () => (
    <TransferCreateDialog
      open
      warehouses={[
        { id: 'wh-1', name: 'Merkez Ana Depo', branchName: 'Merkez' },
        { id: 'wh-2', name: 'Şube Deposu', branchName: 'Şube 2' },
      ]}
      products={PRODUCTS}
      lotsByWarehouse={{ 'wh-1': LOTS, 'wh-2': [] }}
      onOpenChange={() => {}}
      onSubmit={fn()}
    />
  ),
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByText('Yeni Transfer')).toBeVisible();
    });
    await expect(body.getByTestId('transfer-save')).toBeDisabled();
  },
};

export const BosTransferListesi: Story = {
  name: 'Boş transfer listesi',
  render: () => <TransferPanel transfers={[]} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Transfer kaydı yok.')).toBeVisible();
  },
};
