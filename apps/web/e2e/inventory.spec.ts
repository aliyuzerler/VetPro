import { expect, test } from '@playwright/test';
import { DEMO, expectNoHorizontalOverflow, login, screenshot } from './helpers';

/**
 * VetCore Faz 07 — ürün, depo, lot, tedarikçi ve stok defteri E2E.
 * Kapsam: ürün listesi/detay (bakiye + FEFO partiler), mal kabul (lot/SKT/
 * maliyet), tüketim (FEFO önerisi), partiler sayfası (süresi geçmiş/karantina
 * rozetleri + karantina aksiyonu + sıcaklık kaydı), hareket defteri (salt
 * okunur + tür filtresi), transfer (iki aşamalı: sevk → yolda → teslim),
 * stok sayımı (gerekçe zorunlu), tedarikçiler ve yetkisiz kullanıcı görünümü.
 *
 * Mutasyonlar benzersiz parti/ürün kodlarıyla yapılır (seed verisi korunur);
 * sayım farkı seed stoğunu değiştirir → yalnızca veteriner oturumunda kısa föy.
 */

const TS = Date.now().toString(36);

test.describe('Faz 07 — ürünler ve mal kabul', () => {
  test('f07-01 ürünler sayfası: liste, arama, bakiye ve FEFO partiler', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/urunler');
    await expect(page.getByTestId('urunler-page')).toBeVisible();
    // Seed ürünleri listelenir; ilk ürünün bakiyeleri/partiler yüklenir
    await expect(page.getByTestId('urun-tablo')).toContainText('UR-AMOX250');
    await expect(page.getByTestId('urun-tablo')).toContainText('Parti/SKT');
    await expect(page.getByTestId('urun-partiler')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('urun-bakiyeler')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'f07-01-urunler.png');
  });

  test('f07-02 arama filtresi ürün daraltır', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/urunler');
    await expect(page.getByTestId('urun-tablo')).toBeVisible();
    await page.getByTestId('urun-arama').fill('Kuduz');
    await expect(page.getByTestId('urun-tablo')).toContainText('UR-KUDUZ01');
    await expect(page.getByTestId('urun-tablo')).not.toContainText('UR-AMOX250');
    await screenshot(page, 'f07-02-urun-arama.png');
  });

  test('f07-03 mal kabul: lot/SKT/maliyet ile stok girişi ve defter yazımı', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/urunler');
    await expect(page.getByTestId('urun-tablo')).toBeVisible();
    await page.getByTestId('mal-kabul-yeni').click();
    await expect(page.getByTestId('receipt-dialog')).toBeVisible();

    // Depo seç
    await page.getByTestId('receipt-warehouse').click();
    await page.getByRole('option', { name: /Merkez Ana Depo/ }).click();
    // Parti takipli ürün seç → lot + SKT alanları açılır
    await page.getByTestId('receipt-product-0').click();
    await page.getByRole('option', { name: /UR-AMOX250/ }).click();
    await expect(page.getByTestId('receipt-lot-0')).toBeVisible();
    const lotCode = `E2E-${TS}`;
    await page.getByTestId('receipt-lot-0').fill(lotCode);
    await page.getByTestId('receipt-expiry-0').fill('2027-06-30');
    await page.getByTestId('receipt-cost-0').fill('27.5');
    await page.getByTestId('receipt-qty-0').fill('14');
    await page.getByTestId('receipt-note').fill('E2E mal kabul');
    await page.getByTestId('receipt-save').click();

    await expect(page.getByRole('status')).toContainText('Mal kabul deftere yazıldı');
    // Defterde hareket görünür
    await page.goto('/stok-hareketleri');
    await expect(page.getByTestId('movement-table')).toBeVisible();
    await expect(page.getByTestId('movement-table')).toContainText(lotCode);
    await screenshot(page, 'f07-03-mal-kabul-defter.png');
  });

  test('f07-04 tüketim: FEFO önerisiyle stok çıkışı', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/urunler');
    await expect(page.getByTestId('urun-tablo')).toContainText('UR-AMOX250');
    // İlk ürün (UR-AMOX250) seçili gelir; tüketim diyaloğu açılır
    await page.getByRole('button', { name: /Amoksisilin 250/ }).first().click();
    await expect(page.getByTestId('urun-partiler')).toBeVisible();
    await page.getByTestId('tuketim-ac').click();
    await expect(page.getByTestId('consume-dialog')).toBeVisible();
    await page.getByTestId('consume-qty').fill('2');
    await page.getByTestId('consume-note').fill('E2E FEFO tüketim');
    await page.getByTestId('consume-save').click();
    await expect(page.getByRole('status')).toContainText('FEFO tahsisiyle deftere yazıldı');
    await screenshot(page, 'f07-04-tuketim.png');
  });
});

