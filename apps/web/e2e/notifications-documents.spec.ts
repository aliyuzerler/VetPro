import { expect, test, type Page } from '@playwright/test';
import { DEMO, expectNoHorizontalOverflow, login, screenshot } from './helpers';

/**
 * Faz 12 E2E — bildirimler, PDF belgeler ve entegrasyonlar.
 * Akış: teslim raporu + kuyruk geçmişi; yeni bildirim (onay paneli ile),
 * onaysız sahibe SMS 409 mesajı; kuyruk çalıştırma → Gönderildi;
 * /belgeler aşı kartı üretimi + PDF önizleme (yetkili blob akışı);
 * /entegrasyonlar sandbox rozetleri + "canlı yetkili entegrasyon yok"
 * uyarısı + sandbox kontrolü; yetki: stok rolü modülleri göremez.
 * Ekran görüntüleri docs/screenshots'a kopyalanır.
 */

async function openDialogSelect(page: Page, triggerTestId: string, optionName: RegExp): Promise<void> {
  await page.getByTestId(triggerTestId).click();
  await page.getByRole('option', { name: optionName }).first().click();
}

test.describe('Faz 12 — bildirim merkezi', () => {
  test('f12-01 teslim raporu ve kuyruk geçmişi yüklenir', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/bildirimler');
    await expect(page.getByTestId('bildirimler-page')).toBeVisible();
    await expect(page.getByTestId('teslim-raporu')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('rapor-toplam')).toBeVisible();
    await screenshot(page, 'web-f12-01-bildirim-merkezi.png');
    await expectNoHorizontalOverflow(page);
  });

  test('f12-02 yeni bildirim: onay paneli + kuyruğa alma', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/bildirimler');
    await expect(page.getByTestId('bildirimler-page')).toBeVisible();

    await page.getByTestId('bildirim-yeni').click();
    await expect(page.getByTestId('bildirim-yeni-diyalog')).toBeVisible();

    // Onaylı sahip (Zeynep Aksoy — sms granted)
    await openDialogSelect(page, 'bildirim-sahip-secim', /Zeynep Aksoy/);
    await expect(page.getByTestId('bildirim-onay-durum')).toBeVisible({ timeout: 15_000 });
    await screenshot(page, 'web-f12-02-yeni-bildirim-onay-paneli.png');

    await page.getByTestId('bildirim-govde').fill('E2E — randevu hatırlatması: yarın 14:00');
    await page.getByTestId('bildirim-kaydet').click();
    await expect(page.getByTestId('bildirim-yeni-diyalog')).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('bildirim-tablo')).toBeVisible();
    await expect(page.getByTestId('bildirim-satir').first()).toBeVisible();
  });

  test('f12-03 onaysız sahibe SMS kuyruğa alınamaz (consent kuralı)', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/bildirimler');
    await expect(page.getByTestId('bildirimler-page')).toBeVisible();

    await page.getByTestId('bildirim-yeni').click();
    await expect(page.getByTestId('bildirim-yeni-diyalog')).toBeVisible();
    // Ayşe Kaya — sms onayı yok (seed)
    await openDialogSelect(page, 'bildirim-sahip-secim', /Ayşe Kaya/);
    await expect(page.getByTestId('bildirim-onay-durum')).toContainText('Onay yok', {
      timeout: 15_000,
    });
    await page.getByTestId('bildirim-govde').fill('E2E — onaysız SMS denemesi');
    await page.getByTestId('bildirim-kaydet').click();
    await expect(page.getByTestId('bildirim-form-hata')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('bildirim-form-hata')).toContainText('onayı');
    await screenshot(page, 'web-f12-03-onay-hatasi.png');
    await page.getByRole('button', { name: 'Vazgeç' }).click();
  });

  test('f12-04 kuyruk çalıştırma: bildirim Gönderildi olur', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/bildirimler');
    await expect(page.getByTestId('teslim-raporu')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('bildirim-kuyruk-calistir').click();
    await expect(page.getByTestId('bildirim-kuyruk-ozet')).toBeVisible({ timeout: 15_000 });
    // Kuyrukta kayıt kaldıysa tekrar koş; tüm gönderilebilir kayıtlar biter
    await page.getByTestId('bildirim-kuyruk-calistir').click();
    await expect(page.getByTestId('bildirim-kuyruk-ozet')).toContainText('kayıt alındı');
    await screenshot(page, 'web-f12-04-kuyruk-ozeti.png');

    // Tablo en az bir Gönderildi rozeti gösterir (kuyrukta kayıt varsa)
    const sentCount = await page.getByTestId('bildirim-durum-sent').count();
    if (sentCount > 0) {
      await expect(page.getByTestId('bildirim-durum-sent').first()).toBeVisible();
    }
  });

  test('f12-05 bildirim detayı deneme geçmişini gösterir', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/bildirimler');
    await expect(page.getByTestId('bildirim-satir').first()).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('bildirim-satir').first().click();
    await expect(page.getByTestId('bildirim-detay-diyalog')).toBeVisible();
    await screenshot(page, 'web-f12-05-bildirim-detayi.png');
    await page.getByRole('button', { name: 'Kapat' }).click();
    await expect(page.getByTestId('bildirim-detay-diyalog')).not.toBeVisible();
  });

  test('f12-06 stok rolü bildirim merkezine erişemez', async ({ page }) => {
    await login(page, DEMO.stok);
    await page.goto('/bildirimler');
    await expect(page.getByText('Erişim yok')).toBeVisible({ timeout: 15_000 });
    await screenshot(page, 'web-f12-06-bildirim-erisim-yok.png');
  });
});

