import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent } from 'storybook/test';
import { DuplicateWarning } from './duplicate-warning';
import type { OwnerDuplicateCandidate } from '@/lib/api-types';

const meta: Meta<typeof DuplicateWarning> = {
  title: 'Faz 04/Mükerrer Kayıt Uyarısı',
  component: DuplicateWarning,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof DuplicateWarning>;

const CANDIDATES: OwnerDuplicateCandidate[] = [
  {
    id: 'owner-1',
    firstName: 'Zeynep',
    lastName: 'Aksoy',
    reasons: ['phone', 'name'],
    primaryContact: { kind: 'phone', value: '+90 532 111 22 33' },
  },
  {
    id: 'owner-2',
    firstName: 'Zeynep',
    lastName: 'Aksoy Kaya',
    reasons: ['name'],
    primaryContact: null,
  },
];

export const Uyari: Story = {
  name: 'Telefon + ad eşleşmesi',
  args: {
    candidates: CANDIDATES,
    onProceed: fn(),
    onCancel: fn(),
  },
};

export const EtkilesimYineDeKaydet: Story = {
  name: 'Etkileşim: yine de kaydet',
  args: {
    candidates: CANDIDATES,
    onProceed: fn(),
    onCancel: fn(),
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByTestId('duplicate-warning')).toBeVisible();
    await expect(canvas.getByText('Aynı telefon')).toBeVisible();
    await userEvent.click(canvas.getByTestId('duplicate-proceed'));
    await expect(args.onProceed).toHaveBeenCalledTimes(1);
    await expect(args.onCancel).not.toHaveBeenCalled();
  },
};

export const EtkilesimVazgec: Story = {
  name: 'Etkileşim: vazgeç',
  args: {
    candidates: CANDIDATES.slice(0, 1),
    onProceed: fn(),
    onCancel: fn(),
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Vazgeç' }));
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
    await expect(args.onProceed).not.toHaveBeenCalled();
  },
};
