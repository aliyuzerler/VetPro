import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  CashRegisterCards,
  CashSessionCloseDialog,
  CashSessionLivePanel,
} from './cash-session-panel';
import type { CashRegisterDto, CashSessionDetailDto } from '@/lib/api-types';

const meta: Meta<typeof CashSessionCloseDialog> = {
  title: 'Faz 09/Kasa Oturumu',
  component: CashSessionCloseDialog,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof CashSessionCloseDialog>;

const SESSION: CashSessionDetailDto = {
  id: 'cs-1',
  status: 'open',
  register: { id: 'cr-1', name: 'Merkez Kasa 1' },
  branchId: 'b-1',
  openingFloat: '500.00',
  countedTotal: null,
  expectedTotal: null,
  difference: null,
  differenceNote: null,
  openedBy: { firstName: 'Deniz', lastName: 'Yıldız' },
  openedAt: '2026-11-08T08:00:00.000Z',
  closedAt: null,
  live: { expected: '950.00', cashIn: '450.00', cashOut: '0.00' },
  movements: [
    {
      id: 'm-1',
      direction: 'in',
      amount: '450.00',
      sourceType: 'payment',
      sourceId: 'p-1',
      reason: 'Tahsilat (cash)',
      createdAt: '2026-11-08T10:00:00.000Z',
    },
  ],
};

const REGISTERS: CashRegisterDto[] = [
  {
    id: 'cr-1',
    name: 'Merkez Kasa 1',
    branch: { id: 'b-1', name: 'Merkez Şube' },
    active: true,
    openSession: { id: 'cs-1', openingFloat: '500.00', expected: '950.00', openedAt: '2026-11-08T08:00:00.000Z' },
  },
  {
    id: 'cr-2',
    name: 'Şube Kasa 1',
    branch: { id: 'b-2', name: 'İkinci Şube' },
    active: true,
    openSession: null,
  },
];

export const FarkOnizlemesi: Story = {
  name: 'Kapanış farkı önizlemesi — açıklama zorunlu',
  render: () => (
    <CashSessionCloseDialog
      open
      onOpenChange={() => {}}
      session={SESSION}
      onSubmit={fn()}
    />
  ),
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByRole('heading', { name: 'Kasa Kapat' })).toBeVisible();
    });
    await userEvent.type(body.getByTestId('counted-total'), '940');
    await expect(body.getByTestId('difference-preview')).toHaveTextContent('-10,00');
    await userEvent.click(body.getByTestId('close-session-submit'));
    await expect(body.getByRole('alert')).toHaveTextContent(/Fark açıklaması zorunlu/);
  },
};

export const TamSayim: Story = {
  name: 'Sayım beklenenle eşit — fark sıfır',
  render: () => (
    <CashSessionCloseDialog
      open
      onOpenChange={() => {}}
      session={SESSION}
      onSubmit={fn()}
    />
  ),
  play: async () => {
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByRole('heading', { name: 'Kasa Kapat' })).toBeVisible();
    });
    await userEvent.type(body.getByTestId('counted-total'), '950');
    await expect(body.getByTestId('difference-preview')).toHaveTextContent('kasa tam');
  },
};

export const CanliPanel: Story = {
  name: 'Canlı kasa paneli',
  render: () => <CashSessionLivePanel session={SESSION} />,
  play: async () => {
    const body = within(document.body);
    await expect(body.getByTestId('cash-live-panel')).toHaveTextContent('950,00');
  },
};

export const KasaKartlari: Story = {
  name: 'Kasa kartları — açık/kapalı rozetleri',
  render: () => <CashRegisterCards registers={REGISTERS} selectedId="cr-1" onSelect={() => {}} />,
  play: async () => {
    const body = within(document.body);
    await expect(body.getByTestId('register-cards')).toHaveTextContent('Açık');
    await expect(body.getByTestId('register-cards')).toHaveTextContent('Kapalı');
  },
};
