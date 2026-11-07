import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * E2E ortak yardımcılar — ekran görüntüsü + kimlik akışı.
 * Ekran görüntüleri e2e/screenshots/ altına yazılır ve repoya commit edilir
 * (her faz sonunda standart Playwright koşusu; ADR-013).
 */

export const SHOT_DIR = resolve(__dirname, 'screenshots');

/** Sentetik demo hesaplar (prisma seed ile aynı). */
export const DEMO = {
  admin: { email: 'admin@vetcore-demo.example', password: 'VetCore2026!' },
  veteriner: { email: 'veteriner@vetcore-demo.example', password: 'VetCore2026!' },
  resepsiyon: { email: 'resepsiyon@vetcore-demo.example', password: 'VetCore2026!' },
};

export async function screenshot(page: Page, name: string, fullPage = true): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true });
  // Her proje kendi ekran görüntüsünü yazar; mobile koşumu desktop dosyalarını ezmesin.
  const project = test.info().project.name;
  await page.screenshot({ path: resolve(SHOT_DIR, `${project}-${name}`), fullPage });
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);
}

/**
 * Giriş sayfası üzerinden oturum açar ve kontrol panelinin yüklendiğini doğrular.
 * Testler birbirinden bağımsız olsun diye her seferinde UI ile giriş yapılır
 * (token rotation ve guard zinciri de bu yolla gerçek isteklerle tetiklenir).
 */
export async function login(
  page: Page,
  credentials: { email: string; password: string } = DEMO.admin,
): Promise<void> {
  await page.goto('/giris');
  await expect(page.getByTestId('login-page')).toBeVisible();
  await page.getByLabel('E-posta').fill(credentials.email);
  await page.getByLabel('Parola').fill(credentials.password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Genel Bakış', level: 1 })).toBeVisible({
    timeout: 30_000,
  });
}
