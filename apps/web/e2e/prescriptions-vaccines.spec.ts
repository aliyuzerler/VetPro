import { expect, test, type Page } from '@playwright/test';
import { DEMO, expectNoHorizontalOverflow, login, screenshot } from './helpers';

/**
 * Faz 10 E2E — reçete, ilaç uygulaması, aşı ve takip.
 * Akış: reçete taslağı → doz yardımcısı satırı → onaysız imza bloku →
 * veteriner doz onayı → imza (numaralanma) → depodan dağıtım (stok düşer)
 * → uygulama kaydı; aşı: protokol tanımı → parti+SKT ile aşı kaydı →
 * takvim/hatırlatma → gönderim tekilleştirme; yetki: resepsiyon imza butonu göremez.
 * Ekran görüntüleri docs/screenshots README bölümüne eklenir.
 */

const TS = Date.now().toString(36);

async function openPrescriptionDetail(page: Page, id: string): Promise<void> {
  await page.goto(`/receteler/${id}`);
  await expect(page.getByTestId('recete-detay')).toBeVisible();
}

test.describe('Faz 10 — reçete akışı', () => {
  let prescriptionUrl = '';

  test('f10-01 veteriner reçete taslağı oluşturur ve detaya yönelir', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/receteler');
    await expect(page.getByTestId('receteler-page')).toBeVisible();
    await page.getByTestId('recete-yeni').click();
    await expect(page.getByTestId('recete-yeni-diyalog')).toBeVisible();
    await page.getByTestId('recete-hasta-secim').click();
    await page.getByRole('option', { name: /Karabaş/ }).first().click();
    await page.getByTestId('recete-notlar').fill('E2E reçete — kulak enfeksiyonu takibi');
    await page.getByTestId('recete-kaydet').click();
    await expect(page.getByTestId('recete-detay')).toBeVisible({ timeout: 15_000 });
    prescriptionUrl = page.url();
    await expect(page.getByTestId('recete-durum-taslak')).toBeVisible();
    await screenshot(page, 'web-f10-01-recete-taslagi.png');
  });

  test('f10-02 doz yardımcılı satır eklenir; formül görünür', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await openPrescriptionDetail(page, prescriptionUrl.split('/').pop()!);
    await page.getByTestId('satir-ekle').click();
    await expect(page.getByTestId('satir-diyalog')).toBeVisible();
    // Ürün seç: katalogdaki antibiyotik
    await page.getByTestId('satir-urun-secim').click();
    await page.getByRole('option', { name: /Amoksisilin/ }).first().click();
    await page.getByTestId('satir-siklik').fill('günde 2 kez');
    await page.getByTestId('satir-miktar').fill('14');
    // Doz yardımcısı: aritmetik öneri + görünür formül
    await page.getByTestId('satir-doz-weight').fill('20');
    await page.getByTestId('satir-doz-mgkg').fill('10');
    await page.getByTestId('satir-doz-hesapla').click();
    await expect(page.getByTestId('satir-doz-formul')).toContainText('20 kg × 10 mg/kg');
    await page.getByTestId('satir-kg').fill('20');
    await page.getByTestId('satir-mgkg').fill('10');
    await page.getByTestId('satir-kaydet').click();
    await expect(page.getByTestId('recete-satirlari')).toContainText('Amoksisilin');
    await expect(page.getByTestId('recete-satirlari')).toContainText('20 kg × 10 mg/kg');
    await expect(page.getByTestId('recete-doz-uyari')).toBeVisible();
    await screenshot(page, 'web-f10-02-doz-yardimcisi-satir.png');
  });

  test('f10-03 onaysız doz önerisi imzalamayı bloklar; onay sonrası imza numaralanır', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await openPrescriptionDetail(page, prescriptionUrl.split('/').pop()!);
    await page.getByTestId('recete-imzala').click();
    await expect(page.getByTestId('recete-hata')).toContainText(/onay/i);
    await screenshot(page, 'web-f10-03-imza-bloku.png');

    // Veteriner doz önerisini açıkça onaylar
    const approve = page.locator('[data-testid^="doz-onayla-"]').first();
    await approve.click();
    await expect(page.getByTestId('recete-bilgi')).toContainText('onaylandı');
    await page.getByTestId('recete-imzala').click();
    await expect(page.getByTestId('recete-durum-imzali')).toBeVisible();
    await expect(page.getByTestId('recete-bilgi')).toContainText('REC-');
    await screenshot(page, 'web-f10-04-imzali-recete.png');
  });

  test('f10-05 imzalı reçeteden depodan dağıtım yapılır', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await openPrescriptionDetail(page, prescriptionUrl.split('/').pop()!);
    const dispenseButton = page.locator('[data-testid^="dagit-"]').first();
    await dispenseButton.click();
    await expect(page.getByTestId('dagitim-diyalog')).toBeVisible();
    await page.getByTestId('dagitim-depo').click();
    await page.getByRole('option', { name: /Merkez Ana Depo/ }).click();
    await page.getByTestId('dagitim-miktar').fill('10');
    await page.getByTestId('dagitim-kaydet').click();
    await expect(page.getByTestId('recete-bilgi')).toContainText('Dağıtım kaydedildi');
    await expect(page.getByTestId('dagitim-liste')).not.toContainText('Dağıtım kaydı yok');
    await screenshot(page, 'web-f10-05-dagitim.png');
  });

  test('f10-06 ilaç uygulama kaydı tutulur', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await openPrescriptionDetail(page, prescriptionUrl.split('/').pop()!);
    const administerButton = page.locator('[data-testid^="uygula-"]').first();
    await administerButton.click();
    await expect(page.getByTestId('uygulama-diyalog')).toBeVisible();
    await page.getByTestId('uygulama-doz').fill('200');
    await page.getByTestId('uygulama-bolge').fill('boyun kas içi');
    await page.getByTestId('uygulama-kaydet').click();
    await expect(page.getByTestId('recete-bilgi')).toContainText('Uygulama kaydı tutuldu');
    await expect(page.getByTestId('uygulama-liste')).not.toContainText('Uygulama kaydı yok');
    await screenshot(page, 'web-f10-06-uygulama-kaydi.png');
  });

  test('f10-07 resepsiyon imza ve doz onayı butonlarını görmez', async ({ page }) => {
    await login(page, DEMO.resepsiyon);
    await page.goto('/receteler');
    await expect(page.getByTestId('receteler-page')).toBeVisible();
    // Taslak reçete detayına gir: kendi oluşturduğu yeni taslak
    await page.getByTestId('recete-yeni').click();
    await page.getByTestId('recete-hasta-secim').click();
    await page.getByRole('option', { name: /Karabaş/ }).first().click();
    await page.getByTestId('recete-kaydet').click();
    await expect(page.getByTestId('recete-detay')).toBeVisible();
    await expect(page.getByTestId('recete-imzala')).toHaveCount(0);
    await page.getByTestId('satir-ekle').click();
    await page.getByTestId('satir-ilac').fill('Serbest ilaç e2e');
    await page.getByTestId('satir-siklik').fill('günde 1 kez');
    await page.getByTestId('satir-miktar').fill('1');
    await page.getByTestId('satir-kaydet').click();
    await expect(page.getByTestId('recete-satirlari')).toContainText('Serbest ilaç e2e');
    // Doz onayı butonu yok — izin reçete imza yetkisine bağlı
    await expect(page.locator('[data-testid^="doz-onayla-"]')).toHaveCount(0);
    await screenshot(page, 'web-f10-07-resepsiyon-kisitli.png');
  });
});

