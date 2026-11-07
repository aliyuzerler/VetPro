import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DoseHelperCard } from './dose-helper-card';
import type { DoseHelperResultDto } from '@/lib/api-types';

const meta: Meta<typeof DoseHelperCard> = {
  title: 'Faz 10/Doz Yardımcısı Kartı',
  component: DoseHelperCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof DoseHelperCard>;

const preview = fn(async (input: {
  weightKg: number;
  mgPerKg: number;
}): Promise<DoseHelperResultDto> => ({
  formula: `${input.weightKg} kg × ${input.mgPerKg} mg/kg`,
  singleDose: input.weightKg * input.mgPerKg,
  doseUnit: 'mg',
  dailyDose: null,
  courseTotal: null,
  inputs: { weightKg: input.weightKg, mgPerKg: input.mgPerKg, frequencyPerDay: null, durationDays: null },
}));

/** Veteriner görümü — onay butonu görünür (prescription.sign izni). */
export const VeterinerOnayli: Story = {
  name: 'Veteriner onay yetkili',
  args: { onPreview: preview, onApprove: fn(async () => undefined), canApprove: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByTestId('dose-helper-weight'), '20');
    await userEvent.type(canvas.getByTestId('dose-helper-mgkg'), '10');
    await userEvent.click(canvas.getByTestId('dose-helper-hesapla'));
    await expect(canvas.getByTestId('dose-helper-formul')).toHaveTextContent(
      '20 kg × 10 mg/kg = 200 mg',
    );
    await expect(canvas.getByTestId('dose-helper-onayla')).toBeVisible();
  },
};

/** Kısıtlı personel görünümü — onay yalnızca veterinerde olduğu bilinir. */
export const OnayYetkisiz: Story = {
  name: 'Onay yetkisi olmayan personel',
  args: { onPreview: preview, onApprove: fn(async () => undefined), canApprove: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByTestId('dose-helper-weight'), '4');
    await userEvent.type(canvas.getByTestId('dose-helper-mgkg'), '2.5');
    await userEvent.click(canvas.getByTestId('dose-helper-hesapla'));
    await expect(canvas.getByTestId('dose-helper-sonuc')).toBeVisible();
    await expect(canvas.queryByTestId('dose-helper-onayla')).toBeNull();
    await expect(canvas.getByText(/Onay yalnızca reçete imza yetkisi olan veteriner/)).toBeVisible();
  },
};
