import { expect, test, type Page } from '@playwright/test';
import { DEMO, expectNoHorizontalOverflow, login, screenshot } from './helpers';

/**
 * VetCore Faz 05 — randevu takvimi ve akış panosu E2E testleri.
 * Kapsam: gün/hafta/ay takvim, randevu oluşturma, çakışma hatası (409), çalışma
 * saati dışı + yetkili override akışı, durum geçişleri (check-in → tamamlama),
 * akış panosu şeritleri, bekleme listesi (ekle + randevuya çevir), hekim/oda
 * filtreleri ve mobil görünümler.
 *
 * Mutasyon içeren testler yalnızca masaüstü projesinde koşar (masaüstü/mobil
 * aynı DB'yi paylaştığı için çakışma yaratmaz); mobil koşum salt-okunur görünüm
 * + ekran görüntüsü alır (Faz 04 deseni).
 */

/** Klinik yerel (Europe/Istanbul) bir sonraki çalışma günü (Pzt–Cmt) — sayfa bağlamında. */
async function clinicNextWorkdayISO(page: Page): Promise<string> {
  return page.evaluate(() => {
    // Yarından başla; Pazar (0) ise Pazartesi'ye atla (seed çalışma saatleri Pzt–Cmt)
    const d = new Date(Date.now() + 3 * 60 * 60_000 + 24 * 60 * 60_000);
    if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  });
}

/** Gün görünümünde hedef tarihe ileri gez (başlıktaki gün numarasına kadar). */
async function navigateToDay(page: Page, targetISO: string): Promise<void> {
  const dayOfMonth = Number(targetISO.split('-')[2]);
  // Başlık "9 Kasım 2026 Pazartesi" biçimindedir; \b ile "19"ün "9"u eşleşmesin.
  const dayPattern = new RegExp(`\\b${dayOfMonth} `);
  for (let step = 0; step < 10; step += 1) {
    const title = (await page.getByTestId('calendar-title').textContent()) ?? '';
    if (dayPattern.test(title)) return;
    await page.getByRole('button', { name: 'Sonraki dönem' }).click();
    await expect(page.getByTestId('calendar-title')).not.toHaveText(title);
  }
  throw new Error(`Takvim ${targetISO} gününe gezilemedi`);
}

/** Randevu formunu doldurur ve gönderir. */
async function fillAppointmentForm(
  page: Page,
  input: { patientSearch: string; dateISO: string; startTime: string },
) {
  await page.getByTestId('new-appointment-button').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await page.getByTestId('appointment-patient-search').fill(input.patientSearch);
  await dialog
    .getByRole('button', { name: new RegExp(input.patientSearch) })
    .first()
    .click();

  await page.getByTestId('appointment-type-select').click();
  await page
    .getByRole('option', { name: /Muayene/ })
    .first()
    .click();

  await page.getByTestId('appointment-staff-select').click();
  await page.getByRole('option', { name: /Ayşe Demir/ }).click();

  await page.getByTestId('appointment-date-input').fill(input.dateISO);
  await page.getByTestId('appointment-start-input').fill(input.startTime);

  await dialog.getByRole('button', { name: /Randevu Oluştur/ }).click();
}

