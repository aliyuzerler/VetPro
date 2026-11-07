import type { Meta, StoryObj } from '@storybook/nextjs';
import { ProtocolTable } from './protocol-table';
import type { VaccineProtocolDto } from '@/lib/api-types';

const meta: Meta<typeof ProtocolTable> = {
  title: 'Faz 10/Aşı Protokol Tablosu',
  component: ProtocolTable,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof ProtocolTable>;

const PROTOCOLS: VaccineProtocolDto[] = [
  {
    id: 'p1',
    name: 'Köpek Yıllık Karma',
    firstDoseAgeDays: 60,
    boosterIntervalDays: 365,
    reminderLeadDays: 14,
    doseLabel: '1 ml',
    route: 'deri_alti',
    notes: null,
    active: true,
    product: { id: 'pr1', code: 'UR-KUDUZ01', name: 'Kuduz Aşısı' },
    species: { id: 's2', key: 'dog', name: 'Köpek' },
  },
  {
    id: 'p2',
    name: 'Kedi Üçlü Karma',
    firstDoseAgeDays: 45,
    boosterIntervalDays: 180,
    reminderLeadDays: 10,
    doseLabel: '0.5 ml',
    route: 'deri_alti',
    notes: null,
    active: true,
    product: { id: 'pr2', code: 'UR-FELV', name: 'FeLV Aşısı' },
    species: { id: 's1', key: 'cat', name: 'Kedi' },
  },
  {
    id: 'p3',
    name: 'Eski Protokol (pasif)',
    firstDoseAgeDays: 90,
    boosterIntervalDays: 730,
    reminderLeadDays: 30,
    doseLabel: null,
    route: null,
    notes: null,
    active: false,
    product: { id: 'pr3', code: 'UR-ESKI', name: 'Eski Aşı' },
    species: null,
  },
];

/** Kliniğin kendi protokolleri — takvim bu satırlardan türetilir. */
export const Protokoller: Story = {
  name: 'Klinik protokol listesi',
  render: () => <ProtocolTable protocols={PROTOCOLS} />,
};

/** Protokol tanımlanmamış klinik görümü. */
export const Bos: Story = {
  name: 'Protokol yok (boş durum)',
  render: () => <ProtocolTable protocols={[]} />,
};
