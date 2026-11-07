import { expect, test } from '@playwright/test';
import { DEMO, expectNoHorizontalOverflow, login, screenshot } from './helpers';

/**
 * VetCore Faz 06 — muayene (SOAP), vital bulgular ve hizmet kataloğu E2E.
 * Kapsam: hasta seçimi, yeni muayene (taslak), SOAP kaydet + yeniden açma,
 * vital ekleme + geçmiş korunması, tanı, hizmet kaydı (fiyat çözümü görünümlü),
 * imza kilidi (alanlar kilitlenir), addendum, yetkisiz kullanıcı ve hizmet
 * kataloğu (fiyat geçmişi + override + süresi dolmuş satır).
 *
 * Mutasyonlar masaüstü projesinde yeni muayene kaydı üzerinden yapılır (seed
 * demo kaydına dokunmaz); mobil koşum salt-okunur görünüm + ekran görüntüsü.
 */

const PATIENT_NAME = 'Karabaş';

async function openWorkbenchForPatient(
  page: import('@playwright/test').Page,
  patientName: string,
): Promise<void> {
  await page.goto('/muayene');
  await expect(page.getByTestId('muayene-page')).toBeVisible();
  await page.getByTestId('muayene-patient-search').fill(patientName);
  await page
    .getByTestId('muayene-patient-list')
    .getByRole('button')
    .filter({ hasText: patientName })
    .first()
    .click();
  await expect(page.getByTestId('muayene-liste')).toBeVisible();
}

