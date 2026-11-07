import { expect, test } from '@playwright/test';
import { DEMO, expectNoHorizontalOverflow, login, screenshot } from './helpers';

/**
 * VetCore Faz 04 — hasta sahibi ve hayvan hasta yönetimi E2E testleri.
 * Kapsam: sahip listesi/arama, mükerrer uyarı akışı, çoklu hasta, uyarı rozetleri,
 * mikroçip araması, hasta detayı (uyarı/kilo/dosya/zaman çizelgesi), arşiv akışı,
 * yetkisiz şube görünümü.
 * Ekran görüntüleri e2e/screenshots/ altına yazılır (ADR-013, repoya commit).
 */

/**
 * Proje bazlı isimler: masaüstü ve mobil koşumlar aynı veritabanını sırayla paylaşır;
 * ad çakışmasını (mükerrer uyarıda iki aday / strict-mode ihlali) önler.
 */
function testOwner() {
  const isMobile = test.info().project.name === 'chromium-mobile';
  return {
    firstName: 'E2E',
    lastName: isMobile ? 'Mobil Sahibi' : 'Test Sahibi',
    fullName: isMobile ? 'E2E Mobil Sahibi' : 'E2E Test Sahibi',
    // Telefon her iki koşumda da Zeynep Aksoy ile aynı: mükerrer uyarı senaryosu.
    phone: '0532 111 22 33',
  };
}

function patientNames() {
  const isMobile = test.info().project.name === 'chromium-mobile';
  return {
    first: isMobile ? 'E2E Pati Mobil' : 'E2E Pati',
    second: isMobile ? 'E2E Topuk Mobil' : 'E2E Topuk',
    // Mikroçip klinik içinde tekildir; masaüstü ve mobil koşumlar aynı DB'yi
    // paylaştığı için farklı seri kullanılır (409 çakışmasını önler).
    microchip: isMobile ? '985199900000089' : '985199900000099',
  };
}

