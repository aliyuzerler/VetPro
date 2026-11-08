import { expect, test, type Page } from '@playwright/test';
import { DEMO, expectNoHorizontalOverflow, login, screenshot } from './helpers';

/**
 * Faz 11 E2E — laboratuvar, cerrahi ve yatış.
 * Akış: lab isteği → numune → analiz → kritik sonuç uyarısı → onay;
 * cerrahi plan → hazırlık + kontrol listesi kilidi → ameliyat → iyileşme →
 * tamamlama; yatış kabul → kennel doluluk önlemi → gözlem → tedavi sarfı
 * (stok düşer) → transfer → taburculuk; yetki: stok rolü modülleri göremez,
 * resepsiyon kritik onaylayamaz. Ekran görüntüleri docs/screenshots'a kopyalanır.
 */

test.describe('Faz 11 — laboratuvar akışı', () => {
  test('f11-01 veteriner lab isteği oluşturur', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/laboratuvar');
    await expect(page.getByTestId('laboratuvar-page')).toBeVisible();
    await page.getByTestId('lab-yeni').click();
    await expect(page.getByTestId('lab-yeni-diyalog')).toBeVisible();
    await page.getByTestId('lab-hasta-secim').click();
    await page.getByRole('option', { name: /Karabaş/ }).first().click();
    await page.getByTestId('lab-test-secim').click();
    await page.getByRole('option', { name: /Hemogram/ }).first().click();
    await page.getByTestId('lab-vet-secim').click();
    await page.getByRole('option', { name: /Ayşe Demir/ }).first().click();
    await page.getByTestId('lab-not').fill('E2E istek — rutin hemogram');
    await page.getByTestId('lab-kaydet').click();
    await expect(page.getByTestId('lab-tablo')).toContainText('İstendi', { timeout: 15_000 });
    await screenshot(page, 'web-f11-01-lab-istegi.png');
  });

  test('f11-02 numune → analiz → kritik sonuç akışı', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/laboratuvar');
    await expect(page.getByTestId('lab-tablo')).toBeVisible();
    // İstendi durumundaki ilk satırı aç (f11-01'de üretilen)
    await page.getByTestId('lab-satir').first().click();
    await expect(page.getByTestId('lab-detay-diyalog')).toBeVisible();
    await page.getByTestId('lab-numune-al').click();
    await expect(page.getByTestId('lab-detay-diyalog')).toContainText('Numune Alındı', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('lab-numune-kod')).toContainText('LAB-');
    await screenshot(page, 'web-f11-02-numune-alindi.png');

    await page.getByTestId('lab-analiz-baslat').click();
    await expect(page.getByTestId('lab-detay-diyalog')).toContainText('Analizde', {
      timeout: 15_000,
    });
    // Kritik düşük değer: CBC kritik alt eşik 2.5 — 1.8 girilir
    await page.getByTestId('lab-sonuc-deger').fill('1.8');
    await page.getByTestId('lab-sonuc-gir').click();
    await expect(page.getByTestId('lab-sonuc-ozet')).toContainText('Kritik düşük', {
      timeout: 15_000,
    });
    await screenshot(page, 'web-f11-03-kritik-sonuc.png');
  });

  test('f11-04 kritik uyarı yetkili klinisyen ekranında belirir ve onaylanır', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/laboratuvar');
    await expect(page.getByTestId('lab-kritik-panel')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('lab-kritik-satir').first()).toBeVisible();
    await screenshot(page, 'web-f11-04-kritik-uyari-paneli.png');
    await page.getByTestId('lab-kritik-onayla').first().click();
    // Tüm açık kritikler onaylanır; panel tamamen boşalır (reload ile doğrulanır)
    await page.reload();
    await expect(page.getByTestId('laboratuvar-page')).toBeVisible();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const panelCount = await page.getByTestId('lab-kritik-panel').count();
      const rowCount = await page.getByTestId('lab-kritik-satir').count();
      if (panelCount === 0 || rowCount === 0) break;
      await page.getByTestId('lab-kritik-onayla').first().click();
      await page.reload();
      await expect(page.getByTestId('laboratuvar-page')).toBeVisible();
    }
    await expect(page.getByTestId('lab-kritik-panel')).toHaveCount(0, { timeout: 15_000 });
  });

  test('f11-05 resepsiyon uyarıyı görür, onaylayamaz', async ({ page }) => {
    await login(page, DEMO.resepsiyon);
    await page.goto('/laboratuvar');
    await expect(page.getByTestId('laboratuvar-page')).toBeVisible();
    await screenshot(page, 'web-f11-05-resepsiyon-kisitli.png');
    // Kritik panel boşsa yeni kritik üret: istek → akış → kritik değer
    const hasCritical = await page.getByTestId('lab-kritik-panel').count();
    if (hasCritical === 0) {
      // Yalnız 'İstendi' filtresiyle çalış; en yeni sipariş ilk satırdır
      await page.getByTestId('lab-durum-filtre').click();
      await page.getByRole('option', { name: 'İstendi' }).click();
      await page.getByTestId('lab-yeni').click();
      await page.getByTestId('lab-hasta-secim').click();
      await page.getByRole('option', { name: /Karabaş/ }).first().click();
      await page.getByTestId('lab-test-secim').click();
      await page.getByRole('option', { name: /Hemogram/ }).first().click();
      await page.getByTestId('lab-vet-secim').click();
      await page.getByRole('option', { name: /Ayşe Demir/ }).first().click();
      await page.getByTestId('lab-kaydet').click();
      await expect(page.getByTestId('lab-tablo')).toContainText('İstendi', { timeout: 15_000 });
      await page.getByTestId('lab-satir').first().click();
      await page.getByTestId('lab-numune-al').click();
      await expect(page.getByTestId('lab-detay-diyalog')).toContainText('Numune Alındı');
      await page.getByTestId('lab-analiz-baslat').click();
      await expect(page.getByTestId('lab-detay-diyalog')).toContainText('Analizde');
      await page.getByTestId('lab-sonuc-deger').fill('1.6');
      await page.getByTestId('lab-sonuc-gir').click();
      await expect(page.getByTestId('lab-sonuc-ozet')).toContainText('Kritik düşük');
      await page.keyboard.press('Escape');
    }
    await expect(page.getByTestId('lab-kritik-panel')).toBeVisible();
    // resepsiyon'da onay butonu yok; yetki metni var
    await expect(page.getByTestId('lab-kritik-panel')).toContainText('Onay yetkisi: veteriner hekim');
    await expect(page.getByTestId('lab-kritik-onayla')).toHaveCount(0);
  });
});

