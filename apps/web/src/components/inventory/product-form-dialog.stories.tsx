import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  ProductFormDialog,
  type ProductFormValues,
} from './product-form-dialog';
import type { ProductCategoryDto, ProductDto, UnitDto } from '@/lib/api-types';

const meta: Meta<typeof ProductFormDialog> = {
  title: 'Faz 07/Ürün Kartı',
  component: ProductFormDialog,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof ProductFormDialog>;

const CATEGORIES: ProductCategoryDto[] = [
  { id: 'cat-1', clinicId: 'c1', name: 'İlaç', active: true },
  { id: 'cat-2', clinicId: 'c1', name: 'Aşı', active: true },
];
const UNITS: UnitDto[] = [
  { id: 'u-1', clinicId: 'c1', key: 'ml', name: 'Mililitre' },
  { id: 'u-2', clinicId: 'c1', key: 'doz', name: 'Doz' },
];

const EDITING: ProductDto = {
  id: 'p-1',
  clinicId: 'c1',
  categoryId: 'cat-1',
  category: { id: 'cat-1', name: 'İlaç' },
  code: 'UR-AMOX250',
  barcode: '8690000000018',
  name: 'Amoksisilin 250 mg/ml Enjeksiyon',
  trackingType: 'lot',
  baseUnit: { id: 'u-1', key: 'ml', name: 'Mililitre' },
  minStock: '10',
  defaultSalePrice: '45',
  notes: null,
  active: true,
  conversions: [],
};

function Harness({
  editing = null,
  onSubmit,
}: {
  editing?: ProductDto | null;
  onSubmit?: (values: ProductFormValues) => void;
}) {
  return (
    <ProductFormDialog
      open
      editing={editing}
      categories={CATEGORIES}
      units={UNITS}
      onOpenChange={() => {}}
      onSubmit={onSubmit ?? fn()}
    />
  );
}

export const BosForm: Story = {
  name: 'Boş ürün formu',
  render: () => <Harness />,
  play: async () => {
    // Radix Dialog portal'a bağlanır → sorgular document.body üzerinden yapılır
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByText('Yeni Ürün')).toBeVisible();
    });
    await expect(body.getByTestId('product-form-save')).toBeDisabled();
  },
};

export const KaydetmeEtkilesimi: Story = {
  name: 'Parti takipli ürün kaydetme etkileşimi',
  render: () => <Harness onSubmit={fn()} />,
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByTestId('product-code')).toBeVisible();
    });
    await userEvent.type(body.getByTestId('product-code'), 'UR-TEST01');
    await userEvent.type(body.getByTestId('product-name'), 'Test Enjeksiyon');
    await userEvent.click(body.getByTestId('product-unit'));
    const listbox = within(document.body).getByRole('listbox');
    await userEvent.click(within(listbox).getByText('Mililitre'));
    // Radix Select kapanışı body pointer-events'i kısa süreliğine kapatır;
    // tıklama waitFor ile yeniden denenir
    const save = body.getByTestId('product-form-save');
    await expect(save).toBeEnabled();
    await waitFor(async () => {
      await userEvent.click(save);
    });
  },
};

export const DuzenlemeKilidi: Story = {
  name: 'Düzenlemede SKU ve takip türü kilitli',
  render: () => <Harness editing={EDITING} />,
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByText('Ürünü Düzenle')).toBeVisible();
    });
    const code = body.getByTestId('product-code') as HTMLInputElement;
    await expect(code).toBeDisabled();
    await expect(body.getByTestId('product-form-save')).toBeEnabled();
  },
};

export const Mobil: Story = {
  name: 'Mobil kırılım',
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: () => <Harness />,
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByTestId('product-form-dialog')).toBeVisible();
    });
  },
};
