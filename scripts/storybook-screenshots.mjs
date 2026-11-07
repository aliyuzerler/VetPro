#!/usr/bin/env node
/**
 * Storybook story ekran görüntülerini docs/screenshots/storybook/ altına üretir.
 * Her faz sonundaki standart zincirin parçası: test promptları → Playwright E2E →
 * Storybook test-runner → ekran görüntüleri → README → GitHub push.
 *
 * Ön koşul: pnpm --filter @vetcore/web storybook:build && statik sunucu (varsayılan 6006)
 * Kullanım: node scripts/storybook-screenshots.mjs [storybook-url]
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// pnpm sıkı düzeni: @playwright/test yalnızca apps/web bağlamında çözümlenir
const { chromium } = createRequire(path.join(ROOT, 'apps', 'web', 'package.json'))('@playwright/test');
const OUT_DIR = path.join(ROOT, 'docs', 'screenshots', 'storybook');
const INDEX = path.join(ROOT, 'apps', 'web', 'storybook-static', 'index.json');
const BASE = process.argv[2] ?? 'http://127.0.0.1:6006';
const MOBILE_IDS = ['design-system-statuschip--tum-tonlar', 'ui-button--varyantlar'];

const index = JSON.parse(readFileSync(INDEX, 'utf8'));
const stories = Object.values(index.entries).filter((e) => e.type === 'story');

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
let ok = 0;
const failed = [];

async function shot(id, viewport, suffix = '') {
  const page = await browser.newPage({ viewport });
  try {
    await page.goto(`${BASE}/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(350);
    const file = path.join(OUT_DIR, `${id}${suffix}.png`);
    await page.screenshot({ path: file });
    ok += 1;
    console.log('OK ', path.basename(file));
  } catch (err) {
    failed.push(id + suffix);
    console.error('HATA', id + suffix, err.message);
  } finally {
    await page.close();
  }
}

for (const story of stories) {
  await shot(story.id, { width: 1280, height: 800 });
}
for (const id of MOBILE_IDS) {
  await shot(id, { width: 390, height: 844 }, '-mobil');
}

// Storybook yönetim arayüzü — kenar çubuğu + dokümantasyon paneli görünsün
const ui = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await ui.goto(`${BASE}/?path=/story/design-system-statuschip--tum-tonlar`, { waitUntil: 'networkidle' });
  await ui.evaluate(() => document.fonts.ready);
  await ui.waitForTimeout(600);
  await ui.screenshot({ path: path.join(OUT_DIR, 'storybook-arayuzu.png') });
  ok += 1;
  console.log('OK  storybook-arayuzu.png');
} catch (err) {
  failed.push('storybook-arayuzu');
  console.error('HATA storybook-arayuzu', err.message);
} finally {
  await ui.close();
}

await browser.close();
console.log(`\n${ok} görüntü üretildi, ${failed.length} hata`);
if (failed.length > 0) process.exit(1);
