import type { StorybookConfig } from '@storybook/nextjs';

/**
 * Storybook 10 — VetCore tasarım sistemi atölyesi (ADR-016).
 * Framework: @storybook/nextjs (Next 16 + React 19 + Tailwind 4 uyumlu).
 * Kontroller/aksiyonlar/viewport SB9'dan beri çekirdekte; yalnızca docs + a11y addon'u gerekir.
 */
const config: StorybookConfig = {
  framework: '@storybook/nextjs',
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  staticDirs: ['../public'],
};

export default config;