test.describe('Faz 11 — cerrahi akışı', () => {
  test('f11-06 cerrahi planı hazırlığa geçer; kontrol listesi tamamlanmadan başlatılamaz', async ({
    page,
  }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/cerrahi');
    await expect(page.getByTestId('cerrahi-page')).toBeVisible();
    await page.getByTestId('cerrahi-yeni').click();
    await expect(page.getByTestId('cerrahi-yeni-diyalog')).toBeVisible();
    await page.getByTestId('cerrahi-hasta-secim').click();
    await page.getByRole('option', { name: /Karabaş/ }).first().click();
    await page.getByTestId('cerrahi-vet-secim').click();
    await page.getByRole('option', { name: /Ayşe Demir/ }).first().click();
    await page.getByTestId('cerrahi-prosedur').fill('E2E kısırlaştırma operasyonu');
    const start = new Date(Date.now() + 24 * 3600 * 1000);
    const local = new Date(start.getTime() - start.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    await page.getByTestId('cerrahi-tarih').fill(local);
    await page.getByTestId('cerrahi-kaydet').click();
    await expect(page.getByTestId('cerrahi-tablo')).toContainText('Planlandı', {
      timeout: 15_000,
    });
    await screenshot(page, 'web-f11-06-cerrahi-plani.png');

    await page.getByTestId('cerrahi-satir').first().click();
    await expect(page.getByTestId('cerrahi-detay-diyalog')).toBeVisible();
    await page.getByTestId('cerrahi-hazirliga-gec').click();
    await expect(page.getByTestId('cerrahi-pre-liste')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('cerrahi-pre-liste')).toContainText('0/5');

    // Liste tamamlanmadan başlatma bloklanır
    await page.getByTestId('cerrahi-baslat').click();
    await expect(
      page
        .locator('[role="alert"]')
        .filter({ hasText: 'kontrol listesindeki tüm maddeler' })
        .first(),
    ).toBeVisible({ timeout: 15_000 });
    await screenshot(page, 'web-f11-07-checklist-bloku.png');
  });

  test('f11-07 maddeler işaretlenir; ameliyat → iyileşme → tamamlanma', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/cerrahi');
    await page.getByTestId('cerrahi-satir').first().click();
    await expect(page.getByTestId('cerrahi-detay-diyalog')).toBeVisible();

    // Anestezi çizelgesini doldur
    await page.getByTestId('anestezi-asa-secim').click();
    await page.getByRole('option', { name: 'ASA II', exact: true }).click();
    await page.locator('#anestezi-induksiyon').fill('Propofol');
    await page.locator('#anestezi-idame').fill('İzofluran');
    await page.getByTestId('anestezi-kaydet').click();
    await expect(page.getByTestId('cerrahi-anestezi')).toContainText('ASA II', { timeout: 15_000 });
    await screenshot(page, 'web-f11-08-anestezi-cizelgesi.png');

    // Tüm pre maddelerini işaretle
    for (let index = 0; index < 5; index += 1) {
      await page.getByTestId(`cerrahi-pre-madde-${index}`).click();
    }
    await expect(page.getByTestId('cerrahi-pre-liste')).toContainText('5/5', { timeout: 15_000 });
    await page.getByTestId('cerrahi-baslat').click();
    await expect(page.getByTestId('cerrahi-detay-diyalog')).toContainText('Ameliyatta', {
      timeout: 15_000,
    });
    await page.getByTestId('cerrahi-iyilesme').click();
    await expect(page.getByTestId('cerrahi-detay-diyalog')).toContainText('İyileşmede', {
      timeout: 15_000,
    });
    await page.getByTestId('cerrahi-tamamla').click();
    await expect(page.getByTestId('cerrahi-detay-diyalog')).toContainText('Tamamlandı', {
      timeout: 15_000,
    });
    await screenshot(page, 'web-f11-09-ameliyat-tamamlandi.png');
  });
});

