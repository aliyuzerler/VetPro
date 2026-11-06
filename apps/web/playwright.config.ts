import { defineConfig, devices } from '@playwright/test';

/**
 * VetCore E2E — Playwright yapılandırması.
 * Web dev sunucusunu otomatik başlatır; API + gömülü PostgreSQL'in önceden
 * ayakta olması beklenir (bkz. `pnpm dev:postgres` ve `pnpm dev:api`).
 * Ekran görüntüleri e2e/screenshots/ altına yazılır ve repoya commit edilir.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false, // ekran görüntüleri deterministik olsun; testler sıralı koşar
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'chromium-mobile',
      // devices['iPhone 14'] varsayılanı WebKit motorudur; sandbox'ta yalnızca
      // chromium binary'leri kurulu olduğundan aynı viewport'u chromium ile kullanıyoruz.
      use: { ...devices['iPhone 14'], browserName: 'chromium' },
    },
  ],
  webServer: {
    // Not: Turbopack warm-start cache'i nadiren bayat modül gövdeleri serve edebiliyor
    // (Faz 01 QA'da tespit edildi). E2E determinizmi için her koşumda taze derleme.
    command: 'pnpm dev:clean',
    url: 'http://localhost:3000',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
