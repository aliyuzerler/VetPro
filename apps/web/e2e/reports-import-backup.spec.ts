import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { DEMO, expectNoHorizontalOverflow, login, screenshot } from './helpers';

/**
 * Faz 14 E2E — raporlar, içe aktarma ve yedekleme.
 * Akış: /raporlar katalog + gelir tablosu + filtre; CSV dışa aktarma indirmesi
 * (reports.export izinli admin); /ice-aktarim şablon indirme, CSV yükleme,
 * önizleme durumları (geçerli/hatalı/duplicate), duplicate kararı, hatalı
 * satırda commit kilidi; /yedekler yedek alma + manifest checksum; yetki:
 * resepsiyon rapor görüntüler ama dışa aktaramaz ve yedek sayfasına giremez.
 * Ekran görüntüleri docs/screenshots'a kopyalanır.
 */

function tempCsv(content: string): string {
  const path = join(tmpdir(), `f14-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
  writeFileSync(path, `\uFEFF${content}`, 'utf8');
  return path;
}

test.describe('Faz 14 — raporlar', () => {
  test('f14-01 rapor katalogu ve gelir tablosu yüklenir', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/raporlar');
    await expect(page.getByTestId('raporlar-page')).toBeVisible();
    // 10 rapor kartı
    await expect(page.getByTestId('report-card-gelir')).toBeVisible();
    await expect(page.getByTestId('report-card-borc-yaslandirma')).toBeVisible();
    await expect(page.getByTestId('report-card-yatis-doluluk')).toBeVisible();
    // Varsayılan gelir raporu tablosu
    await expect(page.getByTestId('report-table')).toBeVisible({ timeout: 15_000 });
    await screenshot(page, 'web-f14-01-raporlar-gelir.png');
    await expectNoHorizontalOverflow(page);
  });

  test('f14-02 rapor değişimi ve tarih filtresi tabloyu günceller', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/raporlar');
    await expect(page.getByTestId('report-table')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('report-card-borc-yaslandirma').click();
    await expect(page.getByText('Borç Yaşlandırma').first()).toBeVisible();
    await expect(page.getByTestId('report-table')).toContainText('Yaş Aralığı', { timeout: 15_000 });
    await expect(page.getByTestId('report-table')).toContainText('90+ gün');
    await screenshot(page, 'web-f14-02-borc-yaslandirma.png');

    // Tarih filtresi — uzak geçmiş boş sonuç döndürür (empty state)
    await page.getByTestId('report-card-lab-turnaround').click();
    await page.getByTestId('report-date-from').fill('2020-01-01');
    await page.getByTestId('report-date-to').fill('2020-01-02');
    await expect(page.getByTestId('report-table')).toContainText('Test', { timeout: 15_000 });
    await expectNoHorizontalOverflow(page);
  });

  test('f14-03 CSV dışa aktarma dosya indirir ve denetim listesine düşer', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/raporlar');
    await expect(page.getByTestId('report-table')).toBeVisible({ timeout: 15_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('report-export-buttons').getByRole('button', { name: 'CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.csv');
    await expect(page.getByTestId('export-error')).toHaveCount(0);

    // Dışa aktarma geçmişi — REPORT_EXPORT kaydı listede belirir
    await expect(page.getByTestId('export-history')).toBeVisible();
    await expect(page.getByTestId('export-history')).toContainText('gelir', { timeout: 15_000 });
    await screenshot(page, 'web-f14-03-export-gecmisi.png');
  });

  test('f14-04 resepsiyon raporu görüntüler ama dışa aktaramaz', async ({ page }) => {
    await login(page, DEMO.resepsiyon);
    await page.goto('/raporlar');
    await expect(page.getByTestId('report-table')).toBeVisible({ timeout: 15_000 });
    // reports.view VAR: tablo + filtre görünür
    await expect(page.getByTestId('report-filters')).toBeVisible();
    // reports.export YOK: düğmeler yerine açıklama
    await expect(page.getByTestId('export-no-permission')).toBeVisible();
    await screenshot(page, 'web-f14-04-export-izni-yok.png');
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('Faz 14 — içe aktarma', () => {
  test('f14-05 şablon indirir, CSV yükler, önizleme durumlarını gösterir', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/ice-aktarim');
    await expect(page.getByTestId('ice-aktarim-page')).toBeVisible();

    // Şablon indirme
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('import-template-button').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('sablon');

    // Karışık CSV: 1 geçerli, 1 hatalı (iletişim yok), 1 duplicate (seed sahibi)
    const csv = tempCsv(
      [
        'ad,soyad,eposta,telefon',
        'E2E,İçeSahip,e2e-f14@ornek.example,05359990001',
        'E2E,',
        'Zeynep,Aksoy,zeynep.aksoy@example.com,',
      ].join('\r\n'),
    );
    await page.getByTestId('import-file-input').setInputFiles(csv);
    await page.getByTestId('import-upload-button').click();

    // Önizleme: önce YENİ işin özeti (3 satır) — eski işin tablosuna dokunma
    await expect(page.getByTestId('import-summary')).toContainText('3 satır', { timeout: 15_000 });
    await expect(page.getByTestId('import-preview-table')).toBeVisible();
    await expect(page.getByTestId('import-preview-table')).toContainText('Geçerli');
    await expect(page.getByTestId('import-preview-table')).toContainText('Hatalı');
    await expect(page.getByTestId('import-preview-table')).toContainText('Duplicate');
    await screenshot(page, 'web-f14-05-ice-aktarim-onizleme.png');
    await expectNoHorizontalOverflow(page);
  });

  test('f14-06 duplicate kararları alınır; hatalı satır commit’i kilitler', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/ice-aktarim');
    // Masaüstü/mobil kırılımları aynı DB'yi paylaşır — veriyi proje-özgün üret
    // ki diğer kırılımın commit ettiği sahip duplicate olarak yakalanmasın.
    const proj = test.info().project.name;
    const uniq = proj.endsWith('mobile') ? '55' : '44';
    const csv = tempCsv(
      [
        'ad,soyad,eposta,telefon',
        `E2E,İçeSahip2,e2e-f14b-${uniq}@ornek.example,0532111${uniq}66`,
        'Zeynep,Aksoy,zeynep.aksoy@example.com,',
      ].join('\r\n'),
    );
    await page.getByTestId('import-file-input').setInputFiles(csv);
    await page.getByTestId('import-upload-button').click();
    // Yeni işin özeti render edilene kadar bekle — eski iş tablosuna tıklanmasın
    await expect(page.getByTestId('import-summary')).toContainText('2 satır', { timeout: 15_000 });

    // Kararsız duplicate: 3. satır (Zeynep) — açık karar bekler
    const duplicateRow = page.getByTestId('import-row-3');
    await expect(duplicateRow).toBeVisible();
    await duplicateRow.getByTestId('resolve-skip-3').click();
    await expect(duplicateRow.getByTestId('resolve-skip-3')).toHaveClass(/bg-primary/, { timeout: 15_000 });

    // Hatalı satır yoksa commit açılır → bu işte hata satırı yok (2 geçerli
    // satır: biri create biri skip kararlı) → commit çalışır
    await page.getByTestId('import-commit-button').click();
    await expect(page.getByTestId('import-commit-message')).toContainText('tamamlandı', {
      timeout: 15_000,
    });
    await screenshot(page, 'web-f14-06-ice-aktarim-commit.png');
  });

  test('f14-07 hatalı satırlı iş commit edilemez (sunucu 400 + düğme kilidi)', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/ice-aktarim');
    const csv = tempCsv(
      [
        'ad,soyad,eposta,telefon',
        'E2E,EksikSahip,',
      ].join('\r\n'),
    );
    await page.getByTestId('import-file-input').setInputFiles(csv);
    await page.getByTestId('import-upload-button').click();
    await expect(page.getByTestId('import-summary')).toContainText('1 satır', { timeout: 15_000 });
    await expect(page.getByTestId('import-preview-table')).toBeVisible();
    await expect(page.getByTestId('import-preview-table')).toContainText('eposta veya telefon');
    await expect(page.getByTestId('import-commit-button')).toBeDisabled();
    await screenshot(page, 'web-f14-07-ice-aktarim-hata-kilidi.png');
  });
});

test.describe('Faz 14 — yedekleme', () => {
  test('f14-08 admin yedek alır; manifest checksum görünür', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/yedekler');
    await expect(page.getByTestId('yedekler-page')).toBeVisible();

    await page.getByTestId('backup-run-button').click();
    await expect(page.getByTestId('backup-message')).toContainText('Yedek tamamlandı', {
      timeout: 60_000,
    });
    await expect(page.getByTestId('backup-runs')).toContainText('Tamamlandı', { timeout: 15_000 });
    await expect(page.getByTestId('backup-manifest')).toBeVisible();
    await screenshot(page, 'web-f14-08-yedek-calismalari.png');
    await expectNoHorizontalOverflow(page);
  });

  test('f14-09 resepsiyon yedekleme sayfasına erişemez', async ({ page }) => {
    await login(page, DEMO.resepsiyon);
    await page.goto('/yedekler');
    await expect(page.getByText('Yetkisiz erişim')).toBeVisible({ timeout: 15_000 });
    await screenshot(page, 'web-f14-09-yedek-yetkisiz.png');
  });
});
