import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

/**
 * Yedek bundle biçimi ve AES-256-GCM zarfı — Faz 14. Saf katman (I/O yok):
 * - Bundle: "VCBK1" + u32 başlık uzunluğu + başlık JSON (utf8) + ardışık
 *   payload. Başlıkta dosya listesi: path, offset, length, sha256, rows.
 * - Zarf: "VENC1" + iv(12) + authTag(16) + ciphertext (AES-256-GCM).
 *   GCM auth tag bütünlük kanıtıdır — bozulmuş arşiv decrypt'te düşer.
 * - Manifest: arşiv dışında düz JSON — PII taşımaz (yalnız tablo adları,
 *   satır sayıları, checksum'lar); envanter kontrolü anahtarsız yapılabilir.
 */

export const BUNDLE_MAGIC = Buffer.from('VCBK1', 'ascii');
export const ENC_MAGIC = Buffer.from('VENC1', 'ascii');
export const BACKUP_ALGORITHM = 'aes-256-gcm';

export interface BundleFileEntry {
  path: string;
  offset: number;
  length: number;
  sha256: string;
  rows?: number;
}

export interface BundleHeader {
  version: 1;
  createdAt: string;
  files: BundleFileEntry[];
  /** Veritabanı tablo özeti — manifeste kopyalanır */
  tables?: Array<{ name: string; rows: number; sha256: string }>;
  meta?: Record<string, unknown>;
}

export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function createBundle(
  files: Array<{ path: string; data: Buffer; rows?: number }>,
  meta: Record<string, unknown> = {},
): { buffer: Buffer; header: BundleHeader } {
  const headerFiles: BundleFileEntry[] = [];
  let offset = 0;
  const payloadChunks: Buffer[] = [];
  for (const file of files) {
    payloadChunks.push(file.data);
    headerFiles.push({
      path: file.path,
      offset,
      length: file.data.byteLength,
      sha256: sha256Hex(file.data),
      ...(file.rows !== undefined ? { rows: file.rows } : {}),
    });
    offset += file.data.byteLength;
  }
  const payload = Buffer.concat(payloadChunks);
  const header: BundleHeader = {
    version: 1,
    createdAt: new Date().toISOString(),
    files: headerFiles,
    meta,
  };
  const headerJson = Buffer.from(JSON.stringify(header), 'utf8');
  // Prefix 9 bayt: magic 0-5 + u32 başlık uzunluğu 5-9 (üst üste binme yok)
  const prefix = Buffer.alloc(9);
  BUNDLE_MAGIC.copy(prefix, 0);
  prefix.writeUInt32LE(headerJson.byteLength, 5);
  return { buffer: Buffer.concat([prefix, headerJson, payload]), header };
}

export function openBundle(buffer: Buffer): { header: BundleHeader; file: (path: string) => Buffer } {
  if (buffer.subarray(0, 5).equals(BUNDLE_MAGIC) === false) {
    throw new Error('BACKUP_BUNDLE_INVALID');
  }
  const headerLength = buffer.readUInt32LE(5);
  const headerJson = buffer.subarray(9, 9 + headerLength).toString('utf8');
  const header = JSON.parse(headerJson) as BundleHeader;
  const payloadStart = 9 + headerLength;
  return {
    header,
    file: (path: string) => {
      const entry = header.files.find((f) => f.path === path);
      if (!entry) throw new Error(`BACKUP_FILE_MISSING:${path}`);
      return Buffer.from(buffer.subarray(payloadStart + entry.offset, payloadStart + entry.offset + entry.length));
    },
  };
}

/** Kaynaktan 32 bayt anahtar türetir (scrypt, statik bağlam salt'ı). */
export function deriveKey(secret: string): Buffer {
  return scryptSync(secret, 'vetcore-backup-v1', 32);
}

export function encryptBuffer(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv(BACKUP_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = Buffer.alloc(5 + 12 + 16);
  ENC_MAGIC.copy(out, 0);
  iv.copy(out, 5);
  tag.copy(out, 17);
  return Buffer.concat([out, ciphertext]);
}

export function decryptBuffer(enc: Buffer, key: Buffer): Buffer {
  if (enc.subarray(0, 5).equals(ENC_MAGIC) === false) {
    throw new Error('BACKUP_ENVELOPE_INVALID');
  }
  const iv = Buffer.from(enc.subarray(5, 17));
  const tag = Buffer.from(enc.subarray(17, 33));
  const ciphertext = enc.subarray(33);
  const decipher = createDecipheriv(BACKUP_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Başlıktaki checksum'ları gerçek dosya baytlarıyla doğrular (hatalı yolları döner). */
export function verifyBundleChecksums(
  header: BundleHeader,
  read: (path: string) => Buffer,
): Array<{ path: string; expected: string; actual: string }> {
  const mismatches: Array<{ path: string; expected: string; actual: string }> = [];
  for (const entry of header.files) {
    const actual = sha256Hex(read(entry.path));
    if (actual !== entry.sha256) mismatches.push({ path: entry.path, expected: entry.sha256, actual });
  }
  return mismatches;
}

export interface BackupManifest {
  runId: string;
  clinicId: string;
  createdAt: string;
  encrypted: true;
  algorithm: typeof BACKUP_ALGORITHM;
  archiveSha256: string;
  archiveBytes: number;
  tables: Array<{ name: string; rows: number; sha256: string }>;
  totalRows: number;
  objectFileCount: number;
  appVersion: string;
  /** Restore runbook başvurusu — docs/RESTORE_RUNBOOK.md */
  runbook: string;
}
