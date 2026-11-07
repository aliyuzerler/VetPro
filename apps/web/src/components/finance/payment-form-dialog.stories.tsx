import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { PaymentFormDialog, type PaymentFormValues } from './payment-form-dialog';
import type { FinanceChargeDto } from '@/lib/api-types';

const meta: Meta<typeof PaymentFormDialog> = {
  title: 'Faz 09/Tahsilat Diyaloğu',
  component: PaymentFormDialog,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof PaymentFormDialog>;

const CHARGES: FinanceChargeDto[] = [
  {
    id: 'ch-1',
    ownerId: 'o-1',
    owner: { id: 'o-1', firstName: 'Zeynep', lastName: 'Aksoy' },
    patientId: null,
    patientName: null,
    status: 'partial',
    total: '450.00',
    allocated: '400.00',
    balance: '50.00',
    description: 'Genel Muayene + Aşı',
    createdAt: '2026-11-01T09:00:00.000Z',
  },
  {
    id: 'ch-2',
    ownerId: 'o-1',
    owner: { id: 'o-1', firstName: 'Zeynep', lastName: 'Aksoy' },
    patientId: null,
    patientName: null,
    status: 'open',
    total: '1234.56',
    allocated: '0.00',
    balance: '1234.56',
    description: 'Diş Taşı Temizliği',
    createdAt: '2026-11-05T09:00:00.000Z',
  },
];

function Harness({ onSubmit }: { onSubmit?: (values: PaymentFormValues) => void }) {
  return (
    <PaymentFormDialog
      open
      onOpenChange={() => {}}
      charges={CHARGES}
      ownerId="o-1"
      ownerName="Zeynep Aksoy"
      onSubmit={onSubmit ?? fn()}
    />
  );
}

export const FifoOnizlemesi: Story = {
  name: 'FIFO dağıtım önizlemesi',
  render: () => <Harness />,
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByRole('heading', { name: 'Tahsilat Al' })).toBeVisible();
    });
    await userEvent.type(body.getByTestId('payment-amount'), '500');
    // FIFO: eski ücretin kalan 50'si, ardından yeni ücretten 450
    const rows = body.getByTestId('allocation-preview');
    await expect(rows).toBeVisible();
    await expect(rows).toHaveTextContent('50,00');
    await expect(rows).toHaveTextContent('450,00');
  },
};

export const IleriKredi: Story = {
  name: 'Ücretleri aşan tutar ileri kredi gösterir',
  render: () => <Harness />,
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByRole('heading', { name: 'Tahsilat Al' })).toBeVisible();
    });
    await userEvent.type(body.getByTestId('payment-amount'), '2000');
    await expect(body.getByTestId('allocation-summary')).toHaveTextContent(/İleri kredi/);
  },
};

export const GecersizTutar: Story = {
  name: 'Geçersiz tutar hata gösterir',
  render: () => <Harness />,
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByRole('heading', { name: 'Tahsilat Al' })).toBeVisible();
    });
    await userEvent.type(body.getByTestId('payment-amount'), '-5');
    await userEvent.click(body.getByTestId('payment-submit'));
    await expect(body.getByRole('alert')).toHaveTextContent(/Tutar 0,00 TL üzerinde olmalı/);
  },
};
