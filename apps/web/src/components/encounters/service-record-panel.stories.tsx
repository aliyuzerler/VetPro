import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { ServiceRecordPanel } from './service-record-panel';
import { AddendumPanel } from './addendum-panel';
import type { ServiceDto, ServiceRecordDto } from '@/lib/api-types';

const SERVICES: ServiceDto[] = [
  {
    id: 's-1',
    clinicId: 'c-1',
    code: 'HIZ-001',
    name: 'Genel Muayene',
    category: 'muayene',
    durationMin: 20,
    notes: null,
    active: true,
    prices: [],
    consumptionRules: [],
  },
  {
    id: 's-2',
    clinicId: 'c-1',
    code: 'HIZ-002',
    name: 'Kuduz Aşısı',
    category: 'aşılama',
    durationMin: 15,
    notes: null,
    active: true,
    prices: [],
    consumptionRules: [],
  },
];

const DRAFT_RECORD: ServiceRecordDto = {
  id: 'r-1',
  status: 'draft',
  performedBy: null,
  finalizedAt: null,
  createdAt: new Date('2026-11-07T09:00:00Z').toISOString(),
  lines: [
    {
      id: 'l-1',
      qty: '2',
      unitPrice: '450',
      discount: '0',
      tax: '0',
      lineTotal: '900',
      service: { id: 's-1', code: 'HIZ-001', name: 'Genel Muayene', category: 'muayene' },
    },
  ],
};

const FINALIZED_RECORD: ServiceRecordDto = {
  ...DRAFT_RECORD,
  id: 'r-2',
  status: 'finalized',
  performedBy: { firstName: 'Ayşe', lastName: 'Demir' },
  finalizedAt: new Date('2026-11-07T10:00:00Z').toISOString(),
};

const serviceMeta: Meta<typeof ServiceRecordPanel> = {
  title: 'Faz 06/Hizmet Kaydı Paneli',
  component: ServiceRecordPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default serviceMeta;

export const BosPanel: StoryObj<typeof ServiceRecordPanel> = {
  name: 'Boş panel (hizmet seçimi açık)',
  render: () => (
    <ServiceRecordPanel
      records={[]}
      services={SERVICES}
      editable
      onAddRecord={() => {}}
      onFinalize={() => {}}
      onRemoveRecord={() => {}}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('service-record-empty')).toBeVisible();
    const save = canvas.getByTestId('service-record-save');
    expect(save).toBeDisabled();
  },
};

export const TaslakVeKesinlesmisKayit: StoryObj<typeof ServiceRecordPanel> = {
  name: 'Taslak + kesinleşmiş kayıt (fiyat çözümlü satırlar)',
  render: () => (
    <ServiceRecordPanel
      records={[DRAFT_RECORD, FINALIZED_RECORD]}
      services={SERVICES}
      editable
      onAddRecord={() => {}}
      onFinalize={() => {}}
      onRemoveRecord={() => {}}
    />
  ),
  play: async ({ canvas }) => {
    // İki kayıt aynı hizmeti içerir (taslak + kesinleşmiş) — getAllByText
    expect(canvas.getAllByText('Genel Muayene').length).toBe(2);
    expect(canvas.getAllByText('₺900,00').length).toBe(2);
    // Yalnız taslak kayıt kesinleştirilebilir
    expect(canvas.getAllByTestId('service-record-finalize').length).toBe(1);
  },
};

export const ImzaliKilitliPanel: StoryObj<typeof ServiceRecordPanel> = {
  name: 'İmzalı kayıt — hizmet eklenemez',
  render: () => (
    <ServiceRecordPanel
      records={[FINALIZED_RECORD]}
      services={SERVICES}
      editable={false}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('service-record-locked-note')).toBeVisible();
    expect(canvas.queryByTestId('service-record-save')).toBeNull();
  },
};

/* ---------- Addendum paneli ---------- */

const addendumMeta: Meta<typeof AddendumPanel> = {
  title: 'Faz 06/Addendum Paneli',
  component: AddendumPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export const ImzaliKaydaAddendum: StoryObj<typeof AddendumPanel> = {
  name: 'İmzalı kayda addendum ekleme',
  render: () => (
    <AddendumPanel
      addendums={[
        {
          id: 'a-1',
          body: 'Sahip telefonla arandı: kusma dün öğleden sonra başladı — anamnez güncellendi.',
          createdAt: new Date('2026-11-07T11:00:00Z').toISOString(),
          author: { id: 'st-1', firstName: 'Ayşe', lastName: 'Demir', title: 'Veteriner Hekim' },
        },
      ]}
      canAdd
      onAdd={() => {}}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('addendum-body')).toBeVisible();
    // Kabul kriteri 5: addendum orijinal kayda referanslı; yazar ve zaman görünür
    await expect(canvas.getByText(/Ayşe Demir/)).toBeVisible();
    const save = canvas.getByTestId('addendum-save');
    expect(save).toBeDisabled();
  },
};

export const TaslaktaAddendumYok: StoryObj<typeof AddendumPanel> = {
  name: 'İmzasız kayıt — addendum alanı görünmez',
  render: () => <AddendumPanel addendums={[]} canAdd={false} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('addendum-empty')).toBeVisible();
    expect(canvas.queryByTestId('addendum-body')).toBeNull();
  },
};

void addendumMeta;
