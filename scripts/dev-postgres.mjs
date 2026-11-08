/**
 * Yerel geliştirme PostgreSQL'i — Docker olmadan gömülü PostgreSQL çalıştırır.
 * Kullanım: `pnpm dev:postgres up` | `pnpm dev:postgres down`
 * Veri dizini: .tmp-pg/ (gitignore kapsamında, kalıcı değildir).
 * Üretim/staging ortamında Docker Compose altyapısı kullanılır (infra/docker/).
 */
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);

/**
 * Faz 13 — pnpm reinstall sonrası @embedded-postgres lib dizinindeki SONAME
 * kopyaları kaybolur (paket yalnızca sürümlü .so.X.Y.Z dosyaları taşır; sandbox
 * sembolik bağlantıya izin vermediği için ADR-011 zincirinde dosya kopyası
 * kullanılır). Loader "libicuuc.so.60" gibi SONAME arar; eksikse initdb 127 ile
 * düşer. Bu adım kopyaları idempotent olarak geri getirir.
 *
 * Faz 14 düzeltmesi: yalnız ".so" temel kopyası yetmez — yükleyici öncelikle
 * major sürümlü SONAME'i ("libicuuc.so.60") arar; ".so" mevcutken ".so.60"
 * eksikse hâlâ 127 düşüyordu. Artık her sürümlü dosyadan hem ".so.major" hem
 * ".so" hedefleri ayrı ayrı kontrol edilip kopyalanır.
 */
function hydrateSonameCopies() {
  const libDir = join(
    process.cwd(),
    'node_modules',
    '@embedded-postgres',
    'linux-x64',
    'native',
    'lib',
  );
  if (!existsSync(libDir)) return;
  for (const file of readdirSync(libDir)) {
    const match = /^(.+\.so)\.(\d+)(?:\.\d+)+(?:\.\d+)?$/.exec(file);
    if (!match) continue;
    const [, base, major] = match;
    for (const target of [`${base}.${major}`, base]) {
      if (!existsSync(join(libDir, target))) {
        copyFileSync(join(libDir, file), join(libDir, target));
      }
    }
  }
}

const PORT = 5433;
const DATA_DIR = resolve(process.cwd(), '.tmp-pg/data');
const POSTGRES_USER = 'vetcore';
const POSTGRES_PASSWORD = 'vetcore-dev';
const POSTGRES_DB = 'vetcore';

async function up() {
  mkdirSync(DATA_DIR, { recursive: true });
  hydrateSonameCopies();
  const { default: EmbeddedPostgres } = require('embedded-postgres');

  // Idempotent: zaten kurulu bir küme varsa initdb'yi yeniden çalıştırma
  // ("data directory might already exist" hatası), yalnızca sunucuyu başlat.
  if (existsSync(join(DATA_DIR, 'PG_VERSION'))) {
    const pg = new EmbeddedPostgres({
      databaseDir: DATA_DIR,
      user: POSTGRES_USER,
      password: POSTGRES_PASSWORD,
      port: PORT,
      persistent: true,
      initdbFlags: ['--lc-messages=C'],
    });
    await pg.start();
    console.log(
      `Gömülü PostgreSQL hazır (mevcut küme): postgresql://${POSTGRES_USER}:***@localhost:${PORT}/${POSTGRES_DB}`,
    );
    console.log('Durdurmak için: pkill -f dev-postgres.mjs (veriler .tmp-pg/ içinde kalır)');
    attachSignalHandlers(pg);
    return;
  }

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
    port: PORT,
    persistent: true,
    // Kütüphane varsayılanı "en_US.UTF-8" her sistemde kurulu değildir (ör. minimal
    // container imajlarında yalnızca C/C.utf8 vardır); initdb hata verir. Son geçen
    // --lc-messages flag'i kazandığı için varsayılanı "C" ile override ediyoruz.
    initdbFlags: ['--lc-messages=C'],
  });

  await pg.initialise(); // initdb bitmeden sunucu başlatılırsa race condition oluşur
  await pg.start();
  await pg.createDatabase(POSTGRES_DB);

  console.log(
    `Gömülü PostgreSQL hazır: postgresql://${POSTGRES_USER}:***@localhost:${PORT}/${POSTGRES_DB}`,
  );
  console.log('Durdurmak için: pkill -f dev-postgres.mjs (veriler .tmp-pg/ içinde kalır)');

  attachSignalHandlers(pg);
}

function attachSignalHandlers(pg) {
  const stop = async () => {
    try {
      await pg.stop();
      console.log('Gömülü PostgreSQL durduruldu');
    } catch {
      // Kapatma sırasında hata önemsiz
    }
    process.exit(0);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  // Daemon modda canlı kal (arka planda çalıştırım için)
  setInterval(() => {}, 1 << 30);
}

async function down() {
  rmSync(DATA_DIR, { recursive: true, force: true });
  console.log('.tmp-pg temizlendi');
}

const command = process.argv[2] ?? 'up';

if (command === 'up') {
  up().catch((error) => {
    console.error('Gömülü PostgreSQL başlatılamadı:', error);
    process.exit(1);
  });
} else if (command === 'down') {
  down();
} else {
  console.error('Kullanım: node scripts/dev-postgres.mjs [up|down]');
  process.exit(1);
}
