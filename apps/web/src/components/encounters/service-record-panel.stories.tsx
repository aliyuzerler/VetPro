import type { Meta, StoryObj } from '@storybook/nextjs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ServiceRecordPanel } from './service-record-panel';
import { ServiceFinalizeDialog } from './service-finalize-dialog';
import { ServiceReverseDialog } from './service-reverse-dialog';
import { AddendumPanel } from './addendum-panel';
import type {
  ChargeDto,
  ConsumptionPreview,
  ServiceDto,
  ServiceRecordDto,
} from '@/lib/api-types';

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
  reversedAt: null,
  reversedBy: null,
  charge: null,
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

const CHARGE: ChargeDto = {
  id: 'ch-1',
  status: 'open',
  total: '900.00',
  currency: 'TRY',
  lines: [
    {
      id: 'chl-1',
      sourceType: 'service',
      description: 'Genel Muayene',
      qty: '2',
      unitPrice: '450',
      taxAmount: '0',
      total: '900.00',
    },
  ],
};

const FINALIZED_RECORD: ServiceRecordDto = {
  ...DRAFT_RECORD,
  id: 'r-2',
  status: 'finalized',
  performedBy: { firstName: 'Ayşe', lastName: 'Demir' },
  finalizedAt: new Date('2026-11-07T10:00:00Z').toISOString(),
  charge: CHARGE,
};

const REVERSED_RECORD: ServiceRecordDto = {
  ...FINALIZED_RECORD,
  id: 'r-3',
  reversedAt: new Date('2026-11-07T11:00:00Z').toISOString(),
  reversedBy: { firstName: 'Ayşe', lastName: 'Demir' },
  charge: {
    ...CHARGE,
    status: 'void',
    total: '0.00',
    lines: [
      ...CHARGE.lines,
      {
        id: 'chl-2',
        sourceType: 'service_reversal',
        description: 'İptal — Genel Muayene',
        qty: '-2',
        unitPrice: '450',
        taxAmount: '0',
        total: '-900.00',
      },
    ],
  },
};

const PANEL_PROPS = {
  services: SERVICES,
  encounterId: 'enc-1',
  branchId: 'br-1',
  editable: true,
  onAddRecord: () => {},
  onFinalize: () => {},
  onRemoveRecord: () => {},
  onReverse: () => {},
} as const;

const serviceMeta: Meta<typeof ServiceRecordPanel> = {
  title: 'Faz 06/Hizmet Kayıtları',
  component: ServiceRecordPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default serviceMeta;

export const BosPanel: StoryObj<typeof ServiceRecordPanel> = {
  name: 'Boş panel (hizmet seçimi açık)',
  render: () => <ServiceRecordPanel records={[]} {...PANEL_PROPS} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('service-record-empty')).toBeVisible();
    const save = canvas.getByTestId('service-record-save');
    expect(save).toBeDisabled();
  },
};

export const TaslakVeKesinlesmisKayit: StoryObj<typeof ServiceRecordPanel> = {
  name: 'Taslak + kesinleşmiş kayıt (ücret rozetli)',
  render: () => (
    <ServiceRecordPanel records={[DRAFT_RECORD, FINALIZED_RECORD]} {...PANEL_PROPS} />
  ),
  play: async ({ canvas }) => {
    // İki kayıt aynı hizmeti içerir (taslak + kesinleşmiş) — getAllByText
    // Kesinleşmiş kayıtta ücret satırı da aynı adı taşır: 2 tablo + 1 satır
    expect(canvas.getAllByText(/Genel Muayene/).length).toBe(3);
    // ₺900,00: 2 tablo satırı + ücret satırı listesi = 3
    expect(canvas.getAllByText('₺900,00').length).toBe(3);
    // Yalnız taslak kayıt kesinleştirilebilir
    expect(canvas.getAllByTestId('service-record-finalize').length).toBe(1);
    // Kesinleşmiş kayıt ücret rozetini taşır (Faz 08)
    await expect(canvas.getByTestId('service-record-charge')).toBeVisible();
  },
};

export const IptalEdilmisKayit: StoryObj<typeof ServiceRecordPanel> = {
  name: 'İptal edilmiş kayıt (void ücret + negatif düzeltme satırı)',
  render: () => <ServiceRecordPanel records={[REVERSED_RECORD]} {...PANEL_PROPS} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('service-record-reversed')).toBeVisible();
    // Orijinal + reversal satırları yan yana — append-only izlenebilirlik
    // (satır metni '× adet' ile aynı span içinde: regex ile eşle)
    expect(canvas.getByText(/İptal — Genel Muayene/)).toBeVisible();
    // İptal edilmiş kayıt için reversal düğmesi tekrar gösterilmez
    expect(canvas.queryByTestId('service-record-reverse')).toBeNull();
  },
};

