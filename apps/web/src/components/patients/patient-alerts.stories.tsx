import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent } from 'storybook/test';
import { useState } from 'react';
import { PatientAlerts } from './patient-alerts';
import type { PatientAlert } from '@/lib/api-types';

const meta: Meta<typeof PatientAlerts> = {
  title: 'Faz 04/Hasta Uyarıları',
  component: PatientAlerts,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof PatientAlerts>;

const ALERTS: PatientAlert[] = [
  {
    id: 'alert-1',
    kind: 'allergy',
    label: 'Kuduz aşısı sonrası reaksiyon',
    severity: 'high',
    active: true,
    resolvedAt: null,
    createdAt: '2026-09-01T09:00:00.000Z',
  },
  {
    id: 'alert-2',
    kind: 'chronic',
    label: 'Kronik böbrek yetmezliği',
    severity: 'medium',
    active: true,
    resolvedAt: null,
    createdAt: '2026-08-15T09:00:00.000Z',
  },
  {
    id: 'alert-3',
    kind: 'warning',
    label: 'Isırma riski',
    severity: 'low',
    active: false,
    resolvedAt: '2026-09-20T09:00:00.000Z',
    createdAt: '2026-09-10T09:00:00.000Z',
  },
];

export const UyariListesi: Story = {
  name: 'Aktif + çözülmüş uyarılar',
  args: {
    alerts: ALERTS,
    canManage: false,
    onResolve: fn(),
    onReopen: fn(),
    onAdd: fn(),
  },
};

export const Bos: Story = {
  name: 'Uyarı yok (salt okunur)',
  args: {
    alerts: [],
    canManage: false,
    onResolve: fn(),
    onReopen: fn(),
    onAdd: fn(),
  },
};

function AlertsHarness(props: {
  onResolve: (id: string) => void;
  onAdd: (input: {
    kind: PatientAlert['kind'];
    label: string;
    severity: 'low' | 'medium' | 'high';
  }) => void;
}) {
  const [alerts, setAlerts] = useState<PatientAlert[]>(ALERTS.slice(0, 1));
  return (
    <PatientAlerts
      alerts={alerts}
      canManage
      onResolve={(id) => {
        props.onResolve(id);
        setAlerts((current) =>
          current.map((alert) =>
            alert.id === id
              ? { ...alert, active: false, resolvedAt: new Date().toISOString() }
              : alert,
          ),
        );
      }}
      onReopen={fn()}
      onAdd={(input) => {
        props.onAdd(input);
        setAlerts((current) => [
          {
            id: `alert-new-${current.length}`,
            kind: input.kind,
            label: input.label,
            severity: input.severity,
            active: true,
            resolvedAt: null,
            createdAt: new Date().toISOString(),
          },
          ...current,
        ]);
      }}
    />
  );
}

export const EtkilesimEkleVeCoz: Story = {
  name: 'Etkileşim: uyarı ekle + çöz',
  render: (args) => <AlertsHarness onResolve={args.onResolve} onAdd={args.onAdd} />,
  args: { onResolve: fn(), onAdd: fn() } as never,
  play: async ({ canvas, args }) => {
    // 1) Yeni uyarı ekle
    const label = canvas.getByLabelText('Uyarı etiketi');
    await userEvent.type(label, 'Tavuk protein alerjisi');
    await userEvent.click(canvas.getByRole('button', { name: 'Ekle' }));
    await expect(args.onAdd).toHaveBeenCalledTimes(1);
    await expect(canvas.getByText('Tavuk protein alerjisi')).toBeVisible();

    // 2) Mevcut uyarıyı çöz
    await userEvent.click(canvas.getByTestId('alert-resolve-alert-1'));
    await expect(args.onResolve).toHaveBeenCalledWith('alert-1');
  },
};
