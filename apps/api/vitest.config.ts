import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Vitest, esbuild tabanlıdır ve emitDecoratorMetadata desteklemez; NestJS
 * ValidationPipe'ı design:paramtypes olmadan DTO metatipini göremez ve
 * doğrulamayı sessizce atlar (Faz 04 QA bulgusu). SWC eklentisi decorator
 * metadata üretir — üretim (nest build/tsc) ile test paritesini korur.
 */
export default defineConfig({
  plugins: [swc.vite()],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    testTimeout: 20_000,
  },
});
