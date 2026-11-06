import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * VetCore Faz 02 — uygulama kabuğu ve tasarım sistemi E2E testleri.
 * Ekran görüntüleri e2e/screenshots/ altına yazılır (repoya commit edilir) —
 * her faz sonunda standart Playwright koşusu (bkz. docs/TEST_STRATEGY.md).
 * Testler API + gömülü PostgreSQL'in ayakta olduğunu varsayar; Web webServer
 * tarafından otomatik başlatılır (playwright.config.ts).
 */

const SHOT_DIR = resolve(__dirname, 'screenshots');

async function screenshot(page: Page, name: string, fullPage = true): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true });
  // Her proje kendi ekran görüntüsünü yazar; mobile koşumu desktop dosyalarını ezmesin.
  const project = test.info().project.name;
  await page.screenshot({ path: resolve(SHOT_DIR, `${project}-${name}`), fullPage });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);
}

/** Bu testler masaüstü kabuğu (kenar çubuğu sabit) gerektirir. */
const DESKTOP_ONLY = 'Masaüstü projesi — kenar çubuğu gerektirir';

test.describe('Faz 02 — uygulama kabuğu (masaüstü)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Genel Bakış', level: 1 })).toBeVisible();
  });

  test('01 — kabuk yüklenir: kenar çubuğu, üst çubuk ve Faz 02 rozeti', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium-desktop', DESKTOP_ONLY);

    await expect(page.getByTestId('app-sidebar')).toBeVisible();
    await expect(page.getByTestId('app-topbar')).toBeVisible();
    await expect(
      page.getByText('Faz 02 — Tasarım sistemi ve uygulama kabukları'),
    ).toBeVisible();

    // Şube seçici sentetik demo kliniği gösterir
    await expect(page.getByRole('button', { name: /Merkez Şube/ })).toBeVisible();

    // Kenar çubuğu grupları listelenir
    const sidebar = page.getByTestId('app-sidebar');
    for (const group of ['Genel Bakış', 'Klinik', 'Hastalar', 'Depo & Stok', 'Finans', 'Yönetim']) {
      await expect(sidebar.getByRole('button', { name: group })).toBeVisible();
    }

    await screenshot(page, '01-kabuk-genel-bakis.png');
  });

  test('02 — KPI kartları, bugünün programı ve durum hikâyeleri', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium-desktop', DESKTOP_ONLY);

    await expect(page.getByText('Bugünkü Randevular')).toBeVisible();
    await expect(page.getByText('₺18.450')).toBeVisible();

    // Sentetik tablo — Türkçe karakterli hasta ve hasta sahibi (iki 'Beklemede' satırı var)
    const table = page.getByRole('table');
    await expect(table.getByText('Tekir')).toBeVisible();
    await expect(table.getByText('Ayşe Yılmaz')).toBeVisible();
    await expect(table.getByText('Beklemede').first()).toBeVisible();

    // Durum hikâyeleri: boş / hata / yetkisiz
    await expect(page.getByText('Bugün için bekleyen görev yok')).toBeVisible();
    await expect(page.getByText('Bu bölümü görme yetkiniz yok')).toBeVisible();

    await screenshot(page, '02-kpi-program-durumlar.png');
  });

  test('03 — platform bileşenleri canlı durumuna ulaşır (API + PostgreSQL)', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium-desktop', DESKTOP_ONLY);

    const card = page.locator('div[data-slot="card"]', { hasText: 'Platform bileşenleri' });
    await expect(card.getByText('Çalışıyor')).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText('Bağlı')).toBeVisible({ timeout: 20_000 });

    await screenshot(page, '03-canli-bilesenler.png');
  });

  test('04 — stil rehberi: tokenlar, Türkçe glifler ve durum hikâyeleri', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium-desktop', DESKTOP_ONLY);

    const sidebar = page.getByTestId('app-sidebar');

    // Yönetim grubunu aç ve Tasarım Sistemi sayfasına git
    await sidebar.getByRole('button', { name: 'Yönetim' }).click();
    await sidebar.getByRole('link', { name: 'Tasarım Sistemi' }).click();

    await expect(page.getByRole('heading', { name: 'Tasarım Sistemi', level: 1 })).toBeVisible();
    await expect(page.getByText('İ ı Ş ş Ğ ğ Ü ü Ö ö Ç ç')).toBeVisible();
    await expect(page.getByText('Renk tokenları')).toBeVisible();

    // Durum hikâyeleri stil rehberinde de görünür (kabul kriteri)
    await expect(page.getByText('Bu hafta için vadesi gelen aşı yok')).toBeVisible();
    await expect(page.getByText('Finans bölümü yetkinizde değil')).toBeVisible();

    await screenshot(page, '04-stil-rehberi-ust.png');

    // Modal aç/kapa etkileşimi
    await page.getByRole('button', { name: 'Modal aç (onay örneği)' }).click();
    await expect(page.getByRole('dialog')).toContainText('Kaydı kesinleştir');
    await screenshot(page, '05-stil-rehberi-modal.png', false);
    await page.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('05 — 1280 genişlikte taşma olmaz', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium-desktop', DESKTOP_ONLY);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByRole('heading', { name: 'Genel Bakış', level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await screenshot(page, '06-1280-tasmasiz.png');
  });

  test('06 — tablet (768): kenar çubuğu çekmecede açılır ve bağlantı çalışır', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium-desktop', DESKTOP_ONLY);

    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.getByTestId('app-sidebar')).toBeHidden();

    await page.getByRole('button', { name: 'Menüyü aç' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId('app-sidebar')).toBeVisible();

    await drawer.getByRole('button', { name: 'Yönetim' }).click();
    await drawer.getByRole('link', { name: 'Tasarım Sistemi' }).click();

    await expect(
      page.getByRole('heading', { name: 'Tasarım Sistemi', level: 1 }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Çekmece kapanma animasyonu bittikten sonra görüntü al
    await page.waitForTimeout(700);

    await screenshot(page, '07-tablet-cekmece-stil-rehberi.png');
  });

  test('07 — yenile butonu sorguları yeniden tetikler', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium-desktop', DESKTOP_ONLY);

    await page.getByRole('button', { name: 'Yenile' }).click();
    await expect(page.getByText('Erişilemiyor')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Genel Bakış', level: 1 })).toBeVisible();

    await screenshot(page, '08-yenile-sonrasi.png', false);
  });
});

test.describe('Faz 02 — mobil görünüm (iPhone 14)', () => {
  test('08 — mobilde düzen bozulmaz, çekmece menü çalışır', async ({ page }) => {
    test.skip(
      test.info().project.name !== 'chromium-mobile',
      'Yalnızca mobil projesinde çalışır',
    );

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Genel Bakış', level: 1 })).toBeVisible();

    // Kenar çubuğu gizli, hamburger menü ile çekmece açılır
    await expect(page.getByTestId('app-sidebar')).toBeHidden();
    await page.getByRole('button', { name: 'Menüyü aç' }).click();
    await expect(page.getByRole('dialog').getByTestId('app-sidebar')).toBeVisible();

    // Sheet kayma animasyonu bittikten sonra görüntü al (README kalitesi)
    await page.waitForTimeout(700);

    await screenshot(page, '09-mobil-cekmece.png', false);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    // Taşma yok; KPI kartları tek kolona düşer
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText('Bugünkü Randevular')).toBeVisible();

    await screenshot(page, '10-mobil-genel-bakis.png');
  });
});
