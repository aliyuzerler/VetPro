import type { Preview } from '@storybook/nextjs';
import '../src/app/globals.css';
import './preview.css';

/**
 * Uygulamadaki globals.css birebir yüklenir: Tailwind 4 token'ları
 * (design/tokens.json > @theme inline) story'lere aynı şekilde yansır.
 * preview.css yalnızca next/font Inter değişkeninin Storybook karşılığını sağlar.
 */
const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: {
      // addon-a11y: axe ihlalleri test-runner'da HATA olarak raporlanır (CI kapısı).
      test: 'error',
    },
  },
};

export default preview;
