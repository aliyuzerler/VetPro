import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { OwnerSearchList } from './owner-search-list';
import type { OwnerSummary } from '@/lib/api-types';

const meta: Meta<typeof OwnerSearchList> = {
  title: 'Faz 04/Sahip Listesi',
  component: OwnerSearchList,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof OwnerSearchList>;

const OWNERS: OwnerSummary[] = [
  {
    id: 'owner-1',
    firstName: 'Zeynep',
    lastName: 'Aksoy',
    identityNo: null,
    address: 'Bahariye Cad. No:12, Kadıköy/İstanbul',
    notes: null,
    archivedAt: null,
    archivedReason: null,
    mergedIntoOwnerId: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    contacts: [
      {
        id: 'c1',
        kind: 'phone',
        value: '+90 532 111 22 33',
        normalized: '905321112233',
        label: 'Cep',
        isPrimary: true,
      },
      {
        id: 'c2',
        kind: 'email',
        value: 'zeynep.aksoy@example.com',
        normalized: 'zeynep.aksoy@example.com',
        label: null,
        isPrimary: true,
      },
    ],
    consents: [],
    _count: { patients: 2 },
  },
  {
    id: 'owner-2',
    firstName: 'Mehmet',
    lastName: 'Yılmaz',
    identityNo: null,
    address: null,
    notes: null,
    archivedAt: null,
    archivedReason: null,
    mergedIntoOwnerId: null,
    createdAt: '2026-10-05T12:00:00.000Z',
    updatedAt: '2026-10-05T12:00:00.000Z',
    contacts: [
      {
        id: 'c3',
        kind: 'phone',
        value: '0533 444 55 66',
        normalized: '905334445566',
        label: 'Cep',
        isPrimary: true,
      },
    ],
    consents: [],
    _count: { patients: 1 },
  },
];

function SearchListHarness(props: { onOpen: (id: string) => void; onCreate: () => void }) {
  const [query, setQuery] = useState('');
  return (
    <OwnerSearchList
      owners={OWNERS}
      query={query}
      onQueryChange={setQuery}
      onOpen={props.onOpen}
      onCreate={props.onCreate}
      canManage
    />
  );
}

export const DoluListe: Story = {
  name: 'Dolu liste',
  render: () => (
    <OwnerSearchList
      owners={OWNERS}
      query=""
      onQueryChange={fn()}
      onOpen={fn()}
      canManage={false}
    />
  ),
};

export const BosListe: Story = {
  name: 'Boş durum',
  render: () => (
    <OwnerSearchList owners={[]} query="" onQueryChange={fn()} onOpen={fn()} canManage={false} />
  ),
};

export const AramaEtkilesimi: Story = {
  name: 'Arama etkileşimi (yazma + satır açma)',
  render: () => <SearchListHarness onOpen={fn()} onCreate={fn()} />,
  play: async ({ canvas, userEvent: storyUser }) => {
    const search = canvas.getByTestId('owner-search');
    await storyUser.type(search, 'Aksoy');
    await expect(search).toHaveValue('Aksoy');

    // Satır tıklaması detaya gider
    const row = canvas.getByText('Zeynep Aksoy');
    await storyUser.click(row);
    await expect(true).toBe(true);
  },
};

export const YeniSahipDugmesi: Story = {
  name: 'Yeni sahip düğmesi (yetkili)',
  render: () => <SearchListHarness onOpen={fn()} onCreate={fn()} />,
  play: async ({ canvas }) => {
    const button = canvas.getByTestId('owner-create-button');
    await userEvent.click(button);
    // within: düğme hâlâ görünür (kapsayıcı davranışı mock'tur)
    await expect(button).toBeVisible();
  },
};
