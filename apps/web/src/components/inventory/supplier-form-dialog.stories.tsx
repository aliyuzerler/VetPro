import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  SupplierFormDialog,
  type SupplierFormValues,
} from './supplier-form-dialog';
import type { SupplierDto } from '@/lib/api-types';

const meta: Meta<typeof SupplierFormDialog> = {
  title: 'Faz 07/Tedarikçi Kartı',
  component: SupplierFormDialog,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof SupplierFormDialog>;

const EDITING: SupplierDto = {
  id: 's-1',
  clinicId: 'c1',
  name: 'VetPharm Dağıtım A.Ş.',
  taxNumber: '1234567801',
  phone: '+90 212 555 10 10',
  email: 'siparis@vetpharm-demo.example',
  notes: 'İlaç ve aşı tedariki',
  active: true,
};

function Harness({
  editing = null,
  onSubmit,
}: {
  editing?: SupplierDto | null;
  onSubmit?: (values: SupplierFormValues) => void;
}) {
  return (
    <SupplierFormDialog
      open
      editing={editing}
      onOpenChange={() => {}}
      onSubmit={onSubmit ?? fn()}
    />
  );
}

export const BosForm: Story = {
  name: 'Boş tedarikçi formu',
  render: () => <Harness />,
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByText('Yeni Tedarikçi')).toBeVisible();
    });
    await expect(body.getByTestId('supplier-form-save')).toBeDisabled();
  },
};

export const KaydetmeEtkilesimi: Story = {
  name: 'Kaydetme etkileşimi',
  render: () => <Harness onSubmit={fn()} />,
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByTestId('supplier-name')).toBeVisible();
    });
    await userEvent.type(body.getByTestId('supplier-name'), 'Anadolu Veteriner Malzemeleri Ltd.');
    const save = body.getByTestId('supplier-form-save');
    await expect(save).toBeEnabled();
    await userEvent.click(save);
  },
};

export const Duzenleme: Story = {
  name: 'Mevcut tedarikçi düzenleme',
  render: () => <Harness editing={EDITING} />,
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByText('Tedarikçiyi Düzenle')).toBeVisible();
    });
    const name = body.getByTestId('supplier-name') as HTMLInputElement;
    await expect(name).toHaveValue('VetPharm Dağıtım A.Ş.');
  },
};
