import type { Meta, StoryObj } from '@storybook/nextjs';
import { DocumentTypeBadge } from './document-type-badge';
import type { DocumentKind } from '@/lib/api-types';

const meta: Meta<typeof DocumentTypeBadge> = {
  title: 'Faz 12/Belge Türü',
  component: DocumentTypeBadge,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof DocumentTypeBadge>;

const kinds: DocumentKind[] = [
  'exam_summary',
  'vaccine_card',
  'prescription',
  'consent',
  'lab_report',
  'discharge',
];

export const TumTurler: Story = {
  name: 'Tüm türler',
  render: () => (
    <div className="flex flex-wrap gap-2">
      {kinds.map((kind) => (
        <DocumentTypeBadge key={kind} kind={kind} />
      ))}
    </div>
  ),
};

export const Recete: Story = {
  name: 'Reçete',
  render: () => <DocumentTypeBadge kind="prescription" />,
};
