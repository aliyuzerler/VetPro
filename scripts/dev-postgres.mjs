/**
 * Yerel geliştirme PostgreSQL'i — Docker olmadan gömülü PostgreSQL çalıştırır.
 * Kullanım: `pnpm dev:postgres up` | `pnpm dev:postgres down`
 * Veri dizini: .tmp-pg/ (gitignore kapsamında, kalıcı değildir).
 * Üretim/staging ortamında Docker Compose altyapısı kullanılır (infra/docker/).
 */
import { createRequire } from 'node:module';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);

const PORT = 5433;
const DATA_DIR = resolve(process.cwd(), '.tmp-pg/data');
const POSTGRES_USER = 'vetcore';
const POSTGRES_PASSWORD = 'vetcore-dev';
const POSTGRES_DB = 'vetcore';

async function up(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });
  const { default: EmbeddedPostgres } = require('embedded-postgres');
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
    port: PORT,
    persistent: true,
  });

  pg.initialise();
  await pg.start();
  await pg.createDatabase(POSTGRES_DB);

  console.log(`Gömülü PostgreSQL hazır: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${PORT}/${POSTGRES_DB}`);
  console.log('Durdurmak için: pkill -f dev-postgres.mjs (veriler .tmp-pg/ içinde kalır)');

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

async function down(): Promise<void> {
  rmSync(DATA_DIR, { recursive: true, force: true });
  console.log('.tmp-pg temizlendi');
}

const command = process.argv[2] ?? 'up';

if (command === 'up') {
  up().catch((error: unknown) => {
    console.error('Gömülü PostgreSQL başlatılamadı:', error);
    process.exit(1);
  });
} else if (command === 'down') {
  down();
} else {
  console.error('Kullanım: node scripts/dev-postgres.mjs [up|down]');
  process.exit(1);
}
