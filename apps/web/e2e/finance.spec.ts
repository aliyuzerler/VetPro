import { expect, test } from '@playwright/test';
import { DEMO, expectNoHorizontalOverflow, login, screenshot } from './helpers';

/**
 * VetCore Faz 09 — kasa, tahsilat, cari hesap ve giderler E2E.
 * Kapsam: muayene kesinleştirmesinden gelen ücrete tahsilat (FIFO dağıtım
 * önizlemesi), cari ekstre (ücret/tahsilat ilişkisi), kasa oturumu (açılış,
 * nakit giriş, kapanış farkı + açıklama zorunluluğu), gider kaydı, iade
 * akışı ve yetkisiz kullanıcı.
 *
 * Mutasyonlar gerçek kullanıcı akışıyla yapılır: ücret, Faz 08 finalize
 * akışıyla (Genel Muayene → Eldiven partisiz tüketim) üretilir. Kasa oturumu
 * her koşumda kapatılır (kasa başına tek açık oturum kuralı).
 */

const PATIENT_NAME = 'Karabaş';
const OWNER_LAST = 'Aksoy';
const OWNER_FULL = 'Zeynep Aksoy';

/** Faz 08 akışıyla gerçek ücret üretir (Genel Muayene → kesinleştir → ₺450). */
async function createChargeViaFinalize(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/muayene');
  await expect(page.getByTestId('muayene-page')).toBeVisible();
  await page.getByTestId('muayene-patient-search').fill(PATIENT_NAME);
  await page
    .getByTestId('muayene-patient-list')
    .getByRole('button')
    .filter({ hasText: PATIENT_NAME })
    .first()
    .click();
  await expect(page.getByTestId('muayene-liste')).toBeVisible();
  await page.getByTestId('muayene-yeni').click();
  await page.getByTestId('muayene-yeni-kaydet').click();
  await expect(page.getByTestId('encounter-workbench')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('tab', { name: 'Hizmetler' }).click();
  await page.getByTestId('service-select').click();
  await page.getByRole('option', { name: /Genel Muayene/ }).first().click();
  await page.getByTestId('service-line-add').click();
  await page.getByTestId('service-record-save').click();
  await expect(page.getByTestId('service-record-finalize')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('service-record-finalize').click();
  await expect(page.getByTestId('finalize-dialog')).toBeVisible();
  await expect(page.getByTestId('finalize-preview')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('finalize-confirm').click();
  await expect(page.getByTestId('service-record-charge')).toContainText('₺450,00', {
    timeout: 15_000,
  });
}

test.describe('Faz 09 — kasa, tahsilat, cari hesap ve giderler', () => {
  test('f09-01 muayene ücreti üret ve tahsilat al (FIFO önizleme)', async ({ page }) => {
    await login(page, DEMO.admin);
    await createChargeViaFinalize(page);

    await page.goto('/tahsilat');
    await expect(page.getByTestId('tahsilat-page')).toBeVisible();
    await page.getByTestId('tahsilat-yeni').click();
    await expect(page.getByTestId('owner-secici')).toBeVisible();

    await page.locator('#owner-search').fill(OWNER_LAST);
    await page
      .getByTestId('owner-liste')
      .getByRole('button')
      .filter({ hasText: OWNER_FULL })
      .first()
      .click();

    await expect(page.getByRole('heading', { name: 'Tahsilat Al' })).toBeVisible();
    await page.getByTestId('payment-amount').fill('200');
    const preview = page.getByTestId('allocation-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('200,00');
    await screenshot(page, 'f09-01-tahsilat-onizlemesi.png');

    await page.getByTestId('payment-submit').click();
    await expect(page.getByTestId('tahsilat-bilgi')).toContainText('Tahsilat kaydedildi', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('tahsilat-liste')).toContainText(OWNER_FULL);
    await screenshot(page, 'f09-02-tahsilat-kaydedildi.png');
  });

  test('f09-02 cari ekstre: ücret ve tahsilat ilişkisi koşan bakiyeyle', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/cari');
    await expect(page.getByTestId('cari-page')).toBeVisible();
    await page.getByTestId('cari-arama').fill(OWNER_LAST);
    await page
      .getByTestId('cari-liste')
      .getByRole('button')
      .filter({ hasText: OWNER_FULL })
      .first()
      .click();

    await expect(page.getByTestId('statement-table')).toBeVisible({ timeout: 15_000 });
    // Ücret ve tahsilat satırları aynı ekranda; iade satırı koşumda iade
    // yapıldıysa görünür (K6 yetkisiz koşumunda yoktur — koşulsal doğrulanmaz).
    await expect(page.getByTestId('statement-table')).toContainText('Ücret');
    await expect(page.getByTestId('statement-table')).toContainText('Tahsilat');
    await expect(page.getByTestId('cari-ozet')).toBeVisible();
    await screenshot(page, 'f09-03-cari-ekstre.png');
  });

  test('f09-03 kasa: açılış, nakit giriş ve kapanış farkı (açıklama zorunlu)', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/kasa');
    await expect(page.getByTestId('kasa-page')).toBeVisible();
    await expect(page.getByTestId('register-cards')).toBeVisible();

    // Varsayılan kasada açık oturum varsa önce kapat (önceki koşum kalıntısı)
    const closeButton = page.getByTestId('kasa-kapanis-diyalog');
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
      await page.getByTestId('counted-total').fill('0');
      await page.getByTestId('difference-note').fill('e2e temizlik kapanışı');
      await page.getByTestId('close-session-submit').click();
      await expect(page.getByTestId('kasa-bilgi')).toContainText('kapatıldı', { timeout: 15_000 });
    }

    await page.getByTestId('kasa-ac').first().click();
    await page.getByTestId('opening-float').fill('500');
    await page.getByTestId('open-session-submit').click();
    await expect(page.getByTestId('kasa-bilgi')).toContainText('Kasa açıldı', { timeout: 15_000 });
    await expect(page.getByTestId('cash-live-panel')).toContainText('500,00', { timeout: 15_000 });
    await screenshot(page, 'f09-04-kasa-acik.png');

    // Nakit giriş
    await page.getByTestId('kasa-hareket-giris').click();
    await page.getByTestId('movement-amount').fill('100');
    await page.getByTestId('movement-reason').fill('kurye peşinatı e2e');
    await page.getByTestId('movement-submit').click();
    await expect(page.getByTestId('kasa-bilgi')).toContainText('Kasa hareketi kaydedildi', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('cash-live-panel')).toContainText('600,00');

    // Kapanış: fark −10 → açıklama zorunlu
    await page.getByTestId('kasa-kapanis-diyalog').click();
    await page.getByTestId('counted-total').fill('590');
    await expect(page.getByTestId('difference-preview')).toContainText('-10,00');
    await page.getByTestId('close-session-submit').click();
    await expect(page.getByRole('alert')).toContainText('Fark açıklaması zorunlu');
    await screenshot(page, 'f09-05-fark-aciklamasi-zorunlu.png');

    await page.getByTestId('difference-note').fill('10 TL kısa sayım — e2e farkı');
    await page.getByTestId('close-session-submit').click();
    await expect(page.getByTestId('kasa-bilgi')).toContainText('kapatıldı', { timeout: 15_000 });
    await screenshot(page, 'f09-06-kasa-kapandi.png');
  });

  test('f09-04 gider ekle (kart yöntemi) ve listede görünür', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/giderler');
    await expect(page.getByTestId('giderler-page')).toBeVisible();
    await page.getByTestId('gider-yeni').click();
    await expect(page.getByRole('heading', { name: 'Gider Ekle' })).toBeVisible();
    await page.getByTestId('expense-amount').fill('80,50');
    await page.getByTestId('expense-description').fill('e2e ofis malzemesi');
    await page.getByTestId('expense-submit').click();
    await expect(page.getByTestId('gider-bilgi')).toContainText('Gider kaydedildi', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('gider-liste')).toContainText('e2e ofis malzemesi');
    await expect(page.getByTestId('gider-liste')).toContainText('80,50');
    await screenshot(page, 'f09-07-gider-kaydedildi.png');
  });

  test('f09-05 iade: tahsilattan kısmi iade (finance.refund)', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/tahsilat');
    await expect(page.getByTestId('tahsilat-page')).toBeVisible();
    const iadeButtons = page.getByRole('button', { name: 'İade', exact: true });
    await expect(iadeButtons.first()).toBeVisible({ timeout: 15_000 });
    await iadeButtons.first().click();

    await expect(page.getByRole('heading', { name: 'Tahsilat İadesi' })).toBeVisible();
    await page.getByTestId('refund-amount').fill('50');
    await page.getByTestId('refund-reason').fill('e2e hizmet iptali');
    await screenshot(page, 'f09-08-iade-diyalogu.png');
    await page.getByTestId('refund-submit').click();
    await expect(page.getByTestId('tahsilat-bilgi')).toContainText('İade kaydedildi', {
      timeout: 15_000,
    });
    await screenshot(page, 'f09-09-iade-kaydedildi.png');
  });

  test('f09-06 yetkisiz kullanıcı: veteriner tahsilat alamaz ve kasa açamaz', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/tahsilat');
    await expect(page.getByTestId('tahsilat-page')).toBeVisible();
    await expect(page.getByTestId('tahsilat-yeni')).toHaveCount(0);
    await screenshot(page, 'f09-10-yetkisiz-tahsilat.png');

    await page.goto('/kasa');
    await expect(page.getByTestId('kasa-page')).toBeVisible();
    await expect(page.getByTestId('kasa-ac')).toHaveCount(0);
  });

  test('f09-07 mobil: tahsilat sayfası yatay taşma olmadan görünür', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/tahsilat');
    await expect(page.getByTestId('tahsilat-page')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.goto('/kasa');
    await expect(page.getByTestId('kasa-page')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'f09-11-mobil-kasa.png');
  });
});
