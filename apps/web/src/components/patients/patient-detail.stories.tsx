import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent } from 'storybook/test';
import { TimelineFeed } from './timeline-feed';
import { WeightHistory } from './weight-history';
import { PatientFiles } from './patient-files';
import type { FileAssetMeta, TimelineEvent, WeightObservation } from '@/lib/api-types';

const meta: Meta<typeof TimelineFeed> = {
  title: 'Faz 04/Hasta Zaman Çizelgesi',
  component: TimelineFeed,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof TimelineFeed>;

const EVENTS: TimelineEvent[] = [
  {
    id: 'e1',
    type: 'weight',
    title: 'Kilo kaydı: 4.35 kg',
    description: null,
    at: '2026-10-20T09:00:00.000Z',
  },
  {
    id: 'e2',
    type: 'alert',
    title: 'Uyarı eklendi: Kuduz aşısı sonrası reaksiyon',
    description: 'allergy · high',
    at: '2026-10-05T09:00:00.000Z',
  },
  {
    id: 'e3',
    type: 'file',
    title: 'Dosya yüklendi: sonuc.txt',
    description: '0.1 KB · text/plain',
    at: '2026-09-28T13:30:00.000Z',
  },
  {
    id: 'e4',
    type: 'created',
    title: 'Hasta kaydı oluşturuldu',
    description: null,
    at: '2026-08-15T08:00:00.000Z',
  },
];

export const OlayAkisi: Story = {
  name: 'Karışık olay akışı (kilo, uyarı, dosya, kayıt)',
  args: { events: EVENTS },
};

export const Bos: Story = {
  name: 'Boş durum',
  args: { events: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('timeline-empty')).toBeVisible();
  },
};

/* ---------- Kilo geçmişi ---------- */

const WEIGHTS: WeightObservation[] = [
  {
    id: 'w1',
    weightKg: 4.35,
    measuredAt: '2026-10-20T09:00:00.000Z',
    note: null,
    createdByStaffId: null,
  },
  {
    id: 'w2',
    weightKg: 4.2,
    measuredAt: '2026-08-15T09:00:00.000Z',
    note: 'Kontrol',
    createdByStaffId: null,
  },
  {
    id: 'w3',
    weightKg: 3.9,
    measuredAt: '2026-06-10T09:00:00.000Z',
    note: null,
    createdByStaffId: null,
  },
];

export const KiloGecmisi: Story = {
  name: 'Kilo geçmişi (salt okunur)',
  render: () => <WeightHistory observations={WEIGHTS} canManage={false} onAdd={fn()} />,
};

export const KiloEklemeEtkilesimi: Story = {
  name: 'Kilo ekleme etkileşimi',
  render: () => <WeightHistory observations={WEIGHTS.slice(0, 1)} canManage onAdd={fn()} />,
  play: async ({ canvas, args }) => {
    void args;
    const weightInput = canvas.getByLabelText('Kilo kilogram');
    await userEvent.type(weightInput, '4.5');
    await userEvent.type(canvas.getByLabelText('Kilo notu'), 'Aşı öncesi ölçüm');
    await userEvent.click(canvas.getByRole('button', { name: 'Kaydet' }));
    await expect(weightInput).toHaveValue('');
  },
};

/* ---------- Dosyalar ---------- */

const FILES: FileAssetMeta[] = [
  {
    id: 'f1',
    fileName: 'kan-tahlili.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 204800,
    kind: 'document',
    createdAt: '2026-10-01T10:00:00.000Z',
    uploadedByStaffId: null,
  },
  {
    id: 'f2',
    fileName: 'rontgen.webp',
    mimeType: 'image/webp',
    sizeBytes: 1048576,
    kind: 'image',
    createdAt: '2026-10-10T10:00:00.000Z',
    uploadedByStaffId: null,
  },
];

export const DosyaListesi: Story = {
  name: 'Dosya listesi (private storage)',
  render: () => <PatientFiles files={FILES} canManage={false} onUpload={fn()} onDownload={fn()} />,
};

export const DosyaIndirmeEtkilesimi: Story = {
  name: 'Dosya indirme etkileşimi',
  render: () => (
    <PatientFiles files={FILES.slice(0, 1)} canManage onUpload={fn()} onDownload={fn()} />
  ),
  play: async ({ canvas, args }) => {
    void args;
    await userEvent.click(canvas.getByTestId('file-download-f1'));
    // Yükleme düğmesi de görünür ve erişilebilir
    await expect(canvas.getByTestId('file-upload-button')).toBeVisible();
  },
};
