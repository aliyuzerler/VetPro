import type { Meta, StoryObj } from '@storybook/nextjs';
import { NotificationStatusBadge } from './notification-status-badge';

const meta: Meta<typeof NotificationStatusBadge> = {
  title: 'Faz 12/Bildirim Durumu',
  component: NotificationStatusBadge,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof NotificationStatusBadge>;

/** Kuyruğa alındı, işlenmeyi bekliyor. */
export const Kuyrukta: Story = {
  name: 'Kuyrukta',
  render: () => <NotificationStatusBadge status="queued" />,
};

/** Kuyruk işleyicisi şu an bu kaydı işliyor. */
export const Isleniyor: Story = {
  name: 'İşleniyor',
  render: () => <NotificationStatusBadge status="processing" />,
};

/** Sağlayıcıya teslim edildi. */
export const Gonderildi: Story = {
  name: 'Gönderildi',
  render: () => <NotificationStatusBadge status="sent" />,
};

/** Kalıcı hata — operatör müdahalesi gerekir. */
export const Basarisiz: Story = {
  name: 'Başarısız',
  render: () => <NotificationStatusBadge status="failed" />,
};

/** Deneme bütçesi tükendi — manuel retry bekler. */
export const Olumektup: Story = {
  name: 'Ölü mektup',
  render: () => <NotificationStatusBadge status="dead_letter" />,
};

/** Onay kuralı vb. nedenle kuyruğa hiç girmedi. */
export const Atlandi: Story = {
  name: 'Atlandı',
  render: () => <NotificationStatusBadge status="skipped" />,
};
