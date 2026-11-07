import { expect, test } from '@playwright/test';
import { DEMO, expectNoHorizontalOverflow, login, screenshot } from './helpers';

/**
 * VetCore Faz 08 — hizmet → stok → ücret atomik iş akışı E2E.
 * Kapsam: tüketim önizleme diyaloğu (kural planı + parti/depo onayı), atomik
 * kesinleştirme (ücret rozeti + satır düzeltmesi), iptal/reversal (gerekçe +
 * negatif satır), yetersiz seçilebilir stok uyarısı, yetkisiz kullanıcı.
 *
 * Mutasyonlar yeni muayene kaydı üzerinden yapılır (seed demo verisine
 * dokunmaz); Tüketim: Genel Muayene→Eldiven (partisiz), Kuduz Asısı→ parti
 * takipli (R2601, seed 6 doz — Faz 10 aşı kayıtları da bu partiden tüketir;
 * f08-03 iki kırılım + f10-09 iki kırılım + tampon).
 * yeterlidir; API e2e kendi verisini kendisi kurar.
 */

const PATIENT_NAME = 'Karabaş';

async function openNewWorkbenchWithService(
  page: import('@playwright/test').Page,
  serviceName: string,
  qty = '1',
): Promise<void> {
  await login(page, DEMO.veteriner);
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
  await page.getByRole('option', { name: new RegExp(serviceName) }).first().click();
  if (qty !== '1') {
    await page.getByTestId('service-qty').fill(qty);
  }
  await page.getByTestId('service-line-add').click();
  await page.getByTestId('service-record-save').click();
  await expect(page.getByTestId('service-record-finalize')).toBeVisible({ timeout: 15_000 });
}

test.describe('Faz 08 — hizmet → stok → ücret atomik iş akışı', () => {
  test('f08-01 partisiz tüketim: önizleme diyaloğu + atomik kesinleştirme (ücret rozeti)', async ({
    page,
  }) => {
    await openNewWorkbenchWithService(page, 'Genel Muayene');

    await page.getByTestId('service-record-finalize').click();
    await expect(page.getByTestId('finalize-dialog')).toBeVisible();
    // Preview yüklenene kadar bekle; ücret önizlemesi 1 × 450
    await expect(page.getByTestId('finalize-preview')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('finalize-charge-preview')).toContainText('₺450,00');
    await screenshot(page, 'f08-01-kesinlestirme-onizlemesi.png');

    await page.getByTestId('finalize-confirm').click();
    // Atomik post: kayıt kesinleşti + ücret rozeti tek geçişte
    await expect(page.getByTestId('service-record-charge')).toContainText('₺450,00', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('service-record-panel')).toContainText('Kesinleşti');
    // Kesinleşmiş kayıt için reversal düğmesi görünür
    await expect(page.getByTestId('service-record-reverse')).toBeVisible();
    await screenshot(page, 'f08-02-kesinlesmis-ucretli.png');
  });

  test('f08-03 parti takipli tüketim: parti seçimi diyaloğu ve kesinleştirme', async ({
    page,
  }) => {
    await openNewWorkbenchWithService(page, 'Kuduz Asısı');

    await page.getByTestId('service-record-finalize').click();
    await expect(page.getByTestId('finalize-preview')).toBeVisible({ timeout: 15_000 });
    // Parti takipli ürün — parti seçim listesi görünür; bloklu parti devre dışı
    await page.getByTestId('finalize-lot-UR-KUDUZ01').click();
    const expired = page.getByRole('option', { name: /GECTI|SÜRESİ|expired/i });
    await expect(expired).toHaveCount(0); // seed'de süresi dolmuş kuduz partisi yok
    await page.keyboard.press('Escape');
    await screenshot(page, 'f08-03-parti-secim-diyalogu.png');

    await page.getByTestId('finalize-confirm').click();
    await expect(page.getByTestId('service-record-charge')).toBeVisible({ timeout: 15_000 });
    await screenshot(page, 'f08-04-parti-tuketimi-kesinlesmis.png');
  });

  test('f08-05 reversal: gerekçe ile iptal — negatif düzeltme satırı görünür', async ({
    page,
  }) => {
    await openNewWorkbenchWithService(page, 'Genel Muayene');

    await page.getByTestId('service-record-finalize').click();
    await expect(page.getByTestId('finalize-preview')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('finalize-confirm').click();
    await expect(page.getByTestId('service-record-reverse')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('service-record-reverse').click();
    await expect(page.getByTestId('reverse-dialog')).toBeVisible();
    // Gerekçe boşken onay kapalı (denetim zorunluluğu)
    await expect(page.getByTestId('reverse-confirm')).toBeDisabled();
    await page.getByTestId('reverse-reason').fill('E2E iptal testi — yanlış hizmet');
    await page.getByTestId('reverse-confirm').click();
    await expect(page.getByTestId('service-record-reversed')).toBeVisible({ timeout: 15_000 });
    // Negatif düzeltme satırı append-only listede görünür
    await expect(page.getByTestId('service-record-charge-lines')).toContainText('İptal —');
    await expect(page.getByTestId('service-record-panel')).toContainText('(void)');
    await screenshot(page, 'f08-05-reversal-iptal-edildi.png');
  });

  test('f08-06 yetersiz seçilebilir stok uyarısı — onay kilitli', async ({ page }) => {
    // HIZ-003 Kan Biyokimyası → UR-HEMOKIT: seed'de tamamen karantinada
    await openNewWorkbenchWithService(page, 'Kan Biyokimyası');

    await page.getByTestId('service-record-finalize').click();
    await expect(page.getByTestId('finalize-preview')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('finalize-preview')).toContainText(/yetersiz/i, {
      timeout: 15_000,
    });
    await expect(page.getByTestId('finalize-confirm')).toBeDisabled();
    await screenshot(page, 'f08-06-yetersiz-stok-uyarisi.png');
  });

  test('f08-07 yetkisiz kullanıcı: kesinleştirme/iptal arayüzü gösterilmez', async ({ page }) => {
    // Resepsiyon encounter.manage yok — iş istasyonu salt-okunur
    await login(page, DEMO.resepsiyon);
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
    await page.getByTestId('muayene-liste').getByRole('button').first().click();
    await expect(page.getByTestId('encounter-workbench')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('tab', { name: 'Hizmetler' }).click();
    await expect(page.getByTestId('service-record-locked-note')).toBeVisible();
    await expect(page.getByTestId('service-record-finalize')).toHaveCount(0);
    await expect(page.getByTestId('service-record-reverse')).toHaveCount(0);
    await screenshot(page, 'f08-07-yetkisiz-gorunum.png');
  });

  test('f08-08 mobil görünüm: hizmet paneli ve diyaloğu taşmasız', async ({ page }) => {
    const isMobile = test.info().project.name === 'chromium-mobile';
    await openNewWorkbenchWithService(page, 'Genel Muayene');
    await expectNoHorizontalOverflow(page);

    await page.getByTestId('service-record-finalize').click();
    await expect(page.getByTestId('finalize-preview')).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press('Escape');

    if (!isMobile) {
      await screenshot(page, 'f08-08-masaustu-panel.png');
      return;
    }
    await screenshot(page, 'f08-08-mobil-panel.png');
  });
});
