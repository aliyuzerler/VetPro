import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, waitFor, within } from 'storybook/test';
import {
  ServiceDetailPanel,
  ServicePriceDialog,
} from '@/components/services/service-detail-panel';
import { ServiceFormDialog } from '@/components/services/service-form-dialog';
import type { Branch, ServiceDto } from '@/lib/api-types';

const BRANCHES: Branch[] = [
  {
    id: 'b-1',
    clinicId: 'c-1',
    name: 'Merkez',
    code: 'MRKZ',
    address: null,
    phone: null,
    email: null,
    isPrimary: true,
    active: true,
  },
  {
    id: 'b-2',
    clinicId: 'c-1',
    name: 'Şube 2',
    code: 'SUB2',
    address: null,
    phone: null,
    email: null,
    isPrimary: false,
    active: true,
  },
];

const SERVICE: ServiceDto = {
  id: 's-1',
  clinicId: 'c-1',
  code: 'HIZ-001',
  name: 'Genel Muayene',
  category: 'muayene',
  durationMin: 20,
  notes: null,
  active: true,
  prices: [
    {
      id: 'p-1',
      branchId: null,
      branch: null,
      currency: 'TRY',
      amount: '450',
      taxCode: 'KDV20',
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: null,
    },
    {
      id: 'p-2',
      branchId: 'b-2',
      branch: { id: 'b-2', name: 'Şube 2', code: 'SUB2' },
      currency: 'TRY',
      amount: '480',
      taxCode: 'KDV20',
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: null,
    },
    {
      id: 'p-3',
      branchId: null,
      branch: null,
      currency: 'TRY',
      amount: '380',
      taxCode: 'KDV20',
      validFrom: '2025-01-01T00:00:00.000Z',
      validTo: '2025-12-31T23:59:59.999Z',
    },
  ],
  consumptionRules: [
    { id: 'r-1', defaultQty: '1', unit: 'seans', required: false, allocationPolicy: 'fifo', active: true },
    { id: 'r-2', defaultQty: '1', unit: 'doz', required: true, allocationPolicy: 'fifo', active: true },
  ],
};

const detailMeta: Meta<typeof ServiceDetailPanel> = {
  title: 'Faz 06/Hizmet Detay Paneli',
  component: ServiceDetailPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default detailMeta;

export const FiyatGecmisiVeKurallar: StoryObj<typeof ServiceDetailPanel> = {
  name: 'Fiyat geçmişi (override + süresi dolmuş) ve kurallar',
  render: () => (
    <ServiceDetailPanel service={SERVICE} branches={BRANCHES} canManage onAddPrice={() => {}} onAddRule={() => {}} onDeactivateRule={() => {}} />
  ),
  play: async ({ canvas }) => {
    // Kabul kriteri 6 görsel karşılığı: genel 450, SUB2 override 480, süresi dolmuş satır korunur
    await expect(canvas.getByText('₺450,00')).toBeVisible();
    await expect(canvas.getByText('₺480,00')).toBeVisible();
    await expect(canvas.getByText('₺380,00')).toBeVisible();
    await expect(canvas.getByText('Süresi doldu')).toBeVisible();
    // Genel satır (450 + 380) ve override satırı — 'Tüm şubeler' iki kez geçer
    expect(canvas.getAllByText('Tüm şubeler').length).toBe(2);
    await expect(canvas.getByText('Şube 2')).toBeVisible();
    // Tüketim kuralları
    const rules = canvas.getByTestId('rule-list');
    expect(within(rules).getAllByRole('listitem').length).toBe(2);
  },
};

export const IzinsizSaltOkunur: StoryObj<typeof ServiceDetailPanel> = {
  name: 'İzinsiz kullanıcı (salt-okunur katalog)',
  render: () => <ServiceDetailPanel service={SERVICE} branches={BRANCHES} canManage={false} />,
  play: async ({ canvas }) => {
    expect(canvas.queryByTestId('price-add')).toBeNull();
    expect(canvas.queryByTestId('rule-add')).toBeNull();
  },
};

export const FiyatDiyalogu: StoryObj<typeof ServicePriceDialog> = {
  name: 'Fiyat tanımlama diyaloğu (şube override seçimi)',
  render: () => (
    <ServicePriceDialog
      open
      serviceName="Genel Muayene"
      branches={BRANCHES}
      onOpenChange={() => {}}
      onSubmit={() => {}}
    />
  ),
  play: async () => {
    // Radix Dialog portal'a bağlanır → sorgular document.body üzerinden yapılır
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByText(/Fiyat Tanımla/)).toBeVisible();
    });
    const save = body.getByTestId('price-save');
    expect(save).toBeDisabled();
    await expect(body.getByTestId('price-amount')).toBeVisible();
  },
};

export const HizmetFormuDiyalogu: StoryObj<typeof ServiceFormDialog> = {
  name: 'Hizmet oluşturma formu',
  render: () => (
    <ServiceFormDialog
      open
      editing={null}
      onOpenChange={() => {}}
      onSubmit={() => {}}
    />
  ),
  play: async () => {
    // Radix Dialog portal'a bağlanır → sorgular document.body üzerinden yapılır
    const body = within(document.body);
    await waitFor(async () => {
      // Kod ve ad zorunlu — boş formda kaydet kapalı; açılış animasyonu waitFor ile beklenir
      expect(body.getByTestId('service-form-save')).toBeDisabled();
      await expect(body.getByTestId('service-category')).toBeVisible();
      await expect(body.getByTestId('service-duration')).toBeVisible();
    });
  },
};