test.describe('Faz 05 — takvim ve randevu akışı (masaüstü)', () => {
  test.skip(() => test.info().project.name === 'chromium-mobile', 'Mutasyonlar yalnız masaüstünde');

  test('01 — takvim gün görünümü seed verisiyle yüklenir', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/takvim');
    await expect(page.getByTestId('calendar-board')).toBeVisible();
    // Seed: bugünün sentetik randevuları (yerel saat 10/11/14/16)
    await expect(page.getByText(/Pamuk \(HP-0001\)/)).toBeVisible();
    await expect(page.getByText(/Karabaş \(HP-0002\)/)).toBeVisible();
    await expect(page.getByText(/Duman \(HP-0003\)/)).toBeVisible();
    await expect(page.getByText(/Boncuk \(HP-0004\)/)).toBeVisible();
    // Durum rozetleri gerçek veriden
    await expect(page.getByText('Muayenede')).toBeVisible();
    await expect(page.getByText('Tamamlandı').first()).toBeVisible();
    await screenshot(page, 'f05-01-takvim-gun.png');
  });

  test('02 — yeni randevu oluşturulur ve takvimde görünür', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/takvim');
    const tomorrow = await clinicNextWorkdayISO(page);
    await fillAppointmentForm(page, {
      patientSearch: 'Karabaş',
      dateISO: tomorrow,
      startTime: '10:00',
    });
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 20_000 });
    // Çalışma gününe geç → oluşturulan randevu görünür
    await navigateToDay(page, tomorrow);
    await expect(page.getByText(/Karabaş \(HP-0002\)/)).toBeVisible();
    await screenshot(page, 'f05-02-yeni-randevu.png');
  });

  test('03 — aynı hekim/oda çakışması 409 ile reddedilir', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/takvim');
    const tomorrow = await clinicNextWorkdayISO(page);
    await fillAppointmentForm(page, {
      patientSearch: 'Duman',
      dateISO: tomorrow,
      startTime: '10:00',
    });
    await expect(page.getByTestId('appointment-form-error')).toContainText(
      'çakışan aktif randevu',
      { timeout: 20_000 },
    );
    await screenshot(page, 'f05-03-cakisma-hatasi.png');
    await page.getByRole('button', { name: 'Vazgeç' }).click();
  });

  test('04 — çalışma saati dışı randevu yetkili override ile kabul edilir', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/takvim');
    const tomorrow = await clinicNextWorkdayISO(page);
    await fillAppointmentForm(page, {
      patientSearch: 'Duman',
      dateISO: tomorrow,
      startTime: '07:30',
    });
    // Politika 422 döner; admin appointment.override iznine sahip → istisna paneli
    await expect(page.getByTestId('appointment-override-panel')).toContainText(
      'çalışma saatleri dışında',
      { timeout: 20_000 },
    );
    await page.getByLabel(/Çalışma saatleri dışına izin ver/).click();
    await page
      .getByTestId('appointment-override-reason')
      .fill('Sahip yurt dışına çıkıyor — yönetici onayı');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Randevu Oluştur/ })
      .click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 20_000 });
    // 07:30 randevusu çalışma günü listesinde
    await navigateToDay(page, tomorrow);
    await expect(page.getByText(/Duman \(HP-0003\)/)).toBeVisible();
    await screenshot(page, 'f05-04-override-randevu.png');
  });

  test('05 — durum geçişleri ileri yönlü işler ve iptal gerekçe ister', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/takvim');
    const workday = await clinicNextWorkdayISO(page);
    await navigateToDay(page, workday);

    // 10:00 Karabaş: check-in → beklemeye → muayeneye → tamamla
    const row = page.locator('[data-testid^="appointment-row-"]', {
      hasText: 'Karabaş',
    });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /Check-in/ }).click();
    await expect(row.getByText('Geldi')).toBeVisible();
    await row.getByRole('button', { name: 'Beklemeye Al' }).click();
    await expect(row.getByText('Beklemede')).toBeVisible();
    await row.getByRole('button', { name: 'Muayeneye Al' }).click();
    await expect(row.getByText('Muayenede')).toBeVisible();
    await row.getByRole('button', { name: 'Tamamla' }).click();
    await expect(row.getByText('Tamamlandı')).toBeVisible();

    // 07:30 Duman randevusunu gerekçeyle iptal et
    const cancelRow = page.locator('[data-testid^="appointment-row-"]', { hasText: 'Duman' });
    await cancelRow.getByTestId(/cancel-appointment-/).click();
    await page.getByTestId('cancel-reason-input').fill('Sahip planı değiştirdi');
    await page.getByTestId('confirm-cancel-button').click();
    await expect(cancelRow.getByText('İptal Edildi')).toBeVisible({ timeout: 20_000 });
    await screenshot(page, 'f05-05-durum-gecisleri.png');
  });

  test('06 — akış panosu gerçek kuyruğu gösterir ve check-in yansır', async ({ page }) => {
    await login(page, DEMO.admin);

    // Bugün 16:00 Boncuk (planlı) → check-in → panoda "Geldi" şeridi
    await page.goto('/takvim');
    const row = page.locator('[data-testid^="appointment-row-"]', { hasText: 'Boncuk' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /Check-in/ }).click();
    await expect(row.getByText('Geldi')).toBeVisible({ timeout: 20_000 });

    await page.goto('/akis-panosu');
    await expect(page.getByTestId('flowboard-board')).toBeVisible();
    // Seed verisi: Duman beklemede, Karabaş muayenede; Boncuk check-in ile geldi
    await expect(page.getByText('Duman', { exact: true })).toBeVisible();
    await expect(page.getByText('Karabaş', { exact: true })).toBeVisible();
    await expect(page.getByText('Boncuk', { exact: true })).toBeVisible();
    // Bekleme süresi kartlarda görünür
    await expect(page.getByText(/Bekleme: \d+ dk/).first()).toBeVisible();

    // "Geldi" şeridindeki Boncuk → Beklemeye Al → şerit değişir
    const boncukCard = page.getByTestId(/flowboard-card-/).filter({ hasText: 'Boncuk' });
    await boncukCard.getByRole('button', { name: 'Beklemeye Al' }).click();
    await expect(
      page.locator('[data-testid="flowboard-lane-waiting"]', { hasText: 'Boncuk' }),
    ).toBeVisible({ timeout: 20_000 });
    await screenshot(page, 'f05-06-akis-panosu.png');
  });

  test('07 — bekleme listesi: kayıt ekleme ve randevuya çevirme', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/bekleme-listesi');
    await expect(page.getByTestId('waitlist-table')).toBeVisible();
    // Seed: Duman bekleme kaydı
    await expect(page.getByText(/Duman \(HP-0003\)/)).toBeVisible();
    await expect(page.getByText('Sabah 09:00–11:00 arası tercih eder')).toBeVisible();

    // Yeni kayıt: Karabaş, yarın 13:00–14:00
    const tomorrow = await clinicNextWorkdayISO(page);
    await page.getByTestId('add-waitlist-button').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.getByTestId('waitlist-patient-search').fill('Karabaş');
    await dialog
      .getByRole('button', { name: /Karabaş/ })
      .first()
      .click();
    await page.getByRole('dialog').getByLabel('Randevu türü').click();
    await page.getByRole('option', { name: /Kontrol/ }).click();
    await page.getByRole('dialog').getByLabel('Tercih edilen hekim').click();
    await page.getByRole('option', { name: /Ayşe Demir/ }).click();
    await page.locator('#waitlist-date').fill(tomorrow);
    await page.locator('#waitlist-window-start').fill('13:00');
    await page.locator('#waitlist-window-end').fill('14:00');
    await page.locator('#waitlist-note').fill('E2E bekleme kaydı');
    await dialog.getByRole('button', { name: /Kaydı Ekle/ }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText('E2E bekleme kaydı')).toBeVisible();

    // Randevuya çevir: yarın 15:00
    const newEntryRow = page.locator('[data-testid^="waitlist-row-"]', {
      hasText: 'Karabaş',
    });
    await newEntryRow.getByTestId(/book-/).click();
    const bookDialog = page.getByRole('dialog');
    await expect(bookDialog).toBeVisible();
    await page.locator('#book-date').fill(tomorrow);
    await page.locator('#book-start').fill('15:00');
    await bookDialog.getByRole('button', { name: /Randevu Oluştur/ }).click();
    await expect(bookDialog).toBeHidden({ timeout: 20_000 });
    await expect(newEntryRow.getByText('Randevuya çevrildi')).toBeVisible({ timeout: 20_000 });
    await screenshot(page, 'f05-07-bekleme-listesi.png');
  });

  test('08 — hekim ve oda filtreleri uygulanır; hafta görünümü', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/takvim');
    await page.getByTestId('view-week').click();
    await expect(page.getByTestId('calendar-week-grid')).toBeVisible();
    // Hekim filtresi: yalnız Ayşe Demir randevuları
    await page.getByTestId('staff-filter').click();
    await page.getByRole('option', { name: /Ayşe Demir/ }).click();
    await expect(page.getByText(/Pamuk/).first()).toBeVisible();
    // Oda filtresi: Operasyon Odası → yalnız Boncuk 16:00
    await page.getByTestId('room-filter').click();
    await page.getByRole('option', { name: 'Operasyon Odası' }).click();
    await expect(page.getByText(/Boncuk/).first()).toBeVisible();
    await screenshot(page, 'f05-08-hafta-filtreler.png');
  });

  test('09 — takvim ay görünümü render edilir', async ({ page }) => {
    await login(page, DEMO.admin);
    await page.goto('/takvim');
    await page.getByTestId('view-month').click();
    await expect(page.getByTestId('calendar-month-grid')).toBeVisible();
    await screenshot(page, 'f05-09-takvim-ay.png');
  });
});

test.describe('Faz 05 — mobil görünümler (salt-okunur)', () => {
  test.skip(() => test.info().project.name !== 'chromium-mobile', 'Yalnız mobil koşumu');

  test('10 — mobil takvim ve panolar taşmasız yüklenir', async ({ page }) => {
    await login(page, DEMO.admin);

    await page.goto('/takvim');
    await expect(page.getByTestId('calendar-board')).toBeVisible();
    await expect(page.getByText(/Pamuk \(HP-0001\)/)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'f05-10-mobil-takvim.png');

    await page.goto('/akis-panosu');
    await expect(page.getByTestId('flowboard-board')).toBeVisible();
    await expect(page.getByText('Duman', { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'f05-10-mobil-akis-panosu.png');

    await page.goto('/bekleme-listesi');
    await expect(page.getByTestId('waitlist-table')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'f05-10-mobil-bekleme-listesi.png');
  });
});
