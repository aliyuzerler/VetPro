import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { BackupRunTable } from './backup-run-table';
import type { BackupRunDto } from '@/lib/api-types';

const meta: Meta<typeof BackupRunTable> = {
  title: 'Faz 14/Yedek Çalışmaları',
  component: BackupRunTable,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof BackupRunTable>;

const RUNS: BackupRunDto[] = [
  {
    id: 'b1a2c3d4-0000-0000-0000-000000000001',
    kind: 'manual',
    status: 'completed',
    archiveSha256: 'ec89baa741ec450e739bef12bae0ff026b88f5f3f6e122b9b59b4e6939974e66',
    totalBytes: 102563,
    tableCount: 88,
    totalRows: 377,
    objectFileCount: 14,
    algorithm: 'aes-256-gcm',
    encrypted: true,
    retentionUntil: '2026-12-08T00:00:00.000Z',
    error: null,
    startedAt: '2026-11-08T09:00:00.000Z',
    completedAt: '2026-11-08T09:00:04.000Z',
  },
  {
    id: 'b1a2c3d4-0000-0000-0000-000000000002',
    kind: 'manual',
    status: 'failed',
    archiveSha256: null,
    totalBytes: 0,
    tableCount: 0,
    totalRows: 0,
    objectFileCount: 0,
    algorithm: 'aes-256-gcm',
    encrypted: true,
    retentionUntil: '2026-12-08T00:00:00.000Z',
    error: 'Object dosyası okunamadı: izin reddedildi',
    startedAt: '2026-11-08T08:00:00.000Z',
    completedAt: null,
  },
];

export const TamamlandiVeBasarisiz: Story = {
  name: 'Tamamlanmış + başarısız çalışma',
  args: { runs: RUNS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByTestId('backup-status-completed')).toBeVisible();
    expect(canvas.getByTestId('backup-status-failed')).toBeVisible();
    // Checksum kısaltması görünür
    expect(canvas.getByText('ec89baa741ec…')).toBeVisible();
    // Aksiyonlar yalnız tamamlanmış çalışmada
    expect(canvas.getByTestId('backup-download-b1a2c3d4-0000-0000-0000-000000000001')).toBeVisible();
    expect(canvas.getByTestId('backup-restore-b1a2c3d4-0000-0000-0000-000000000001')).toBeVisible();
  },
};

export const BosListe: Story = {
  name: 'Boş liste',
  args: { runs: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('Henüz yedek yok')).toBeVisible();
  },
};
