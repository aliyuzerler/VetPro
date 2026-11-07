import type { Meta, StoryObj } from '@storybook/nextjs';
import { PawPrint, Trash2 } from 'lucide-react';
import { expect, fn, userEvent } from 'storybook/test';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Varyantlar: Story = {
  name: 'Varyantlar',
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="default">Randevu oluştur</Button>
      <Button variant="secondary">Kaydet</Button>
      <Button variant="outline">Dışa aktar</Button>
      <Button variant="ghost">Menü</Button>
      <Button variant="destructive">
        <Trash2 aria-hidden="true" /> Sil
      </Button>
      <Button variant="link">Yardım</Button>
    </div>
  ),
  parameters: { layout: 'padded' },
};

export const Boyutlar: Story = {
  name: 'Boyutlar',
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm">Küçük</Button>
      <Button size="default">Normal</Button>
      <Button size="lg">Büyük</Button>
      <Button size="icon" aria-label="Yeni sahip">
        <PawPrint aria-hidden="true" />
      </Button>
    </div>
  ),
  parameters: { layout: 'padded' },
};

export const DevreDisi: Story = {
  name: 'Devre dışı',
  args: { variant: 'secondary', disabled: true, children: 'Kaydediliyor…' },
};

export const EtkilesimTesti: Story = {
  name: 'Etkileşim testi (tıklama)',
  args: { variant: 'default', children: 'Randevu oluştur', onClick: fn() },
  play: async ({ canvas, args }) => {
    const button = canvas.getByRole('button', { name: 'Randevu oluştur' });
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};
