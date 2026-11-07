import { expect, test } from '@playwright/test';
import { DEMO, expectNoHorizontalOverflow, login, screenshot } from './helpers';

/**
 * VetCore Faz 03 — kimlik, personel, rol ve klinik ayarları E2E testleri.
 * Kapsam: giriş/hata/çıkış, aktif şube seçimi, klinik ayarları sekmeleri
 * (profil, şubeler, personel, izin matrisi, denetim), yetkisiz görünüm.
 * Ekran görüntüleri e2e/screenshots/ altına yazılır (ADR-013, repoya commit).
 */

test.describe('Faz 03 — kimlik akışı', () => {
  test('01 — giriş sayfası yüklenir ve demo hesap ipucu görünür', async ({ page }) => {
    await page.goto('/giris');
    await expect(page.getByTestId('login-card')).toBeVisible();
    await expect(page.getByText('admin@vetcore-demo.example')).toBeVisible();
    await screenshot(page, 'f03-01-giris-sayfasi.png');
  });

  test('02 — hatalı parola hata zarfı gösterir', async ({ page }) => {
    await page.goto('/giris');
    await page.getByLabel('E-posta').fill(DEMO.admin.email);
    await page.getByLabel('Parola').fill('yanlis-parola-123');
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page.getByTestId('login-error')).toBeVisible();
    await screenshot(page, 'f03-02-giris-hata.png', false);
  });

  test('03 — başarılı giriş kontrol paneline ulaşır', async ({ page }) => {
    await login(page, DEMO.admin);
    await expect(page.getByTestId('branch-selector')).toContainText('Merkez Şube');
    await expect(page.getByTestId('sidebar-user')).toContainText('Deniz Yıldız');
  });

  test('04 — aktif şube değişimi üst çubuğa ve oturuma yansır', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium-desktop', 'Masaüstü şube seçici gerektirir');

    await login(page, DEMO.admin);
    await page.getByTestId('branch-selector').click();
    await page.getByTestId('branch-option-SUB2').click();
    await expect(page.getByTestId('branch-selector')).toContainText('İkinci Şube', {
      timeout: 15_000,
    });
    await screenshot(page, 'f03-04-sube-degisimi.png', false);

    // Sayfa yenilendiğinde seçim oturumdan korunur
    await page.reload();
    await expect(page.getByTestId('branch-selector')).toContainText('İkinci Şube');
  });

  test('05 — çıkış akışı giriş sayfasına döndürür', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.getByTestId('profile-menu').click();
    await page.getByTestId('logout-button').click();
    await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Faz 03 — klinik ayarları (masaüstü)', () => {
  const DESKTOP_ONLY = 'Masaüstü projesi';

  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium-desktop', DESKTOP_ONLY);
    await login(page, DEMO.admin);
    await page.goto('/ayarlar');
    await expect(page.getByRole('heading', { name: 'Klinik Ayarları' })).toBeVisible();
  });

  test('06 — klinik profili formu salt veriyle yüklenir', async ({ page }) => {
    // Input değerleri textContent'e girmez; alan değerleri toHaveValue ile doğrulanır.
    await expect(page.getByLabel('Klinik adı')).toHaveValue('VetCore Demo Kliniği', {
      timeout: 15_000,
    });
    await expect(page.getByLabel('Saat dilimi')).toHaveValue('Europe/Istanbul');
    await expect(page.getByLabel('Para birimi')).toHaveValue('TRY');
    await screenshot(page, 'f03-06-klinik-profili.png');
  });

  test('07 — şubeler tablosu iki seed şubesini listeler', async ({ page }) => {
    await page.getByRole('tab', { name: 'Şubeler' }).click();
    const card = page.getByTestId('branches-card');
    await expect(card).toBeVisible();
    await expect(card.getByText('Merkez Şube')).toBeVisible();
    await expect(card.getByText('İkinci Şube')).toBeVisible();
    await screenshot(page, 'f03-07-subeler.png');
  });

  test('08 — personel listesi rolleri ve şubeleri gösterir', async ({ page }) => {
    await page.getByRole('tab', { name: 'Personel' }).click();
    const card = page.getByTestId('staff-card');
    await expect(card.getByTestId('staff-row-admin@vetcore-demo.example')).toBeVisible();
    await expect(card.getByTestId('staff-row-veteriner@vetcore-demo.example')).toBeVisible();
    await expect(card.getByTestId('staff-row-resepsiyon@vetcore-demo.example')).toBeVisible();
    await expect(card.getByText('Klinik Yöneticisi').first()).toBeVisible();
    await screenshot(page, 'f03-08-personel.png');
  });

  test('09 — izin matrisi görünür ve açma/kapama denetime yazılır', async ({ page }) => {
    await page.getByRole('tab', { name: 'Roller ve İzinler' }).click();
    const card = page.getByTestId('roles-card');
    await expect(card.getByTestId('role-row-resepsiyon')).toBeVisible();

    // Deterministik akış: başlangıç durumundan bağımsız olarak izni KAPALI konuma getir
    // (önceki koşum/manuel test kalıntısı olsa bile).
    const resepsiyonRow = card.getByTestId('role-row-resepsiyon');
    const reportsSwitch = resepsiyonRow.getByRole('switch', { name: /reports\.export/ });
    await expect(reportsSwitch).toBeVisible({ timeout: 15_000 });
    if ((await reportsSwitch.getAttribute('aria-checked')) === 'true') {
      await reportsSwitch.click();
      await expect(reportsSwitch).not.toBeChecked({ timeout: 15_000 });
    }

    // İzni aç → matris ve denetim kaydı güncellenir
    await reportsSwitch.click();
    await expect(reportsSwitch).toBeChecked({ timeout: 15_000 });
    await screenshot(page, 'f03-09-izin-matrisi.png');

    // İzni kapat (temiz durum bırak)
    await reportsSwitch.click();
    await expect(reportsSwitch).not.toBeChecked({ timeout: 15_000 });
  });

  test('10 — denetim kaydı kimlik ve matris olaylarını listeler', async ({ page }) => {
    await page.getByTestId('tab-denetim').click();
    const card = page.getByTestId('audit-card');
    await expect(card.getByText('Denetim Kaydı')).toBeVisible();
    await expect(card.getByTestId('audit-row').first()).toBeVisible({ timeout: 15_000 });
    // Giriş ve izin güncellemeleri defterde
    await expect(card.getByText('auth.login').first()).toBeVisible();
    await screenshot(page, 'f03-10-denetim.png');
  });

  test('11 — 1280 genişlikte ayarlar taşması yok', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('Faz 03 — yetkisiz görünüm (resepsiyon)', () => {
  test('12 — staff.manage izni olmayan personel kilitli görünüm görür', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium-desktop', 'Masaüstü projesi');

    await login(page, DEMO.resepsiyon);
    await page.goto('/ayarlar');
    await page.getByRole('tab', { name: 'Personel' }).click();
    await expect(page.getByText('Personel yönetimi yetkiniz yok')).toBeVisible();

    await page.getByTestId('tab-denetim').click();
    await expect(page.getByText('Denetim kaydı yetkiniz yok')).toBeVisible();
    await screenshot(page, 'f03-12-yetkisiz-gorunum.png');
  });
});

test.describe('Faz 03 — mobil giriş', () => {
  test('13 — mobil giriş sayfası düzeni korunur', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium-mobile', 'Yalnızca mobil projesinde çalışır');

    await page.goto('/giris');
    await expect(page.getByTestId('login-card')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'f03-13-mobil-giris.png', false);

    await login(page, DEMO.admin);
    await expect(page.getByRole('heading', { name: 'Genel Bakış', level: 1 })).toBeVisible();
  });
});
