import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, waitFor, within } from 'storybook/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AppointmentFormDialog } from './appointment-form-dialog';

const meta: Meta<typeof AppointmentFormDialog> = {
  title: 'Faz 05/Randevu Formu',
  component: AppointmentFormDialog,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof AppointmentFormDialog>;

/** Storybook'ta API erişimi yok: sorgular sessizce başarısız olur, form boş seçimlerle kurulur. */
function Harness({
  canOverride,
  simulateOutsideHours,
}: {
  canOverride: boolean;
  simulateOutsideHours: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <AppointmentFormDialog
        open={open}
        onOpenChange={setOpen}
        editing={null}
        canOverride={canOverride}
        onSaved={() => setSaved('kaydedildi')}
      />
      {/* Form gönderimi ağa çıkar ve izole ortamda başarısız olur; ağ hatası
          paneli çalışır durumda görüntülenir. */}
      {simulateOutsideHours && (
        <p data-testid="outside-note">
          Not: çalışma saati istisnası paneli yalnızca API 422
          APPOINTMENT_OUTSIDE_WORKING_HOURS döndüğünde açılır (gerçek API koşumunda E2E ile
          doğrulanır).
        </p>
      )}
      {saved && <p data-testid="saved-note">{saved}</p>}
    </QueryClientProvider>
  );
}

export const BosForm: Story = {
  name: 'Oluşturma modu — boş form',
  render: () => <Harness canOverride={false} simulateOutsideHours={false} />,
  play: async ({ canvas }) => {
    // Radix Dialog portal'a bağlanır → sorgular document.body üzerinden yapılır;
    // ilk boyanma animasyonu için waitFor kullanılır.
    const body = within(document.body);
    await waitFor(async () => {
      await expect(body.getByText('Yeni Randevu')).toBeVisible();
    });
    await expect(body.getByLabelText('Hasta')).toBeVisible();
    await expect(body.getByLabelText('Randevu türü')).toBeVisible();
    await expect(body.getByLabelText('Hekim')).toBeVisible();
    // Kayıt düğmesi geçerli seçim yokken devre dışı
    await expect(body.getByRole('button', { name: /Randevu Oluştur/ })).toBeDisabled();
  },
};

export const AcilisiKapali: Story = {
  name: 'Diyalog kapanır',
  render: () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    function Closer() {
      const [open, setOpen] = useState(true);
      return (
        <QueryClientProvider client={client}>
          <button type="button" onClick={() => setOpen(false)} data-testid="close-btn">
            Kapat
          </button>
          <AppointmentFormDialog
            open={open}
            onOpenChange={setOpen}
            editing={null}
            canOverride={false}
            onSaved={fn()}
          />
        </QueryClientProvider>
      );
    }
    return <Closer />;
  },
  play: async ({ canvas }) => {
    canvas.getByTestId('close-btn').click();
    const body = within(document.body);
    await waitFor(async () => {
      expect(body.queryByText('Yeni Randevu')).toBeNull();
    });
  },
};
