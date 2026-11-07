import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ExpenseFormDialog, type ExpenseFormValues } from './expense-form-dialog';

const meta: Meta<typeof ExpenseFormDialog> = {
  title: 'Faz 09/Gider Diyaloğu',
  component: ExpenseFormDialog,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof ExpenseFormDialog>;

function Harness({ onSubmit }: { onSubmit?: (values: ExpenseFormValues) => void }) {
  return (
    <ExpenseFormDialog
      open
      onOpenChange={() => {}}
      openSessions={[{ id: 'cs-1', label: 'Merkez Kasa 1 — beklenen 950,00 ₺' }]}
      vendors={[{ id: 's-1', name: 'VetPharm Dağıtım A.Ş.' }]}
      onSubmit={onSubmit ?? fn()}
    />
  );
}

export const NakitOturumSecimi: Story = {
  name: 'Nakit gider kasa oturumu ister',
  render: () => <Harness />,
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByRole('heading', { name: 'Gider Ekle' })).toBeVisible();
    });
    await userEvent.type(body.getByTestId('expense-amount'), '120');
    await userEvent.type(body.getByTestId('expense-description'), 'Ara fatura ödemesi');
    await userEvent.click(body.getByTestId('expense-submit'));
    // Varsayılan kart yöntemi → doğrudan kaydeder; diyaloğu story kapatmaz
    await expect(body.getByTestId('expense-description')).toHaveValue('Ara fatura ödemesi');
  },
};

export const GecersizAlanlar: Story = {
  name: 'Boş alanlar hata gösterir',
  render: () => <Harness />,
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByRole('heading', { name: 'Gider Ekle' })).toBeVisible();
    });
    await userEvent.click(body.getByTestId('expense-submit'));
    await expect(body.getByRole('alert')).toHaveTextContent(/Tutar 0,00 TL üzerinde olmalı/);
  },
};
