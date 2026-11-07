import type { Meta, StoryObj } from '@storybook/nextjs';
import { VaccineDueBadge } from './vaccine-due-badge';

const meta: Meta<typeof VaccineDueBadge> = {
  title: 'Faz 10/Aşı Vade Rozeti',
  component: VaccineDueBadge,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof VaccineDueBadge>;

/** Protokol vadesi geçmiş hasta — geciken aşı. */
export const Gecikmis: Story = {
  name: 'Geciken aşı',
  render: () => <VaccineDueBadge classification="overdue" />,
};

/** Vade penceresi içinde — hatırlatma önerilir. */
export const Yaklasan: Story = {
  name: 'Yaklaşan aşı',
  render: () => <VaccineDueBadge classification="due_soon" />,
};

/** Vadesi uzak takvim girdisi. */
export const IleriTarih: Story = {
  name: 'İleri tarihli girdi',
  render: () => <VaccineDueBadge classification="later" />,
};
