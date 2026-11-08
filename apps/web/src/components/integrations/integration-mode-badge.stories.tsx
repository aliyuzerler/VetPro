import type { Meta, StoryObj } from '@storybook/nextjs';
import { IntegrationModeBadge } from './integration-mode-badge';

const meta: Meta<typeof IntegrationModeBadge> = {
  title: 'Faz 12/Entegrasyon Modu',
  component: IntegrationModeBadge,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof IntegrationModeBadge>;

/** Yetkili sözleşmeyle açılmış canlı bağlantı. */
export const Canli: Story = {
  name: 'Canlı',
  render: () => <IntegrationModeBadge mode="live" />,
};

/** Demo/geliştirme stub — gerçek sağlayıcı verisi değildir. */
export const Sandbox: Story = {
  name: 'Sandbox',
  render: () => <IntegrationModeBadge mode="sandbox" />,
};
