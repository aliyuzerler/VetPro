import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test';
import { ReceiptDialog, type ReceiptFormValues } from './receipt-dialog';
import type { ProductDto, SupplierDto } from '@/lib/api-types';

const meta: Meta<typeof ReceiptDialog> = {
  title: 'Faz 07/Mal Kabul',
  component: ReceiptDialog,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof ReceiptDialog>;

const WAREHOUSES = [
  { id: 'wh-1', name: 'Merkez Ana Depo', branchName: 'Merkez' },
  { id: 'wh-2', name: 'Şube Deposu', branchName: 'Şube 2' },
];
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
  {
    id: 'p-2',
    clinicId: 'c1',
    categoryId: null,
    category: null,
    code: 'UR-ELDIVEN',
    barcode: null,
    name: 'Muayene Eldiveni (100lü kutu)',
    trackingType: 'none',
    baseUnit: { id: 'u-2', key: 'kutu', name: 'Kutu' },
    minStock: '4',
    defaultSalePrice: null,
    notes: null,
    active: true,
    conversions: [],
  },
];
const SUPPLIERS: SupplierDto[] = [
  { id: 's-1', clinicId: 'c1', name: 'VetPharm Dağıtım A.Ş.', taxNumber: null, phone: null, email: null, notes: null, active: true },
];

function Harness({ onSubmit }: { onSubmit?: (values: ReceiptFormValues) => void }) {
  return (
    <ReceiptDialog
      open
      warehouses={WAREHOUSES}
      products={PRODUCTS}
      suppliers={SUPPLIERS}
      onOpenChange={() => {}}
      onSubmit={onSubmit ?? fn()}
    />
  );
}

export const BosDiyalog: Story = {
  name: 'Boş mal kabul diyaloğu',
  render: () => <Harness />,
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByRole('heading', { name: 'Mal Kabul' })).toBeVisible();
    });
    await expect(body.getByTestId('receipt-save')).toBeDisabled();
  },
};

export const PartisizKabulEtkilesimi: Story = {
  name: 'Partisiz ürün kabul etkileşimi',
  render: () => <Harness onSubmit={fn()} />,
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByTestId('receipt-warehouse')).toBeVisible();
    });
    await userEvent.click(body.getByTestId('receipt-warehouse'));
    let listbox = within(document.body).getByRole('listbox');
    await userEvent.click(within(listbox).getByText(/Merkez Ana Depo/));
    // Select kapanışı body pointer-events'i kısa süreliğine kapatır — waitFor ile yeniden dene
    await waitFor(async () => {
      await userEvent.click(body.getByTestId('receipt-product-0'));
    });
    listbox = within(document.body).getByRole('listbox');
    await userEvent.click(within(listbox).getByText(/UR-ELDIVEN/));
    // Select kapanışı sonrası pointer-events dalgalanması olabilir;
    //InputChange olayı işaretçi denetimi gerektirmez
    await waitFor(async () => {
      fireEvent.change(body.getByTestId('receipt-qty-0'), { target: { value: '5' } });
      await expect(body.getByTestId('receipt-qty-0')).toHaveValue(5);
    });
    // Radix Select kapanışı body pointer-events'i kısa süreliğine kapatır;
    // tıklama waitFor ile yeniden denenir
    const save = body.getByTestId('receipt-save');
    await expect(save).toBeEnabled();
    await waitFor(async () => {
      await userEvent.click(save);
    });
  },
};

export const PartiAlanlariGorunur: Story = {
  name: 'Parti takipli üründe lot/SKT alanları',
  render: () => <Harness />,
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByTestId('receipt-warehouse')).toBeVisible();
    });
    await userEvent.click(body.getByTestId('receipt-warehouse'));
    let listbox = within(document.body).getByRole('listbox');
    await userEvent.click(within(listbox).getByText(/Merkez Ana Depo/));
    // Select kapanışı body pointer-events'i kısa süreliğine kapatır — waitFor ile yeniden dene
    await waitFor(async () => {
      await userEvent.click(body.getByTestId('receipt-product-0'));
    });
    listbox = within(document.body).getByRole('listbox');
    await userEvent.click(within(listbox).getByText(/UR-AMOX250/));
    // Parti takipli üründe lot kodu + son kullanma alanları açılır
    await new Promise((resolve) => setTimeout(resolve, 200));
    await expect(body.getByTestId('receipt-lot-0')).toBeVisible();
    await expect(body.getByTestId('receipt-expiry-0')).toBeVisible();
    // Lot kodu girilmeden kayıt aktifleşmez
    await expect(body.getByTestId('receipt-save')).toBeDisabled();
  },
};