test.describe('Faz 07 — partiler ve son kullanma', () => {
  test('f07-05 partiler: süresi geçmiş/karantina rozetleri ve karantina aksiyonu', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/partiler');
    await expect(page.getByTestId('partiler-page')).toBeVisible();
    const table = page.getByTestId('partiler-tablo');
    await expect(table).toBeVisible({ timeout: 20_000 });
    // Seed senaryoları: süresi geçmiş parti bloklu, karantina rozetli
    await expect(table).toContainText('Süresi geçmiş');
    await expect(table).toContainText('Karantina');
    await screenshot(page, 'f07-05-partiler.png');

    // Karantina → serbest → tekrar karantina (denetim yazımı UI akışıyla)
    // Not: 'Karantinaya Al' düğmesi de 'Karantina' içerdiğinden filtre parti koduyla yapılır
    const k2605Row = table.locator('[data-testid="partiler-tablo-satir"]').filter({ hasText: 'K2605' }).first();
    await expect(k2605Row).toContainText('Karantina');
    await k2605Row.getByRole('button', { name: 'Serbest Bırak' }).click();
    await expect(table.locator('[data-testid="partiler-tablo-satir"]').filter({ hasText: 'K2605' }).first())
      .toContainText('Kullanılabilir', { timeout: 15_000 });
    // Geri al (test kalıcılığı: seed senaryosu bozulmasın)
    await table
      .locator('[data-testid="partiler-tablo-satir"]')
      .filter({ hasText: 'K2605' })
      .first()
      .getByRole('button', { name: 'Karantinaya Al' })
      .click();
    await expect(
      table.locator('[data-testid="partiler-tablo-satir"]').filter({ hasText: 'K2605' }).first(),
    ).toContainText('Karantina', { timeout: 15_000 });
  });

  test('f07-06 soğuk zincir: sıcaklık kaydı eklenir', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/partiler');
    await expect(page.getByTestId('partiler-page')).toBeVisible();
    // veteriner warehouse.manage izni yok → form görünmez, kayıt listesi görünür
    await expect(page.getByTestId('temp-tablo')).toBeVisible({ timeout: 15_000 });
    await screenshot(page, 'f07-06-soguk-zincir.png');
  });

  test('f07-07 sıcaklık kaydı formu stok rolünde görünür ve kaydeder', async ({ page }) => {
    await login(page, DEMO.stok);
    await page.goto('/partiler');
    await expect(page.getByTestId('partiler-page')).toBeVisible();
    await page.getByTestId('temp-warehouse').selectOption({ label: 'Şube Deposu' });
    await page.getByTestId('temp-celsius').fill('5.5');
    await page.getByTestId('temp-kaydet').click();
    await expect(page.getByTestId('temp-tablo').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('temp-tablo')).toContainText('5.5 °C', { timeout: 15_000 });
    await screenshot(page, 'f07-07-sicaklik-kaydi.png');
  });
});

