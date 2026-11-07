import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { VitalPanel, DiagnosisPanel, type VitalInput } from './vital-panel';
import type { EncounterVital } from '@/lib/api-types';

const meta: Meta<typeof VitalPanel> = {
  title: 'Faz 06/Vital Bulgular',
  component: VitalPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof VitalPanel>;

const ENCOUNTER_VITALS: EncounterVital[] = [
  {
    id: 'v-3',
    kind: 'temp',
    value: '39.8',
    unit: '°C',
    measuredAt: new Date('2026-11-07T09:30:00Z').toISOString(),
    note: 'Hasta bakımında',
    createdBy: { firstName: 'Ayşe', lastName: 'Demir' },
  },
  {
    id: 'v-2',
    kind: 'temp',
    value: '39.1',
    unit: '°C',
    measuredAt: new Date('2026-11-07T09:00:00Z').toISOString(),
    note: null,
    createdBy: { firstName: 'Ayşe', lastName: 'Demir' },
  },
];

const HISTORY: EncounterVital[] = [
  ...ENCOUNTER_VITALS,
  {
    id: 'v-1',
    kind: 'temp',
    value: '38.6',
    unit: '°C',
    measuredAt: new Date('2026-10-02T10:00:00Z').toISOString(),
    note: 'Önceki muayene',
    createdBy: null,
  },
];

export const BosDurum: Story = {
  name: 'Boş durum',
  args: { vitals: [], patientHistory: [], editable: true, onAdd: () => {} },
  render: (args) => <VitalPanel {...args} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('vital-empty')).toBeVisible();
    await expect(canvas.getByTestId('vital-history-empty')).toBeVisible();
  },
};

export const GecmisKorunur: Story = {
  name: 'Geçmiş ölçümler korunur (aynı bulgu ayrı satırlar)',
  args: { vitals: ENCOUNTER_VITALS, patientHistory: HISTORY, editable: true, onAdd: () => {} },
  render: (args) => <VitalPanel {...args} />,
  play: async ({ canvas }) => {
    // Kabul kriteri 2: aynı kind tüm ölçümler ayrı satırlarda — üzerine yazma yok
    const rows = canvas.getByTestId('vital-history-rows');
    expect(within(rows).getAllByRole('row').length).toBe(3);
    // Aynı ölçüm hem muayene tablosunda hem geçmiş tablosunda görünür (getAllByText)
    expect(canvas.getAllByText('39.8 °C').length).toBe(2);
    expect(canvas.getAllByText('38.6 °C').length).toBeGreaterThan(0);
  },
};

export const EklemeEtkilesimi: Story = {
  name: 'Ekleme etkileşimi (değer gir → Ekle aktifleşir)',
  args: { vitals: [], patientHistory: [], editable: true },
  render: (args) => {
    const captured: VitalInput[] = [];
    return (
      <div>
        <VitalPanel {...args} onAdd={(input) => captured.push(input)} />
        <p data-testid="captured-count">{captured.length}</p>
      </div>
    );
  },
  play: async ({ canvas }) => {
    const add = canvas.getByTestId('vital-add');
    expect(add).toBeDisabled();
    await userEvent.type(canvas.getByTestId('vital-value'), '39.2');
    expect(add).toBeEnabled();
  },
};

export const ImzaliKilitli: Story = {
  name: 'İmzalı kayıt (ekleme kapalı)',
  args: { vitals: ENCOUNTER_VITALS, patientHistory: HISTORY, editable: false },
  render: (args) => <VitalPanel {...args} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('vital-locked-note')).toBeVisible();
    expect(canvas.queryByTestId('vital-add')).toBeNull();
  },
};

/* ---------- Tanı paneli ---------- */

const diagnosisMeta: Meta<typeof DiagnosisPanel> = {
  title: 'Faz 06/Tanı Paneli',
  component: DiagnosisPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export const TaniliListe: StoryObj<typeof DiagnosisPanel> = {
  name: 'Tanı listesi ve ekleme',
  render: () => (
    <DiagnosisPanel
      diagnoses={[
        { id: 'd-1', code: 'G-01', name: 'Akut gastroenterit', kind: 'primary', note: null, createdAt: '' },
        { id: 'd-2', code: null, name: 'Diyet hassasiyeti', kind: 'differential', note: 'İzlemede', createdAt: '' },
      ]}
      editable
      onAdd={() => {}}
      onRemove={() => {}}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Akut gastroenterit')).toBeVisible();
    // 'Diferansiyel — İzlemede' tek metin düğümünde — regex ile eşleşir
    await expect(canvas.getByText(/Diferansiyel/)).toBeVisible();
    const add = canvas.getByTestId('diagnosis-add');
    expect(add).toBeDisabled();
    await userEvent.type(canvas.getByTestId('diagnosis-name'), 'Otit eksterna');
    expect(add).toBeEnabled();
  },
};

export const TanisizImzali: StoryObj<typeof DiagnosisPanel> = {
  name: 'İmzalı kayıt — tanı eklenemez',
  render: () => (
    <DiagnosisPanel
      diagnoses={[
        { id: 'd-1', code: null, name: 'Sağlıklı yetişkin', kind: 'primary', note: null, createdAt: '' },
      ]}
      editable={false}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('diagnosis-locked-note')).toBeVisible();
    expect(canvas.queryByTestId('diagnosis-add')).toBeNull();
  },
};

void diagnosisMeta;