export const ImzaliKilitliPanel: StoryObj<typeof ServiceRecordPanel> = {
  name: 'İmzalı kayıt — hizmet eklenemez',
  render: () => (
    <ServiceRecordPanel records={[FINALIZED_RECORD]} {...PANEL_PROPS} editable={false} />
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

/* ---------- Faz 08 — Kesinleştirme diyaloğu ---------- */

const PREVIEW: ConsumptionPreview = {
  record: { id: 'r-1', status: 'draft' },
  consumptions: [
    {
      ruleId: 'rule-1',
      productId: 'p-1',
      productCode: 'UR-KUDUZ01',
      productName: 'Kuduz Aşısı (İnaktif)',
      trackingType: 'lot',
      unit: 'doz',
      qty: 1,
      required: true,
      allocationPolicy: 'nearest_expiry',
      suggestedWarehouseId: 'wh-1',
      suggestedAllocations: [{ lotId: 'lot-2', lotCode: 'R2601', qty: 1 }],
      shortfall: 0,
      warning: null,
      lots: [
        {
          lotId: 'lot-1',
          lotCode: 'Q9901',
          warehouseId: 'wh-1',
          expiresAt: '2026-01-01T00:00:00.000Z',
          qtyOnHand: 4,
          unitCost: 180,
          blockReason: 'expired',
        },
        {
          lotId: 'lot-2',
          lotCode: 'R2601',
          warehouseId: 'wh-1',
          expiresAt: '2028-06-01T00:00:00.000Z',
          qtyOnHand: 3,
          unitCost: 180,
          blockReason: null,
        },
      ],
    },
  ],
  issues: [],
  charge: {
    lines: [{ description: 'Kuduz Aşısı', qty: 1, unitPrice: 520, taxAmount: 0, total: 520 }],
    total: 520,
  },
};

/** Mock fetch — Storybook play testleri preview API'sini ağ dışında simüle eder. */
function mockPreviewFetch(): void {
  if (typeof window === 'undefined') return;
  window.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes('consumption-preview')) {
      return new Response(JSON.stringify(PREVIEW), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof window.fetch;
}

const finalizeMeta: Meta<typeof ServiceFinalizeDialog> = {
  title: 'Faz 08/Kesinleştirme Diyaloğu',
  component: ServiceFinalizeDialog,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => {
      mockPreviewFetch();
      // Preview react-query ile çekilir — Storybook sağlayıcı zinciri gerekli
      return (
        <QueryClientProvider client={new QueryClient()}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
};

void finalizeMeta;

export const KesinlestirmeOnizlemesi: StoryObj<typeof ServiceFinalizeDialog> = {
  name: 'Tüketim onayı: parti seçimi + ücret önizlemesi',
  render: () => {
    // Preview react-query ile çekilir — mock fetch + sağlayıcı render içinde
    // kurulur (bu dosyanın default meta'sı panel metası; dekoratör uygulanmaz)
    mockPreviewFetch();
    return (
      <QueryClientProvider client={new QueryClient()}>
        <ServiceFinalizeDialog
          record={DRAFT_RECORD}
          encounterId="enc-1"
          branchId="br-1"
          idempotencyKey="3f2c1a4e-0000-4000-8000-00000000f008"
          open
          onOpenChange={() => {}}
          onConfirm={() => {}}
        />
      </QueryClientProvider>
    );
  },
  play: async () => {
    // Radix Dialog portalı document.body'ye bağlanır — canvas değil body (Faz 07 deseni)
    const body = within(document.body);
    // getBy* yoklukta anında fırlatır — query çözülene kadar waitFor ile sarmala
    await waitFor(async () => {
      await expect(body.getByTestId('finalize-preview')).toBeVisible();
    }, { timeout: 15_000 });
    // Ücret önizlemesi görünür
    await expect(body.getByTestId('finalize-charge-preview')).toBeVisible();
    // Onay düğmesi etkin — plan tam karşılanıyor
    const confirm = body.getByTestId('finalize-confirm');
    await expect(confirm).toBeEnabled();
  },
};

/* ---------- Faz 08 — İptal (reversal) diyaloğu ---------- */

export const ReversalGerekcesi: StoryObj<typeof ServiceReverseDialog> = {
  name: 'İptal gerekçesi zorunlu (denetim)',
  render: () => (
    <ServiceReverseDialog
      record={FINALIZED_RECORD}
      open
      onOpenChange={() => {}}
      onConfirm={() => {}}
    />
  ),
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByTestId('reverse-dialog')).toBeVisible();
    });
    const confirm = body.getByTestId('reverse-confirm');
    await expect(confirm).toBeDisabled(); // gerekçe boş → iptal edilemez
    const reason = body.getByTestId('reverse-reason');
    await waitFor(async () => {
      await userEvent.type(reason, 'Yanlış hizmet girildi');
    });
    await expect(confirm).toBeEnabled();
  },
};

export const ReversalKisaGerekce: StoryObj<typeof ServiceReverseDialog> = {
  name: 'Kısa gerekçe reddedilir (min 3 karakter)',
  render: () => (
    <ServiceReverseDialog
      record={FINALIZED_RECORD}
      open
      onOpenChange={() => {}}
      onConfirm={() => {}}
    />
  ),
  play: async () => {
    const body = within(document.body);
    const confirm = body.getByTestId('reverse-confirm');
    await waitFor(async () => {
      await userEvent.type(body.getByTestId('reverse-reason'), 'ab');
    });
    await expect(confirm).toBeDisabled();
  },
};