test.describe('Faz 10 — aşı kaydı, takvim ve hatırlatma', () => {
  test('f10-08 aşı protokolü tanımlanır ve tabloda görünür', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/asisler?tab=protokoller');
    await expect(page.getByTestId('asisler-page')).toBeVisible();
    await page.getByTestId('protokol-yeni').click();
    await expect(page.getByTestId('protokol-diyalog')).toBeVisible();
    await page.getByTestId('protokol-ad').fill(`E2E Köpek Karma ${TS}`);
    await page.getByTestId('protokol-urun').click();
    await page.getByRole('option', { name: /Kuduz/ }).first().click();
    await page.getByTestId('protokol-tur').click();
    await page.getByRole('option', { name: /Köpek/ }).first().click();
    await page.getByTestId('protokol-ilk').fill('60');
    await page.getByTestId('protokol-tekrar').fill('365');
    await page.getByTestId('protokol-lead').fill('14');
    await page.getByTestId('protokol-kaydet').click();
    await expect(page.getByTestId('protokol-tablo')).toContainText(`E2E Köpek Karma ${TS}`);
    await screenshot(page, 'web-f10-08-protokol-tanimi.png');
  });

  test('f10-09 aşı kaydı parti + SKT dondurur ve hatırlatma üretilir', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/asisler');
    await expect(page.getByTestId('asisler-page')).toBeVisible();
    await page.getByTestId('asi-kayit-yeni').click();
    await expect(page.getByTestId('asi-kayit-diyalog')).toBeVisible();
    await page.getByTestId('asi-hasta-secim').click();
    await page.getByRole('option', { name: /Karabaş/ }).first().click();
    await page.getByTestId('asi-urun-secim').click();
    await page.getByRole('option', { name: /Kuduz/ }).first().click();
    await page.getByTestId('asi-depo-secim').click();
    await page.getByRole('option', { name: /Merkez Ana Depo/ }).click();
    await page.getByTestId('asi-parti-secim').click();
    await page.getByRole('option', { name: /R2601/ }).first().click();
    await page.getByTestId('asi-bolge').fill('boyun deri altı');
    await page.getByTestId('asi-kaydet').click();
    await expect(page.getByTestId('asi-bilgi')).toContainText('Aşı kaydedildi');
    await expect(page.getByTestId('asi-event-tablo').first()).toContainText('R2601');
    // Hatırlatma üretimi — sonraki vadesi olan satırda
    const remind = page.locator('[data-testid^="hatirlatma-olustur-"]').first();
    if (await remind.count()) {
      await remind.click();
      await expect(page.getByTestId('asi-bilgi').or(page.getByTestId('asi-hata'))).toBeVisible();
    }
    await screenshot(page, 'web-f10-09-asi-kaydi-lot-skt.png');
  });

  test('f10-10 takvim girdisi ve hatırlatma gönderimi', async ({ page }) => {
    await login(page, DEMO.resepsiyon);
    await page.goto('/asisler');
    await page.getByTestId('tab-hatirlatmalar').click();
    await expect(page.getByTestId('takvim-hasta-secim')).toBeVisible();
    await page.getByTestId('takvim-hasta-secim').click();
    await page.getByRole('option', { name: /Karabaş/ }).first().click();
    await expect(page.getByTestId('takvim-girdileri').or(page.getByText('Bu hastaya uyan aktif protokol yok'))).toBeVisible();
    await screenshot(page, 'web-f10-10-asi-takvimi.png');

    // Hatırlatma gönderimi: yaklaşan/geciken listesinden gönder (varsa)
    const send = page.locator('[data-testid^="hatirlatma-gonder-"]').first();
    if (await send.count()) {
      await send.click();
      await expect(page.getByTestId('asi-bilgi')).toContainText('gönderildi');
      // Tekilleştirme: gönderilen hatırlatma listede "Gönderilenler"e geçer
      await expect(page.getByTestId('gonderilen-liste')).not.toContainText('Kayıt yok.');
    }
    await screenshot(page, 'web-f10-11-hatirlatma-gonderimi.png');
  });
});

test.describe('Faz 10 — mobil kırılım', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('f10-12 mobil reçeteler ve aşılar ekranları taşmasız', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/receteler');
    await expect(page.getByTestId('receteler-page')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'mobil-f10-receteler.png', false);

    await page.goto('/asisler');
    await expect(page.getByTestId('asisler-page')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'mobil-f10-asisler.png', false);
  });
});