test.describe('Faz 11 — yatış akışı', () => {
  test('f11-08 yatış kabulü; dolu kennel seçim listesinde görünmez', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/yatis');
    await expect(page.getByTestId('yatis-page')).toBeVisible();
    await page.getByTestId('yatis-yeni').click();
    await expect(page.getByTestId('yatis-yeni-diyalog')).toBeVisible();
    await page.getByTestId('yatis-hasta-secim').click();
    await page.getByRole('option', { name: /Karabaş/ }).first().click();
    await page.getByTestId('yatis-kennel-secim').click();
    await page.getByRole('option').first().click();
    await page.getByTestId('yatis-vet-secim').click();
    await page.getByRole('option', { name: /Ayşe Demir/ }).first().click();
    await page.getByTestId('yatis-gerekce').fill('E2E yatış — sıvı tedavisi gözlemi');
    await page.getByTestId('yatis-kabul-kaydet').click();
    await expect(page.getByTestId('yatis-kartlar')).toContainText('Karabaş', { timeout: 15_000 });
    await screenshot(page, 'web-f11-10-yatis-kabulu.png');

    // Dolu kennel yeni kabul listesinde sunulmaz (UI düzeyi çakışma önlemi)
    await page.getByTestId('yatis-yeni').click();
    await page.getByTestId('yatis-hasta-secim').click();
    await page.getByRole('option', { name: /Karabaş/ }).first().click();
    await page.getByTestId('yatis-kennel-secim').click();
    const optionTexts = await page.getByRole('option').allTextContents();
    expect(optionTexts.join(' ')).not.toContain('K-01 —');
    await page.keyboard.press('Escape');
    // Kennel şeridi dolu rozetini gösterir
    await expect(page.getByTestId('kennel-seridi')).toBeVisible();
    await screenshot(page, 'web-f11-11-kennel-dolulugu.png');
  });

  test('f11-09 günlük gözlem ve stoklu tedavi sarfı', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/yatis');
    await expect(page.getByTestId('yatis-kart').first()).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('yatis-kart').first().click();
    await expect(page.getByTestId('yatis-detay-diyalog')).toBeVisible();

    // Günlük vital gözlemi
    await page.getByTestId('gozlem-temp').fill('39.1');
    await page.getByTestId('gozlem-kalp').fill('112');
    await page.getByTestId('gozlem-not').fill('İştah arttı, genel durum iyi');
    await page.getByTestId('gozlem-kaydet').click();
    await expect(page.getByTestId('yatis-gozlem-liste')).toContainText('39.1', { timeout: 15_000 });
    await screenshot(page, 'web-f11-12-gozlem-kaydi.png');

    // Tedavi sarfı — ürün + depo + miktar
    await page.getByTestId('tedavi-urun-secim').click();
    await page.getByRole('option', { name: /Amoksisilin/ }).first().click();
    await page.getByTestId('tedavi-depo-secim').click();
    await page.getByRole('option', { name: /Merkez Ana Depo/ }).click();
    await page.getByTestId('tedavi-miktar').fill('1');
    await page.getByTestId('tedavi-doz').fill('0.5 ml SC');
    await page.getByTestId('tedavi-kaydet').click();
    await expect(page.getByTestId('yatis-tedavi-liste')).toContainText('stok düşüldü', {
      timeout: 15_000,
    });
    await screenshot(page, 'web-f11-13-tedavi-sarfi.png');
  });

  test('f11-10 kennel transferi ve taburculuk', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/yatis');
    await expect(page.getByTestId('yatis-kart').first()).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('yatis-kart').first().click();
    await expect(page.getByTestId('yatis-detay-diyalog')).toBeVisible();

    // Boş kennel varsa transfer; yoksa atla
    const transferOptions = page.getByTestId('transfer-kennel-secim');
    await transferOptions.click();
    const optionCount = await page.getByRole('option').count();
    await page.keyboard.press('Escape');
    if (optionCount > 0) {
      await transferOptions.click();
      await page.getByRole('option').first().click();
      await page.getByTestId('transfer-yap').click();
      await expect(page.getByTestId('yatis-detay-diyalog')).toContainText('Transfer', {
        timeout: 15_000,
      });
    }

    // Taburculuk — özet zorunlu (boş özetle düğme pasiftir, API 400 döner)
    await page.getByTestId('taburculuk-ozet').fill('Genel durum iyi, tedavi tamamlandı, taburcu edildi');
    await page.getByTestId('taburcu-et').click();
    await expect(page.getByTestId('yatis-taburcu-ozet')).toBeVisible({ timeout: 15_000 });
    await screenshot(page, 'web-f11-14-taburculuk.png');
  });

  test('f11-11 stok rolü lab/cerrahi/yatış modüllerini göremez', async ({ page }) => {
    await login(page, DEMO.stok);
    await page.goto('/laboratuvar');
    await expect(page.getByTestId('laboratuvar-page')).toContainText('Yetkiniz yok');
    await page.goto('/cerrahi');
    await expect(page.getByTestId('cerrahi-page')).toContainText('Yetkiniz yok');
    await page.goto('/yatis');
    await expect(page.getByTestId('yatis-page')).toContainText('Yetkiniz yok');
    await screenshot(page, 'web-f11-15-yetkisiz-moduller.png');
  });

  test('f11-12 mobil laboratuvar, cerrahi ve yatış ekranları taşmasız', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/laboratuvar');
    await expect(page.getByTestId('laboratuvar-page')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'mobil-f11-laboratuvar.png', false);

    await page.goto('/cerrahi');
    await expect(page.getByTestId('cerrahi-page')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'mobil-f11-cerrahi.png', false);

    await page.goto('/yatis');
    await expect(page.getByTestId('yatis-page')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'mobil-f11-yatis.png', false);
  });
});
