import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * VetCore Faz 01 — ana sayfa E2E testleri.
 * Ekran görüntüleri e2e/screenshots/ altına yazılır (repoya commit edilir).
 * Testler API + PostgreSQL'in ayakta olduğunu varsayar; Web/WebServer tarafından
 * otomatik başlatılır (playwright.config.ts).
 */

const SHOT_DIR = resolve(__dirname, 'screenshots');

async function screenshot(page: Page, name: string, fullPage = true): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true });
  // Her proje kendi ekran görüntüsünü yazar; mobile koşumu desktop dosyalarını ezmesin.
  const project = test.info().project.name;
  await page.screenshot({ path: resolve(SHOT_DIR, `${project}-${name}`), fullPage });
}

test.describe('VetCore ana sayfa (Faz 01)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // İlk render: başlık hemen görünmeli
    await expect(page.getByRole('heading', { name: 'VetCore', level: 1 })).toBeVisible();
  });

  test('01 — ana sayfa yüklenir ve Faz 01 rozeti görünür', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'VetCore', level: 1 })).toHaveText('VetCore');
    await expect(page.getByText('Faz 01 — Monorepo ve altyapı')).toBeVisible();
    await expect(
      page.getByText('Veteriner Klinik Yönetim Platformu', { exact: false }),
    ).toBeVisible();

    // Yükleme iskeletleri çözülüp gerçek kartlar gelmeli
    await expect(page.getByText('Web', { exact: true })).toBeVisible();
    await expect(page.getByText('Kurulu çalışma alanları')).toBeVisible();

    await screenshot(page, '01-ana-sayfa.png');
  });

  test('02 — bileşen durum kartları başarı durumuna ulaşır (API + DB canlı)', async ({ page }) => {
    const section = page.getByRole('region', { name: 'Bileşen durumları' });

    // API kartı: NestJS health yanıtı zod sözleşmesiyle doğrulanır
    const apiCard = section.locator('div[data-slot="card"]', { hasText: 'NestJS' });
    await expect(apiCard.getByText('Çalışıyor')).toBeVisible({ timeout: 20_000 });

    // PostgreSQL kartı: readiness SELECT 1 başarılı
    const dbCard = section.locator('div[data-slot="card"]', { hasText: 'Prisma' });
    await expect(dbCard.getByText('Bağlı')).toBeVisible({ timeout: 20_000 });

    await section.scrollIntoViewIfNeeded();
    await screenshot(page, '02-durum-kartlari-canli.png');
  });

  test('03 — faz planı 15 fazı listeler ve Faz 01 tamamlandı gösterir', async ({ page }) => {
    const planCard = page.locator('div[data-slot="card"]', { hasText: 'Faz planı' });
    await expect(planCard.getByText('Sürdürülüyor')).toBeVisible({ timeout: 20_000 });

    // 15 faz satırı olmalı
    const phaseRows = planCard.locator('li');
    await expect(phaseRows).toHaveCount(15);

    // Faz 01 UI'da 'Sürdürülüyor' gösterir (CURRENT_PHASE_ID=1; Faz 02 build'inde
    // domain paketinden 2'ye çekilecek). Faz 15 ise 'Planlandı' olmalı.
    const row01 = planCard.locator('li', { hasText: 'Faz 01' });
    await expect(row01.getByText('Sürdürülüyor')).toBeVisible();
    const row15 = planCard.locator('li', { hasText: 'Faz 15' });
    await expect(row15.getByText('Planlandı')).toBeVisible();

    await planCard.scrollIntoViewIfNeeded();
    await screenshot(page, '03-faz-plani.png');
  });

  test('04 — yenile butonu sorguları yeniden tetikler', async ({ page }) => {
    const refreshButton = page.getByRole('button', { name: 'Yenile' });
    await expect(refreshButton).toBeVisible();

    // Tıklama sonrası hata durumu OLMAMALI (API canlıysa)
    await refreshButton.click();
    await expect(
      page.getByText('Erişilemiyor', { exact: true }),
    ).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'VetCore', level: 1 })).toBeVisible();

    await screenshot(page, '04-yenile-sonrasi.png');
  });

  test('05 — footer sentetik veri ve API sürüm bilgisini gösterir', async ({ page }) => {
    await expect(
      page.getByText('Demo/sentetik veri ile çalışır', { exact: false }),
    ).toBeVisible();
    await expect(page.getByText(/API sürümü: \d+\.\d+\.\d+\./, { exact: false })).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe('VetCore ana sayfa — mobil görünüm (iPhone 14)', () => {
  test('06 — mobil viewportte düzen bozulmaz ve ekran görüntüsü alınır', async ({ page }) => {
    test.skip(
      test.info().project.name !== 'chromium-mobile',
      'Yalnızca mobil projesinde çalışır',
    );

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'VetCore', level: 1 })).toBeVisible();

    // Durum kartları tek kolona düşmeli; yatay kaydırma olmamalı
    await expect(page.getByText('Kurulu çalışma alanları')).toBeVisible({ timeout: 20_000 });
    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    );
    expect(hasHorizontalScroll).toBe(false);

    await screenshot(page, '06-ana-sayfa-mobil.png');
  });
});
