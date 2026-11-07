import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent } from 'storybook/test';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, UnauthorizedState } from './state-views';

const meta: Meta<typeof EmptyState> = {
  title: 'Design System/StateViews',
  component: EmptyState,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};

export default meta;
type EmptyStory = StoryObj<typeof EmptyState>;
type ErrorStory = StoryObj<typeof ErrorState>;
type UnauthorizedStory = StoryObj<typeof UnauthorizedState>;

export const BosDurum: EmptyStory = {
  name: 'Boş durum',
  args: {
    title: 'Henüz kayıtlı sahip yok',
    description: 'İlk sahibi ekleyerek hasta kayıtlarını başlatın.',
    action: (
      <Button variant="outline" size="sm">
        Sahip ekle
      </Button>
    ),
  },
};

export const HataDurumu: ErrorStory = {
  name: 'Hata durumu + tekrar deneme etkileşimi',
  // Not: meta.component EmptyState olduğu için açık render şart (CSF3 varsayılanı meta bileşenini çizer).
  render: (args) => <ErrorState {...args} />,
  args: {
    title: 'Randevular yüklenemedi',
    description: 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.',
    onRetry: fn(),
  },
  play: async ({ canvas, args }) => {
    const retryButton = canvas.getByRole('button', { name: /Tekrar dene/ });
    await userEvent.click(retryButton);
    await expect(args.onRetry).toHaveBeenCalledTimes(1);
  },
};

export const YetkisizDurum: UnauthorizedStory = {
  name: 'Yetkisiz durum',
  render: (args) => <UnauthorizedState {...args} />,
  args: {},
};