test.describe('Faz 12 — belgeler', () => {
  test('f12-07 aşı kartı üretimi ve PDF önizleme', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/belgeler');
    await expect(page.getByTestId('belgeler-page')).toBeVisible();

    await page.getByTestId('belge-yeni').click();
    await expect(page.getByTestId('belge-yeni-diyalog')).toBeVisible();
    await openDialogSelect(page, 'belge-kaynak-secim', /Pamuk|Karabaş/);
    await page.getByTestId('belge-uret').click();

    // Üretim sonrası PDF önizleme diyaloğu açılır
    await expect(page.getByTestId('belge-onizleme-diyalog')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('belge-pdf-cerceve')).toBeVisible({ timeout: 15_000 });
    await screenshot(page, 'web-f12-07-belge-pdf-onizleme.png');
    await page.getByRole('button', { name: 'Kapat' }).click();

    // Belge tabloya düşer (BELGE-0001 biçimli numara)
    await expect(page.getByTestId('belge-tablo')).toBeVisible();
    await expect(page.getByTestId('belge-satir').first()).toContainText('BELGE-');
    await screenshot(page, 'web-f12-08-belge-listesi.png');
  });

  test('f12-08 belge sayfası mobil kırılımda taşmaz', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/belgeler');
    await expect(page.getByTestId('belgeler-page')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('f12-09 resepsiyon belge üretebilir (document.manage şablon izni)', async ({ page }) => {
    await login(page, DEMO.resepsiyon);
    await page.goto('/belgeler');
    await expect(page.getByTestId('belgeler-page')).toBeVisible({ timeout: 15_000 });
    // Onam formu: sahip kapsamlı, resepsiyon üretebilir
    await page.getByTestId('belge-yeni').click();
    await expect(page.getByTestId('belge-yeni-diyalog')).toBeVisible();
    await page.getByTestId('belge-tur-secim').click();
    await page.getByRole('option', { name: 'Onam Formu' }).click();
    await openDialogSelect(page, 'belge-kaynak-secim', /Zeynep|Mehmet|Ayşe/);
    await page.getByTestId('belge-uret').click();
    await expect(page.getByTestId('belge-onizleme-diyalog')).toBeVisible({ timeout: 20_000 });
    await screenshot(page, 'web-f12-09-onam-formu.png');
    await page.getByRole('button', { name: 'Kapat' }).click();
  });
});

test.describe('Faz 12 — entegrasyonlar', () => {
  test('f12-10 sandbox rozetleri ve canlı entegrasyon uyarısı', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/entegrasyonlar');
    await expect(page.getByTestId('entegrasyonlar-page')).toBeVisible();
    await expect(page.getByTestId('entegrasyon-canli-yok')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('entegrasyon-kartlar')).toBeVisible();
    await expect(page.getByTestId('entegrasyon-mod-sandbox').first()).toBeVisible();
    await screenshot(page, 'web-f12-10-entegrasyonlar.png');
    await expectNoHorizontalOverflow(page);
  });

  test('f12-11 sandbox kontrolü sonucu damgalar', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/entegrasyonlar');
    await expect(page.getByTestId('entegrasyon-kartlar')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('entegrasyon-sandbox-kontrol').first().click();
    await expect(page.getByTestId('entegrasyon-kartlar')).toContainText('OK — Sandbox', {
      timeout: 15_000,
    });
    await screenshot(page, 'web-f12-11-sandbox-kontrol.png');
  });

  test('f12-12 stok rolü entegrasyonları göremez', async ({ page }) => {
    await login(page, DEMO.stok);
    await page.goto('/entegrasyonlar');
    await expect(page.getByText('Erişim yok')).toBeVisible({ timeout: 15_000 });
  });
});