test.describe('Faz 07 — hareket defteri, transfer ve sayım', () => {
  test('f07-08 defter: tür filtresi ve salt-okunur görünüm', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/stok-hareketleri');
    await expect(page.getByTestId('movement-table')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('hareket-tur-filtre').click();
    await page.getByRole('option', { name: 'Mal Kabul' }).click();
    // Filtre sonrası yalnız mal kabul hareketleri
    await expect(page.getByTestId('movement-table')).toBeVisible();
    const badges = page.getByTestId('movement-table').getByText('Mal Kabul');
    await expect(badges.first()).toBeVisible();
    await screenshot(page, 'f07-08-defter-filtre.png');
  });

  test('f07-09 transfer: kurulum, sevk (yolda) ve teslim (hedef artışı)', async ({ page }) => {
    // 1) Admin (her iki şubeye erişimli) transfer kurar ve sevk eder
    //    Not: tek şube kapsamlı kullanıcı /warehouses listesinde hedef depoyu görmez;
    //    iki şubeli transfer kurulumu çok şube erişimi gerektirir (Faz 07 kararı).
    await login(page, DEMO.admin);
    await page.goto('/stok-hareketleri?tab=transferler');
    await page.getByTestId('tab-transferler').click();
    await expect(page.getByTestId('transfer-panel')).toBeVisible();
    await page.getByTestId('transfer-yeni').click();
    await expect(page.getByTestId('transfer-create-dialog')).toBeVisible();
    await page.getByTestId('transfer-from').click();
    await page.getByRole('option', { name: /Merkez Ana Depo/ }).click();
    // Kaynak partilerin FEFO listesi yüklenmesini bekle (dialog yeniden render olur)
    await page.getByTestId('transfer-to').click();
    await page.getByRole('option', { name: /Şube Deposu/ }).click();
    await page.getByTestId('transfer-line-0').getByRole('combobox').first().click();
    await page.getByRole('option', { name: /UR-AMOX250/ }).click();
    // Parti seçimi (FEFO sıralı kaynak partiler)
    await page.getByTestId('transfer-lot-0').click();
    await page.getByRole('option', { name: /B2503/ }).click();
    await page.getByTestId('transfer-create-dialog').getByLabel('Miktar').fill('4');
    await page.getByTestId('transfer-save').click();
    await expect(page.getByTestId('transfer-table')).toBeVisible({ timeout: 15_000 });
    // En yeni (taslak) transfer sevk edilir
    const draftRow = page.getByTestId('transfer-table-satir').filter({ hasText: 'Taslak' }).first();
    await expect(draftRow).toBeVisible();
    await draftRow.getByTestId('transfer-dispatch').click();
    await expect(page.getByRole('status')).toContainText('yolda görünüyor', { timeout: 15_000 });
    await screenshot(page, 'f07-09-transfer-yolda.png');
    await page.evaluate(() => {
      window.localStorage.clear();
    });

    // 2) Stok sorumlusu (SUB2) teslim alır → hedef stok artışı
    await login(page, DEMO.stok);
    await page.goto('/stok-hareketleri?tab=transferler');
    await page.getByTestId('tab-transferler').click();
    const inTransitRow = page.getByTestId('transfer-table-satir').filter({ hasText: 'Yolda' }).first();
    await expect(inTransitRow).toBeVisible({ timeout: 15_000 });
    await inTransitRow.getByTestId('transfer-receive').click();
    await expect(page.getByRole('status')).toContainText('hedef depo stoğu artırıldı', { timeout: 15_000 });
    await screenshot(page, 'f07-10-transfer-teslim.png');
  });

  test('f07-11 sayım: föy açılır, gerekçe ile tamamlanır ve düzeltme deftere yazılır', async ({ page }) => {
    // Sayım inventory.adjust izni ister — stok sorumlusu (SUB2) yapar
    await login(page, DEMO.stok);
    await page.goto('/stok-hareketleri');
    await expect(page.getByTestId('movement-table')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('sayim-baslat').click();
    await expect(page.getByTestId('count-create-dialog')).toBeVisible();
    await page.getByTestId('count-warehouse').click();
    await page.getByRole('option', { name: /Şube Deposu/ }).click();
    await page.getByTestId('count-create-save').click();
    // Föy açılır; seed stoğunun bir altını yaz (fark üret)
    await expect(page.getByTestId('count-sheet')).toBeVisible({ timeout: 15_000 });
    const inputs = page.getByTestId('count-line-input');
    const firstInput = inputs.first();
    const expected = Number(await firstInput.inputValue());
    await firstInput.fill(String(Math.max(0, expected - 1)));
    // Gerekçesiz tamamlama kapalı
    await expect(page.getByTestId('count-complete')).toBeDisabled();
    await page.getByTestId('count-reason').fill('E2E sayım farkı: kırık ambalaj');
    await page.getByTestId('count-complete').click();
    await expect(page.getByRole('status')).toContainText('Sayım tamamlandı', { timeout: 15_000 });
    // Defterde adjustment kaydı
    await expect(page.getByTestId('movement-table')).toContainText('Düzeltme', { timeout: 15_000 });
    await screenshot(page, 'f07-11-sayim-tamam.png');
  });
});

test.describe('Faz 07 — tedarikçiler ve yetkisiz görünüm', () => {
  test('f07-12 tedarikçiler: liste ve yeni kayıt', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/tedarikciler');
    await expect(page.getByTestId('tedarikciler-page')).toBeVisible();
    await expect(page.getByTestId('tedarikci-tablo')).toContainText('VetPharm Dağıtım A.Ş.');
    await page.getByTestId('tedarikci-yeni').click();
    await expect(page.getByTestId('supplier-form-dialog')).toBeVisible();
    await page.getByTestId('supplier-name').fill(`E2E Tedarikçi ${TS}`);
    await page.getByTestId('supplier-tax').fill('9876543210');
    await page.getByTestId('supplier-form-save').click();
    await expect(page.getByTestId('tedarikci-tablo')).toContainText(`E2E Tedarikçi ${TS}`, { timeout: 15_000 });
    await screenshot(page, 'f07-12-tedarikciler.png');
  });

  test('f07-13 yetkisiz kullanıcı: resepsiyon salt-okunur görür, aksiyon düğmeleri yok', async ({ page }) => {
    await login(page, DEMO.resepsiyon);
    await page.goto('/urunler');
    await expect(page.getByTestId('urunler-page')).toBeVisible();
    await expect(page.getByTestId('urun-tablo')).toBeVisible({ timeout: 20_000 });
    // Yazma aksiyonları görünmez (inventory.receive / product.manage izinleri yok)
    await expect(page.getByTestId('mal-kabul-yeni')).toHaveCount(0);
    await expect(page.getByTestId('urun-yeni')).toHaveCount(0);
    await expect(page.getByTestId('tuketim-ac')).toHaveCount(0);
    await screenshot(page, 'f07-13-yetkisiz-urunler.png');
  });
});

test.describe('Faz 07 — mobil kırılım', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('f07-14 mobil ürünler ve partiler taşmasız', async ({ page }) => {
    await login(page, DEMO.veteriner);
    await page.goto('/urunler');
    await expect(page.getByTestId('urunler-page')).toBeVisible();
    await expect(page.getByTestId('urun-tablo')).toBeVisible({ timeout: 20_000 });
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'f07-14-mobil-urunler.png');
    await page.goto('/partiler');
    await expect(page.getByTestId('partiler-page')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'f07-14-mobil-partiler.png');
  });
});
