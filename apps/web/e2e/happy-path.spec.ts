import { expect, test, type Page } from '@playwright/test';
import { DEMO, expectNoHorizontalOverflow, login, screenshot } from './helpers';

/**
 * VetCore Faz 15 — uçtan uca mutlu yol (happy path) E2E.
 * Kabul kriteri: owner → patient → appointment → encounter → service →
 * lot stock → charge → payment → PDF zinciri tek koşumda geçmeli.
 *
 * Sentetik veri: 'Fonzi E2E' sahibi + 'Fonzi' hastası (koşuma özgü telefon ile —
 * paralel kalıntı güvenli). Mutasyon testleri yalnız masaüstü projesinde koşar
 * (Faz 04 deseni); mobil koşum Ayarlar > Lisans görünürlüğü + taşma denetimi yapar.
 */

const OWNER_PHONE_BASE = '0532 900';

function uniquePhone(): string {
  const tail = String(Date.now()).slice(-4);
  return `${OWNER_PHONE_BASE} ${tail.slice(0, 2)} ${tail.slice(2)}`;
}

async function clinicNextWorkdayISO(page: Page): Promise<string> {
  return page.evaluate(() => {
    const d = new Date(Date.now() + 3 * 60 * 60_000 + 24 * 60 * 60_000);
    if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  });
}