test.describe('Faz 04 — sahip listesi ve mükerrer akışı (masaüstü)', () => {
  test('01 — sahip listesi seed verisiyle yüklenir', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/sahipler');
    await expect(page.getByTestId('owner-list')).toBeVisible();
    await expect(page.getByText('Zeynep Aksoy')).toBeVisible();
    await expect(page.getByText('Mehmet Yılmaz')).toBeVisible();
    await expect(page.getByText('Ayşe Kaya')).toBeVisible();
    await screenshot(page, 'f04-01-sahipler-listesi.png');
  });

  test('02 — telefon normalize araması biçimden bağımsız çalışır', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/sahipler');
    await page.getByTestId('owner-search').fill('0532 111 22 33');
    await expect(page.getByText('Zeynep Aksoy')).toBeVisible();
    await expect(page.getByText('Mehmet Yılmaz')).not.toBeVisible();
    await screenshot(page, 'f04-02-sahip-telefon-aramasi.png');
  });

  test('03 — mükerrer uyarısı gösterilir ve açık onayla kayıt devam eder', async ({ page }) => {
    const owner = testOwner();
    await login(page, DEMO.admin);
    await page.goto('/sahipler');
    await page.getByTestId('owner-create-button').click();
    await page.getByLabel('Ad', { exact: true }).fill(owner.firstName);
    await page.getByLabel('Soyad', { exact: true }).fill(owner.lastName);
    await page.getByLabel('Telefon', { exact: true }).fill(owner.phone);
    await page.getByRole('button', { name: 'Kaydı kontrol et' }).click();

    // Aynı telefon → mükerrer uyarısı (otomatik merge yok)
    const warning = page.getByTestId('duplicate-warning');
    await expect(warning).toBeVisible();
    await expect(warning.getByText('Zeynep Aksoy')).toBeVisible();
    await expect(warning.getByText('Aynı telefon').first()).toBeVisible();
    await screenshot(page, 'f04-03-mukerrer-uyarisi.png');

    await page.getByTestId('duplicate-proceed').click();
    await expect(page.getByTestId('owner-detail')).toBeVisible();
    await expect(page.getByRole('heading', { name: new RegExp(owner.fullName) })).toBeVisible();
  });

  test('04 — sahip altına iki hasta eklenir (çoklu hasta ilişkisi)', async ({ page }) => {
    const owner = testOwner();
    const names = patientNames();
    await login(page, DEMO.admin);
    await page.goto('/sahipler');
    await page.getByTestId('owner-search').fill(owner.fullName);
    await page.getByText(owner.fullName).click();
    await expect(page.getByTestId('owner-detail')).toBeVisible();

    // Birinci hasta
    await page.getByTestId('add-patient-button').click();
    await page.getByLabel('Hasta adı').fill(names.first);
    await page.getByTestId('patient-species').click();
    await page.getByRole('option', { name: 'Kedi' }).click();
    await page.getByTestId('patient-breed').click();
    await page.getByRole('option', { name: 'Tekir' }).click();
    await page.getByLabel('Mikroçip (opsiyonel)').fill(names.microchip);
    await page.getByLabel('İlk kilo — kg (opsiyonel)').fill('4.1');
    await page.getByTestId('patient-form-submit').click();
    await expect(page.getByTestId('owner-patients')).toContainText(names.first);
    await screenshot(page, 'f04-04-yeni-hasta-eklendi.png');

    // İkinci hasta — aynı sahibe, başlangıç uyarısıyla
    await page.getByTestId('add-patient-button').click();
    await page.getByLabel('Hasta adı').fill(names.second);
    await page.getByTestId('patient-species').click();
    await page.getByRole('option', { name: 'Köpek' }).click();
    await page.getByLabel('Uyarı etiketi').fill('Test alerjisi');
    await page.getByTestId('patient-form-submit').click();
    await expect(page.getByTestId('owner-patients')).toContainText(names.second);
    await expect(page.getByTestId('owner-patients')).toContainText('Test alerjisi');
  });

  test('05 — hasta listesi uyarı rozetleri ve mikroçip araması', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/hastalar');
    await expect(page.getByTestId('patient-list')).toBeVisible();

    // Kabul kriteri: alerji/kronik uyarılar listede görünür
    await expect(page.getByText('Kuduz aşısı sonrası reaksiyon')).toBeVisible();
    await expect(page.getByText('Kronik böbrek yetmezliği')).toBeVisible();
    await screenshot(page, 'f04-05-hasta-listesi-uyarilar.png');

    // Mikroçip araması (normalize — boşluklu biçim)
    await page.getByTestId('patient-search').fill('985101000000003');
    await expect(page.getByTestId('patient-row-HP-0003')).toBeVisible();
    await expect(page.getByTestId('patient-row-HP-0001')).not.toBeVisible();

    // Hasta kodu araması
    await page.getByTestId('patient-search').fill('HP-0001');
    await expect(page.getByText('Pamuk')).toBeVisible();
  });

  test('06 — hasta detayı: uyarı ekle/çöz, kilo kaydı, zaman çizelgesi', async ({ page }) => {
    // Proje sonekli etiket: masaüstü/mobil aynı DB'yi sırayla paylaşır; çözülen
    // uyarı bölümde kalır → çakışmasın (testOwner/patientNames ile aynı desen).
    const isMobile = test.info().project.name === 'chromium-mobile';
    const alertLabel = isMobile ? 'E2E geçici uyarı mobil' : 'E2E geçici uyarı';
    await login(page, DEMO.admin);
    await page.goto('/hastalar');
    // Duman (HP-0003) satırına doğrudan git
    await page.getByTestId('patient-row-HP-0003').getByText('Duman').click();
    await expect(page.getByTestId('patient-detail')).toBeVisible();
    await expect(
      page.getByTestId('patient-alerts').getByText('Kuduz aşısı sonrası reaksiyon'),
    ).toBeVisible();
    await screenshot(page, 'f04-06-hasta-detay.png');

    // Uyarı ekle (kapsam: uyarı bölümü — zaman çizelgesinde de aynı metin çıkar).
    // Mobil koşum masaüstüyle aynı DB'yi paylaşırsa çözülmüş eş adlı uyarı da
    // bölümde kalır; .first() + aktif satır filtresi strict-mode ihlalini önler.
    const alertsSection = page.getByTestId('patient-alerts');
    await page.getByTestId('alert-add-form').getByLabel('Uyarı etiketi').fill(alertLabel);
    await page.getByRole('button', { name: 'Ekle' }).click();
    await expect(alertsSection.getByText(alertLabel)).toBeVisible();

    // Uyarıyı çöz — aktif stilden çıkıp yeniden açma düğmesi belirir
    const alertRow = alertsSection.getByRole('listitem').filter({ hasText: alertLabel });
    await alertRow.getByRole('button', { name: 'Çözüldü' }).click();
    await expect(alertRow.getByRole('button', { name: 'Yeniden aç' })).toBeVisible();

    // Kilo kaydı
    await page.getByTestId('weight-add-form').getByLabel('Kilo kilogram').fill('5.3');
    await page.getByTestId('weight-add-form').getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByTestId('latest-weight')).toContainText('5.3');

    // Zaman çizelgesi iskeleti
    await expect(page.getByTestId('timeline-feed')).toBeVisible();
    await expect(page.getByText(/Kilo kaydı/).first()).toBeVisible();
    await screenshot(page, 'f04-06-zaman-cizelgesi.png');
  });

  test('07 — dosya yükleme ve yetkili indirme (private storage)', async ({ page }) => {
    const isMobile = test.info().project.name === 'chromium-mobile';
    const fileName = isMobile ? 'e2e-tahlil-mobil.txt' : 'e2e-tahlil.txt';
    await login(page, DEMO.admin);
    await page.goto('/hastalar');
    await page.getByTestId('patient-search').fill('Pamuk');
    await page.getByText('Pamuk').click();
    await expect(page.getByTestId('patient-detail')).toBeVisible();

    await page.setInputFiles('[data-testid="file-input"]', {
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from('Faz 04 E2E dosya icerigi - sentetik'),
    });
    // Dosya satırı listeye düşer (satır = dosya adını içeren listitem)
    const fileRow = page
      .getByTestId('patient-files')
      .getByRole('listitem')
      .filter({ hasText: fileName });
    await expect(fileRow).toBeVisible();
    await screenshot(page, 'f04-07-dosya-yukleme.png');

    // Yetkili indirme: indirme olayı tetiklenir (URL dışa sızmaz)
    const downloadPromise = page.waitForEvent('download');
    await fileRow.getByRole('button', { name: 'İndir' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(fileName);
  });

  test('08 — arşiv akışı: hastalar sonra sahip (sebep zorunlu, silme yok)', async ({ page }) => {
    const owner = testOwner();
    const names = patientNames();
    await login(page, DEMO.admin);

    // İki test hastasını da arşivle (sahip arşivi aktif hasta gerektirmez)
    for (const patientName of [names.second, names.first]) {
      await page.goto('/hastalar');
      await page.getByTestId('patient-search').fill(patientName);
      await page.getByText(patientName).click();
      await expect(page.getByTestId('patient-detail')).toBeVisible();
      await page.getByRole('button', { name: 'Arşivle' }).click();
      await page.getByLabel('Arşiv sebebi').fill(`E2E arşiv - ${patientName}`);
      await page
        .getByTestId('patient-archive-form')
        .getByRole('button', { name: 'Arşivle' })
        .click();
      await expect(page.getByText('Arşiv', { exact: true }).first()).toBeVisible();
    }
    await screenshot(page, 'f04-08-hasta-arsiv.png');

    // Sahibi arşivle (aktif hastası kalmadı)
    await page.goto('/sahipler');
    await page.getByTestId('owner-search').fill(owner.fullName);
    await page.getByText(owner.fullName).click();
    await expect(page.getByTestId('owner-detail')).toBeVisible();
    await page.getByRole('button', { name: 'Arşivle' }).click();
    await page.getByLabel('Arşiv sebebi').fill('E2E akış tamamlandı');
    await page.getByTestId('owner-archive-form').getByRole('button', { name: 'Arşivle' }).click();
    await expect(page.getByText('Arşiv sebebi: E2E akış tamamlandı')).toBeVisible();
    await screenshot(page, 'f04-08-sahip-arsiv.png');
  });

  test('09 — yetkisiz şube kullanıcısı yalnız kendi şubesinin hastalarını görür', async ({
    page,
  }) => {
    await login(page, DEMO.stok);
    await page.goto('/hastalar');
    await expect(page.getByTestId('patient-list')).toBeVisible();

    // SUB2 hastası görünür; Merkez (MRKZ) hastaları görünmez
    await expect(page.getByText('Boncuk')).toBeVisible();
    await expect(page.getByText('Pamuk')).not.toBeVisible();
    await expect(page.getByText('Duman')).not.toBeVisible();
    await screenshot(page, 'f04-09-yetkisiz-sube-gorunumu.png');
  });

  test('10 — 1280 genişlikte yatay taşma yok', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/sahipler');
    await page.setViewportSize({ width: 1280, height: 800 });
    await expectNoHorizontalOverflow(page);
    await page.goto('/hastalar');
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('Faz 04 — mobil düzen', () => {
  test('11 — mobil sahip listesi ve hasta listesi taşmaz', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium-mobile', 'Yalnızca mobil projesinde çalışır');

    await login(page, DEMO.admin);
    await page.goto('/sahipler');
    await expect(page.getByTestId('owner-list')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'f04-11-mobil-sahipler.png', false);

    await page.goto('/hastalar');
    await expect(page.getByTestId('patient-list')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'f04-11-mobil-hastalar.png', false);
  });
});
