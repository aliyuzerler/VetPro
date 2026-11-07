import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { useState } from 'react';
import { PatientSearchList } from './patient-search-list';
import type { PatientSummary, SpeciesOption } from '@/lib/api-types';

const meta: Meta<typeof PatientSearchList> = {
  title: 'Faz 04/Hasta Listesi',
  component: PatientSearchList,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof PatientSearchList>;

const SPECIES: SpeciesOption[] = [
  { id: 'species-cat', key: 'cat', name: 'Kedi', breeds: [{ id: 'b1', name: 'Tekir' }] },
  { id: 'species-dog', key: 'dog', name: 'Köpek', breeds: [{ id: 'b2', name: 'Kangal' }] },
];

const PATIENTS: PatientSummary[] = [
  {
    id: 'patient-1',
    code: 'HP-0001',
    name: 'Pamuk',
    microchip: '985101000000001',
    gender: 'female',
    birthDate: '2022-04-10',
    neutered: true,
    color: 'Gri tekir',
    bloodType: null,
    archivedAt: null,
    archivedReason: null,
    mergedIntoPatientId: null,
    species: { id: 'species-cat', name: 'Kedi' },
    breed: { id: 'b1', name: 'Tekir' },
    owner: { id: 'owner-1', firstName: 'Zeynep', lastName: 'Aksoy' },
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
    _count: { files: 2 },
  },
  {
    id: 'patient-2',
    code: 'HP-0003',
    name: 'Duman',
    microchip: '985101000000003',
    gender: 'male',
    birthDate: '2021-08-21',
    neutered: false,
    color: null,
    bloodType: null,
    archivedAt: null,
    archivedReason: null,
    mergedIntoPatientId: null,
    species: { id: 'species-cat', name: 'Kedi' },
    breed: { id: 'b3', name: 'British Shorthair' },
    owner: { id: 'owner-2', firstName: 'Mehmet', lastName: 'Yılmaz' },
    alerts: [
      {
        id: 'a2',
        kind: 'allergy',
        label: 'Kuduz aşısı sonrası reaksiyon',
        severity: 'high',
        active: true,
        resolvedAt: null,
        createdAt: '2026-10-05T09:00:00.000Z',
      },
    ],
    _count: { files: 0 },
  },
];

function PatientListHarness() {
  const [query, setQuery] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('all');
  const filtered =
    speciesFilter === 'all'
      ? PATIENTS
      : PATIENTS.filter((patient) => patient.species.id === speciesFilter);
  return (
    <PatientSearchList
      patients={filtered}
      query={query}
      onQueryChange={setQuery}
      species={SPECIES}
      speciesFilter={speciesFilter}
      onSpeciesFilterChange={setSpeciesFilter}
      onOpen={fn()}
    />
  );
}

export const DoluListe: Story = {
  name: 'Dolu liste + uyarı rozetleri',
  render: () => <PatientListHarness />,
  play: async ({ canvas }) => {
    // Kabul kriteri: alerji/kronik uyarıları listede görünür
    await expect(canvas.getByText('Kronik böbrek yetmezliği')).toBeVisible();
    await expect(canvas.getByText('Kuduz aşısı sonrası reaksiyon')).toBeVisible();
  },
};

export const BosListe: Story = {
  name: 'Boş durum',
  render: () => (
    <PatientSearchList
      patients={[]}
      query=""
      onQueryChange={fn()}
      species={SPECIES}
      speciesFilter="all"
      onSpeciesFilterChange={fn()}
      onOpen={fn()}
    />
  ),
};

export const TurFiltresiEtkilesimi: Story = {
  name: 'Etkileşim: tür filtresi',
  render: () => <PatientListHarness />,
  play: async ({ canvas, userEvent: storyUser }) => {
    // Başlangıçta iki hasta
    await expect(canvas.getByText('Pamuk')).toBeVisible();
    await expect(canvas.getByText('Duman')).toBeVisible();

    // Köpek filtresi → boş durum (Select içeriği portal'da aranır)
    const body = within(document.body);
    await storyUser.click(canvas.getByTestId('species-filter'));
    const option = await body.findByRole('option', { name: 'Köpek' });
    await storyUser.click(option);
    await expect(canvas.getByText('Hasta bulunamadı')).toBeVisible();

    // Menü tamamen kapanmadan axe koşarsa aria-hidden-focus yanlış pozitif
    // verir; popper portal'ının DOM'dan çıkması beklenir.
    await waitFor(() => {
      expect(document.querySelector('[data-radix-popper-content-wrapper]')).toBeNull();
    });
  },
};
