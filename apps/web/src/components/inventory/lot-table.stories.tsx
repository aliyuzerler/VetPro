import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { LotTable, ExpiryBadge, LotBlockBadge } from './lot-table';
import type { LotViewDto } from '@/lib/api-types';

const meta: Meta<typeof LotTable> = {
  title: 'Faz 07/Parti Tablosu',
  component: LotTable,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof LotTable>;

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString();
};

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
  {
    id: 'lot-2',
    lotCode: 'A2410',
    expiresAt: day(-5),
    status: 'active',
    unitCost: 22.5,
    receivedAt: day(-120),
    qtyOnHand: 12,
    warehouseId: 'wh-1',
    warehouseName: 'Merkez Ana Depo',
    branchName: 'Merkez',
    blockReason: 'expired',
  },
  {
    id: 'lot-3',
    lotCode: 'K2605',
    expiresAt: day(90),
    status: 'quarantined',
    unitCost: 140,
    receivedAt: day(-10),
    qtyOnHand: 6,
    warehouseId: 'wh-1',
    warehouseName: 'Merkez Ana Depo',
    branchName: 'Merkez',
    blockReason: 'quarantined',
  },
];

export const DoluListe: Story = {
  name: 'FEFO sıralı parti listesi',
  render: () => <LotTable lots={LOTS} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('B2503')).toBeVisible();
    await expect(canvas.getByText('Süresi geçmiş')).toBeVisible();
    await expect(canvas.getByText('Karantina')).toBeVisible();
    await expect(canvas.getAllByText('Kullanılabilir')).toHaveLength(1);
  },
};

export const KarantinaAksiyonu: Story = {
  name: 'Karantina aksiyonu etkileşimi',
  render: () => <LotTable lots={LOTS.slice(0, 1)} canManage onToggleStatus={fn()} />,
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Karantinaya Al' });
    await userEvent.click(button);
  },
};

export const BosListe: Story = {
  name: 'Boş parti listesi',
  render: () => <LotTable lots={[]} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Parti kaydı yok.')).toBeVisible();
  },
};

export const SonKullanmaRozetleri: Story = {
  name: 'Son kullanma rozetleri (geçmiş/yakın/normal/tarihsiz)',
  render: () => (
    <div className="flex flex-col gap-2 p-2">
      <ExpiryBadge expiresAt={day(-3)} />
      <ExpiryBadge expiresAt={day(15)} />
      <ExpiryBadge expiresAt={day(200)} />
      <ExpiryBadge expiresAt={null} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Süresi geçmiş ·/)).toBeVisible();
    // Gün sayısı koşum saatine göre 14/15 olabilir → aralık eşleşmesi
    await expect(canvas.getByText(/\d+ gün ·/)).toBeVisible();
  },
};

export const BlokRozetleri: Story = {
  name: 'Blok gerekçe rozetleri',
  render: () => (
    <div className="flex flex-wrap gap-2 p-2">
      <LotBlockBadge reason={null} />
      <LotBlockBadge reason="expired" />
      <LotBlockBadge reason="quarantined" />
      <LotBlockBadge reason="exhausted" />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Kullanılabilir')).toBeVisible();
    await expect(canvas.getByText('Tükendi')).toBeVisible();
  },
};