test.describe('Faz 06 — muayene workbench ve hizmet kataloğu', () => {
  test('f06-01 muayene sayfası açılır, hasta seçilir, kayıtlar listelenir', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await openWorkbenchForPatient(page, PATIENT_NAME);
    // Seed demo muayenesi listede görünür
    await expect(page.getByTestId('muayene-liste')).toContainText('Yıllık karma aşı');
    await screenshot(page, 'f06-01-muayene-sayfasi.png');
  });

  test('f06-02 yeni muayene oluşturulur ve workbench açılır', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await openWorkbenchForPatient(page, PATIENT_NAME);
    await page.getByTestId('muayene-yeni').click();
    await expect(page.getByTestId('muayene-yeni-dialog')).toBeVisible();
    await page.getByTestId('muayene-yeni-sikayet').fill('E2E kontrol muayenesi');
    await page.getByTestId('muayene-yeni-kaydet').click();
    await expect(page.getByTestId('encounter-workbench')).toBeVisible({ timeout: 15_000 });
    // Taslak rozeti görünür
    await expect(page.getByTestId('encounter-workbench')).toContainText('Taslak');
    await screenshot(page, 'f06-02-yeni-muayene.png');
  });

  test('f06-03 SOAP alanları kaydedilir ve yeniden açıldığında korunur', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await openWorkbenchForPatient(page, PATIENT_NAME);
    const complaint = `SOAP testi ${Date.now()}`;
    await page.getByTestId('muayene-yeni').click();
    await page.getByTestId('muayene-yeni-sikayet').fill(complaint);
    await page.getByTestId('muayene-yeni-kaydet').click();
    await expect(page.getByTestId('encounter-workbench')).toBeVisible({ timeout: 15_000 });

    const subjective = `E2E anamnez ${Date.now()}`;
    await page.getByTestId('soap-subjective').fill(subjective);
    await page.getByTestId('soap-objective').fill('Ateş 39.1°C, mukozalar pembe');
    await page.getByTestId('soap-save').click();
    // Kaydetme sonrası kayıt in_progress olur; SOAP alanları dolu kalır
    await expect(page.getByTestId('encounter-workbench')).toContainText('Devam Ediyor', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('soap-subjective')).toHaveValue(subjective);

    // Yeniden açma: seed kaydına geçip geri dön (veritabanından taze yükleme)
    await page
      .getByTestId('muayene-liste')
      .getByRole('button')
      .filter({ hasText: 'Yıllık karma aşı' })
      .first()
      .click();
    // chiefComplaint girdi değerinde taşınır — seed kaydının şikâyeti dönmeli
    await expect(page.getByTestId('soap-chief-complaint')).toHaveValue('Yıllık karma aşı + genel kontrol', {
      timeout: 15_000,
    });
    await page
      .getByTestId('muayene-liste')
      .getByRole('button')
      .filter({ hasText: complaint })
      .first()
      .click();
    await expect(page.getByTestId('soap-subjective')).toHaveValue(subjective, {
      timeout: 15_000,
    });
    await screenshot(page, 'f06-03-soap-kayitli.png');
  });

  test('f06-04 vital bulgu eklenir, ölçüm geçmişinde görünür', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await openWorkbenchForPatient(page, PATIENT_NAME);
    // Seed demo muayenesi (in_progress) vitals sekmesi
    await page.getByTestId('muayene-liste').getByRole('button').first().click();
    await expect(page.getByTestId('encounter-workbench')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('tab', { name: 'Vital Bulgular' }).click();

    const tempValue = `39.${Math.floor(Math.random() * 9)}`;
    await page.getByTestId('vital-value').fill(tempValue);
    await page.getByTestId('vital-add').click();
    await expect(page.getByTestId('vital-panel')).toContainText(`${tempValue} °C`, {
      timeout: 15_000,
    });
    // Geçmiş ölçümler bölümü aynı bulgu için tüm ölçümleri listeler
    await expect(page.getByTestId('vital-history-rows')).toBeVisible();
    await screenshot(page, 'f06-04-vital-eklendi.png');
  });

  test('f06-05 hizmet seçilir, fiyat çözümlü satır oluşturulur', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await openWorkbenchForPatient(page, PATIENT_NAME);
    await page.getByTestId('muayene-yeni').click();
    await page.getByTestId('muayene-yeni-kaydet').click();
    await expect(page.getByTestId('encounter-workbench')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('tab', { name: 'Hizmetler' }).click();

    await page.getByTestId('service-select').click();
    await page.getByRole('option', { name: /Genel Muayene/ }).first().click();
    await page.getByTestId('service-qty').fill('2');
    await page.getByTestId('service-line-add').click();
    await page.getByTestId('service-record-save').click();
    // Fiyat çözümü API'de: 2 × 450 = 900 TRY (MRKZ genel fiyat)
    await expect(page.getByTestId('service-record-panel')).toContainText('₺900,00', {
      timeout: 15_000,
    });
    await screenshot(page, 'f06-05-hizmet-kaydi.png');
  });

  test('f06-06 imza sonrası alanlar kilitlenir (signed encounter)', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await openWorkbenchForPatient(page, PATIENT_NAME);
    await page.getByTestId('muayene-yeni').click();
    await page.getByTestId('muayene-yeni-kaydet').click();
    await expect(page.getByTestId('encounter-workbench')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('encounter-sign').click();
    await expect(page.getByTestId('encounter-workbench')).toContainText('İmzalandı', {
      timeout: 15_000,
    });
    // Kabul kriteri 4: SOAP alanları disabled, kaydet butonu yok
    await expect(page.getByTestId('soap-subjective')).toBeDisabled();
    await expect(page.getByTestId('soap-save')).toHaveCount(0);
    await expect(page.getByTestId('soap-locked-note')).toBeVisible();
    // Vital ve hizmet ekleme de kapanır
    await page.getByRole('tab', { name: 'Vital Bulgular' }).click();
    await expect(page.getByTestId('vital-locked-note')).toBeVisible();
    await screenshot(page, 'f06-06-imzali-kilitli.png');
  });

  test('f06-07 imzalı kayda addendum eklenir', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await openWorkbenchForPatient(page, PATIENT_NAME);
    await page.getByTestId('muayene-yeni').click();
    await page.getByTestId('muayene-yeni-kaydet').click();
    await expect(page.getByTestId('encounter-workbench')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('encounter-sign').click();
    await expect(page.getByTestId('encounter-workbench')).toContainText('İmzalandı', {
      timeout: 15_000,
    });

    await page.getByRole('tab', { name: 'Addendum' }).click();
    const body = `E2E addendum ${Date.now()}`;
    await page.getByTestId('addendum-body').fill(body);
    await page.getByTestId('addendum-save').click();
    await expect(page.getByTestId('addendum-list')).toContainText(body, { timeout: 15_000 });
    await screenshot(page, 'f06-07-addendum.png');
  });

  test('f06-08 resepsiyon imza yetkisi olmayan kullanıcı görünümü', async ({ page }) => {
    await login(page, DEMO.resepsiyon);
    await openWorkbenchForPatient(page, PATIENT_NAME);
    await page.getByTestId('muayene-liste').getByRole('button').first().click();
    await expect(page.getByTestId('encounter-workbench')).toBeVisible({ timeout: 15_000 });
    // Kabul kriteri 3: yetkisiz kullanıcıya imza butonu gösterilmez; alanlar kilitli
    await expect(page.getByTestId('encounter-sign')).toHaveCount(0);
    await expect(page.getByTestId('soap-save')).toHaveCount(0);
    await screenshot(page, 'f06-08-yetkisiz-gorunum.png');
  });

  test('f06-09 hizmet kataloğu: liste, fiyat geçmişi ve tüketim kuralı', async ({ page }) => {
    const isMobile = test.info().project.name === 'chromium-mobile';
    await login(page, DEMO.veteriner);
    await page.goto('/hizmetler');
    await expect(page.getByTestId('hizmetler-page')).toBeVisible();
    await expect(page.getByTestId('hizmet-tablo')).toContainText('Genel Muayene');
    if (isMobile) {
      // Mobil koşumda yalnız liste doğrulanır (tablo kaydırma alanında tıklama
      // stabil değil); detay paneli masaüstü koşumunda doğrulanır.
      await screenshot(page, 'f06-09-hizmet-katalogu.png');
      return;
    }

    // Detay: süresi dolmuş satır + override satırı görünür (seed HIZ-001)
    await page.getByRole('button', { name: 'Genel Muayene' }).first().click();
    await expect(page.getByTestId('service-detail')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('service-detail')).toContainText('₺450,00');
    await expect(page.getByTestId('service-detail')).toContainText('Süresi doldu');
    await expect(page.getByTestId('service-detail')).toContainText('seans');
    await screenshot(page, 'f06-09-hizmet-katalogu.png');
  });

  test('f06-10 mobil görünüm: muayene workbench ve hizmet kataloğu', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await openWorkbenchForPatient(page, PATIENT_NAME);
    await page.getByTestId('muayene-liste').getByRole('button').first().click();
    await expect(page.getByTestId('encounter-workbench')).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'f06-10-mobil-muayene.png');

    await page.goto('/hizmetler');
    await expect(page.getByTestId('hizmet-tablo')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'f06-11-mobil-hizmetler.png');
  });
});
