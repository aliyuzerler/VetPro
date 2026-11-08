#!/usr/bin/env node
/**
 * Faz 15 — VetCore kalıcı lisans anahtarı üretici (satıcı tarafı, çevrimdışı).
 *
 * Kullanım:
 *   node scripts/license-generate.mjs --licensee "VetCore Demo Kliniği" [--edition standard] [--key <hex>]
 *
 * Anahtar biçimi şeffaftır (bkz. apps/api/src/license/license.service.ts):
 *   VETCORE.<payload-b64url>.<sig-b64url>
 *   payload = base64url(JSON {v, licensee, edition, issuedAt})
 *   sig     = base64url(HMAC-SHA256(payload, imza anahtarı))
 *
 * İmza anahtarı VETCORE_LICENSE_SIGNING_KEY ortam değişkeninden okunur;
 * verilmezse rastgele üretilir ve standart çıkışa yazılır (bir kez görünür).
 * Bu betik ağa bağlanmaz; üretilen anahtar kurulumda çevrimdışı doğrulanır.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { exit, argv } from 'node:process';

function arg(name) {
  const i = argv.indexOf(`--${name}`);
  return i > 0 ? argv[i + 1] : undefined;
}

const licensee = arg('licensee');
if (!licensee) {
  console.error(
    'Kullanım: node scripts/license-generate.mjs --licensee "Klinik Adı" [--edition standard] [--key <hex>]',
  );
  exit(1);
}

const edition = arg('edition') ?? 'standard';
let signingKey = arg('key') ?? process.env.VETCORE_LICENSE_SIGNING_KEY;
if (!signingKey) {
  signingKey = randomBytes(32).toString('hex');
  console.error(
    '[bilgi] VETCORE_LICENSE_SIGNING_KEY verilmedi — üretilen anahtar (sunucuda aynı değeri kullanın):',
  );
  console.error(`VETCORE_LICENSE_SIGNING_KEY=${signingKey}`);
}

const payload = Buffer.from(
  JSON.stringify({ v: 1, licensee, edition, issuedAt: new Date().toISOString() }),
  'utf8',
).toString('base64url');

const sig = createHmac('sha256', signingKey).update(payload).digest('base64url');

console.log(`VETCORE.${payload}.${sig}`);
