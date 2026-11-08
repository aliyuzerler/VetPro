#!/usr/bin/env node
/**
 * Faz 15 — hafif SAST (statik uygulama güvenlik taraması).
 * Tehlikeli desenleri kaynak ağacında arar; bulgu varsa çıkış kodu 1.
 * Kurallar projeye özgüdür: ham SQL parametresiz kullanım, dinamik kod
 * çalıştırma, zayıf karma/güvenlik yoksa alarm üretir.
 */
import { execFileSync } from 'node:child_process';
import { exit } from 'node:process';

const RULES = [
  {
    id: 'no-eval',
    desc: 'eval()/new Function dinamik kod çalıştırma',
    pattern: '\\beval\\s*\\(|new Function\\s*\\(',
  },
  {
    id: 'no-raw-unsafe-sql',
    desc: '$queryRawUnsafe/$executeRawUnsafe parametresiz ham SQL riski (tagged $queryRaw/$executeRaw kullan)',
    pattern: '\\$(query|execute)RawUnsafe',
  },
  {
    id: 'no-child-process-shell',
    desc: 'exec/execSync kabuk enjeksiyon riski (execFile tercih edilir)',
    pattern: '\\b(exec|execSync)\\s*\\(',
    include: ['apps/api/src/**', 'apps/worker/src/**', 'apps/web/src/**', 'packages/**'],
  },
  {
    id: 'no-weak-hash',
    desc: 'zayıf karma (md5/sha1) — scrypt/sha256 kullanılır',
    pattern: 'createHash\\s*\\(\\s*[\'"](md5|sha1)[\'"]',
  },
  {
    id: 'no-hardcoded-token',
    desc: 'kaynak içinde kodlanmış belirteç (token = "…")',
    pattern: '(accessToken|refreshToken|password|secret)\\s*[:=]\\s*[\'"][A-Za-z0-9+/]{16,}[\'"]',
  },
];

function listFiles(glob) {
  try {
    return execFileSync('git', ['ls-files', ...glob.split(' ')], { encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f) && !/\.spec\.ts$/.test(f) && !/test\//.test(f));
  } catch {
    return [];
  }
}

let findings = 0;
for (const rule of RULES) {
  const files = rule.include ? rule.include.flatMap(listFiles) : listFiles('apps packages scripts');
  const seen = new Set();
  for (const file of files) {
    if (seen.has(file)) continue;
    seen.add(file);
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const re = new RegExp(rule.pattern);
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      // Yorum satırlarındaki dokümantasyon bahsedilmeleri bulgu değildir.
      if (/^\s*(\/\/|\/\*|\*)/.test(lines[i])) continue;
      if (re.test(lines[i])) {
        // Denetlenebilir bastırma: eşleşme satırının üstündeki 3 satır içinde
        // `sast-ok:` açıklaması varsa bulgu sayılmaz ama raporlanır.
        const context = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
        if (/sast-ok:/.test(context)) {
          console.log(`   sast-ok (bastırıldı): ${rule.id} — ${file}:${i + 1}`);
          continue;
        }
        console.error(`!! ${rule.id}: ${file}:${i + 1} — ${rule.desc}`);
        console.error(`   ${lines[i].trim().slice(0, 120)}`);
        findings += 1;
      }
    }
  }
}

import { readFileSync } from 'node:fs';

if (findings > 0) {
  console.error(`SAST SONUÇ: ${findings} bulgu`);
  exit(1);
}
console.log('SAST SONUÇ: temiz');