test.describe('Faz 15 — uçtan uca mutlu yol', () => {
  test('f15-01 sahip → hasta → randevu → muayene → hizmet/parti → ücret → tahsilat → PDF', async ({
    page,
  }) => {
    test.skip(
      test.info().project.name === 'chromium-mobile',
      'Mutasyon zinciri yalnız masaüstünde koşar',
    );

    const phone = uniquePhone();
    const appointmentDate = await clinicNextWorkdayISO(page);

    // ── 1) Sahip oluşturma ────────────────────────────────────────────────
    await login(page, DEMO.admin);
    await page.goto('/sahipler');
    await expect(page.getByTestId('owner-list')).toBeVisible();
    await page.getByTestId('owner-create-button').click();
    await page.getByLabel('Ad', { exact: true }).fill('Fonzi');
    await page.getByLabel('Soyad', { exact: true }).fill('E2E');
    await page.getByLabel('Telefon', { exact: true }).fill(phone);
    await page.getByRole('button', { name: 'Kaydı kontrol et' }).click();
    // Aday yoksa form doğrudan kaydeder; aday varsa uyarı + "Yine de kaydet".
    const proceed = page.getByTestId('duplicate-proceed');
    if (await proceed.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await proceed.click();
    }
    await expect(page.getByTestId('owner-detail')).toBeVisible({ timeout: 15_000 });
    await screenshot(page, 'f15-01-sahip-olusturuldu.png');

    // ── 2) Hasta (hayvan) oluşturma ──────────────────────────────────────
    await page.getByTestId('add-patient-button').click();
    await page.getByLabel('Hasta adı').fill('Fonzi');
    await page.getByTestId('patient-species').click();
    await page.getByRole('option', { name: /Köpek/ }).first().click();
    await page.getByTestId('patient-form-submit').click();
    await expect(page.getByTestId('owner-patients')).toContainText('Fonzi', { timeout: 15_000 });
    await screenshot(page, 'f15-02-hasta-olusturuldu.png');

    // ── 3) Randevu oluşturma ─────────────────────────────────────────────
    await page.goto('/takvim');
    await expect(page.getByTestId('calendar-board')).toBeVisible();
    await page.getByTestId('new-appointment-button').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.getByTestId('appointment-patient-search').fill('Fonzi');
    await dialog.getByRole('button', { name: /Fonzi/ }).first().click();
    await page.getByTestId('appointment-type-select').click();
    await page
      .getByRole('option', { name: /Muayene/ })
      .first()
      .click();
    await page.getByTestId('appointment-staff-select').click();
    await page.getByRole('option', { name: /Ayşe Demir/ }).click();
    await page.getByTestId('appointment-date-input').fill(appointmentDate);
    await page.getByTestId('appointment-start-input').fill('10:00');
    await dialog.getByRole('button', { name: /Randevu Oluştur/ }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 20_000 });
    await screenshot(page, 'f15-03-randevu-olusturuldu.png');

    // ── 4) Muayene: SOAP + imza ──────────────────────────────────────────
    await page.goto('/muayene');
    await expect(page.getByTestId('muayene-page')).toBeVisible();
    await page.getByTestId('muayene-patient-search').fill('Fonzi');
    await page
      .getByTestId('muayene-patient-list')
      .getByRole('button')
      .filter({ hasText: 'Fonzi' })
      .first()
      .click();
    // Yeni hastada kayıt listesi boştur (muayene-liste-bos) — ikisinden biri görünmeli.
    await expect(
      page.getByTestId('muayene-liste').or(page.getByTestId('muayene-liste-bos')),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('muayene-yeni').click();
    await page.getByTestId('muayene-yeni-kaydet').click();
    await expect(page.getByTestId('encounter-workbench')).toBeVisible({ timeout: 15_000 });
    await page
      .getByTestId('soap-subjective')
      .fill('F15 mutlu yol — sahibi 2 gündür iştahsızlık anlatıyor.');
    await page.getByTestId('soap-objective').fill('Ateş 38.9°C, mukozalar pembe, kliniği normal');
    await page.getByTestId('soap-save').click();

    // ── 5) Hizmet: partisiz tüketim + ücret (imzadan ÖNCE — imzalı kayda yazım 409) ──
    await page.getByRole('tab', { name: 'Hizmetler' }).click();
    await page.getByTestId('service-select').click();
    await page
      .getByRole('option', { name: /Genel Muayene/ })
      .first()
      .click();
    await page.getByTestId('service-line-add').click();
    await page.getByTestId('service-record-save').click();
    await expect(page.getByTestId('service-record-finalize')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('service-record-finalize').click();
    await expect(page.getByTestId('finalize-preview')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('finalize-charge-preview')).toContainText('₺450,00');
    await page.getByTestId('finalize-confirm').click();
    await expect(page.getByTestId('service-record-charge')).toContainText('₺450,00', {
      timeout: 15_000,
    });

    // ── 5b) Hizmet: parti takipli tüketim (lot stock) ────────────────────
    await page.getByTestId('service-select').click();
    await page
      .getByRole('option', { name: /Kuduz Asısı/ })
      .first()
      .click();
    await page.getByTestId('service-line-add').click();
    await page.getByTestId('service-record-save').click();
    await expect(page.getByTestId('service-record-finalize')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('service-record-finalize').click();
    await expect(page.getByTestId('finalize-preview')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('finalize-lot-UR-KUDUZ01').click();
    await page.keyboard.press('Escape');
    await page.getByTestId('finalize-confirm').click();
    await expect(page.getByTestId('service-record-charge').nth(1)).toBeVisible({ timeout: 15_000 });

    // ── 4b) Muayene imzası (tüm hizmetler kesinleştikten sonra) ──────────
    await page.getByRole('tab', { name: 'SOAP' }).click();
    await expect(page.getByTestId('encounter-sign')).toBeEnabled({ timeout: 15_000 });
    await page.getByTestId('encounter-sign').click();
    await expect(page.getByTestId('soap-subjective')).toBeDisabled({ timeout: 15_000 });
    await screenshot(page, 'f15-04-muayene-imzalandi.png');
    await screenshot(page, 'f15-05-hizmet-ucreti-kesinlesti.png');

    // ── 6) Tahsilat: toplam 930 (450 + 480) FIFO ─────────────────────────
    await page.goto('/tahsilat');
    await expect(page.getByTestId('tahsilat-page')).toBeVisible();
    await page.getByTestId('tahsilat-yeni').click();
    await expect(page.getByTestId('owner-secici')).toBeVisible();
    await page
      .getByTestId('owner-secici')
      .getByTestId('owner-liste')
      .getByRole('button')
      .filter({ hasText: 'Fonzi E2E' })
      .first()
      .click();
    await page.getByTestId('payment-amount').fill('930');
    await expect(page.getByTestId('allocation-preview')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('payment-submit').click();
    await expect(page.getByTestId('tahsilat-page')).toContainText('Fonzi E2E', { timeout: 15_000 });
    await screenshot(page, 'f15-06-tahsilat-tam.png');

    // ── 7) PDF belge üretimi ve önizleme ─────────────────────────────────
    await page.goto('/belgeler');
    await expect(page.getByTestId('belgeler-page')).toBeVisible();
    await page.getByTestId('belge-yeni').click();
    await expect(page.getByTestId('belge-yeni-diyalog')).toBeVisible();
    await page.getByTestId('belge-kaynak-secim').click();
    await page.getByRole('option', { name: /Fonzi/ }).first().click();
    await page.getByTestId('belge-uret').click();
    await expect(page.getByTestId('belge-onizleme-diyalog')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('belge-pdf-cerceve')).toBeVisible({ timeout: 15_000 });
    await screenshot(page, 'f15-07-belge-pdf-onizleme.png');
    await page.getByRole('button', { name: 'Kapat' }).click();
  });

  test('f15-08 ayarlar lisans sekmesi görünür ve mobil kırılımda taşmaz', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/ayarlar?tab=lisans');
    await expect(page.getByTestId('lisans-karti')).toBeVisible();
    await expect(page.getByTestId('lisans-karti')).toContainText('Kalıcı (tek seferlik) lisans');
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'f15-08-lisans-karti.png');
  });
});
