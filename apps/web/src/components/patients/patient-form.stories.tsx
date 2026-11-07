import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { useState } from 'react';
import {
  EMPTY_PATIENT_FORM,
  PatientFormDialog,
  type PatientFormValues,
} from './patient-form-dialog';
import { OwnerPatientsTable } from '@/components/owners/owner-patients-table';
import type { OwnerPatient, SpeciesOption } from '@/lib/api-types';

const meta: Meta<typeof OwnerPatientsTable> = {
  title: 'Faz 04/Sahip Hasta Tablosu ve Form',
  component: OwnerPatientsTable,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof OwnerPatientsTable>;

const PATIENTS: OwnerPatient[] = [
  {
    id: 'patient-1',
    code: 'HP-0001',
    name: 'Pamuk',
    species: { id: 'species-cat', name: 'Kedi' },
    breed: { id: 'b1', name: 'Tekir' },
    gender: 'female',
    birthDate: '2022-04-10',
    archivedAt: null,
    alerts: [
      {
        id: 'a1',
        kind: 'chronic',
        label: 'Kronik böbrek yetmezliği',
        severity: 'medium',
        active: true,
        resolvedAt: null,
        createdAt: '2026-08-15T09:00:00.000Z',
      },
    ],
  },
  {
    id: 'patient-2',
    code: 'HP-0002',
    name: 'Karabaş',
    species: { id: 'species-dog', name: 'Köpek' },
    breed: { id: 'b2', name: 'Kangal' },
    gender: 'male',
    birthDate: '2020-01-15',
    archivedAt: null,
    alerts: [],
  },
];

export const SahipHastaTablosu: Story = {
  name: 'Sahip detayı — çoklu hasta tablosu',
  args: {
    ownerId: 'owner-1',
    patients: PATIENTS,
    canManage: false,
  },
};

export const BosTablo: Story = {
  name: 'Hastasız sahip',
  args: {
    ownerId: 'owner-1',
    patients: [],
    canManage: false,
  },
};

/* ---------- Hasta formu ---------- */

const SPECIES: SpeciesOption[] = [
  {
    id: 'species-cat',
    key: 'cat',
    name: 'Kedi',
    breeds: [
      { id: 'b1', name: 'Tekir' },
      { id: 'b1b', name: 'British Shorthair' },
    ],
  },
  { id: 'species-dog', key: 'dog', name: 'Köpek', breeds: [{ id: 'b2', name: 'Kangal' }] },
  { id: 'species-bird', key: 'bird', name: 'Kuş', breeds: [{ id: 'b3', name: 'Muhabbet Kuşu' }] },
];

function PatientFormHarness(props: { onSubmit: (values: PatientFormValues) => void }) {
  const [open, setOpen] = useState(true);
  const [values, setValues] = useState<PatientFormValues>({
    ...EMPTY_PATIENT_FORM,
    name: 'Fındık',
  });
  return (
    <PatientFormDialog
      open={open}
      onOpenChange={setOpen}
      ownerName="Zeynep Aksoy"
      branchName="Merkez Şube"
      species={SPECIES}
      values={values}
      onValuesChange={setValues}
      onSubmit={props.onSubmit}
    />
  );
}

const onSubmitMock = fn();

export const HastaFormuEtkilesimi: Story = {
  name: 'Etkileşim: hasta formu doldurma',
  render: () => <PatientFormHarness onSubmit={onSubmitMock} />,
  play: async ({ canvasElement, userEvent: storyUser }) => {
    // Dialog ve Select içerikleri Radix portal'ına (document.body) taşınır; orada aranır.
    // Select seçenekleri klavyeyle seçilir (portal dışı pointer-down'ın dialog'ı
    // kapatması test ortamında görüldü; gerçek kullanım E2E ile doğrulanır).
    const body = within(document.body);
    // Ad önceden dolu; tür seç (Kedi, Köpek, Kuş — ikinci öğe)
    await storyUser.click(body.getByTestId('patient-species'));
    await waitFor(async () => {
      await expect(body.getByRole('option', { name: 'Köpek' })).toBeVisible();
    });
    await storyUser.keyboard('{ArrowDown}{Enter}');
    // Menü kapanana dek bekle (katman pointer-events kilidini bırakır)
    await waitFor(() => {
      expect(document.querySelector('[data-radix-popper-content-wrapper]')).toBeNull();
    });
    // Irk seç (Belirtilmedi, Kangal — ikinci öğe)
    await storyUser.click(body.getByTestId('patient-breed'));
    await waitFor(async () => {
      await expect(body.getByRole('option', { name: 'Kangal' })).toBeVisible();
    });
    await storyUser.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => {
      expect(document.querySelector('[data-radix-popper-content-wrapper]')).toBeNull();
    });
    // Mikroçip gir
    await storyUser.type(body.getByLabelText('Mikroçip (opsiyonel)'), '985199900000009');
    // Gönder
    await storyUser.click(body.getByTestId('patient-form-submit'));
    await expect(onSubmitMock).toHaveBeenCalledTimes(1);
    const submitted = onSubmitMock.mock.calls[0]?.[0] as PatientFormValues;
    await expect(submitted.speciesId).toBe('species-dog');
    await expect(submitted.breedId).toBe('b2');
    void canvasElement;
  },
};
