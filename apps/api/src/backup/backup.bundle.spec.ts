import { describe, expect, it } from 'vitest';
import {
  createBundle,
  createBundle as buildBundle,
  decryptBuffer,
  deriveKey,
  encryptBuffer,
  openBundle,
  sha256Hex,
  verifyBundleChecksums,
} from './backup.bundle';

describe('Faz 14 yedek bundle ve şifreleme', () => {
  const key = deriveKey('vetcore-test-backup-key');

  it('createBundle/openBundle: turlaşım — başlık, offset, sha256', () => {
    const files = [
      { path: 'db/owners.jsonl', data: Buffer.from('{"id":"1"}\n', 'utf8'), rows: 1 },
      { path: 'db/patients.jsonl', data: Buffer.from('{"id":"2"}\n{"id":"3"}\n', 'utf8'), rows: 2 },
      { path: 'config.json', data: Buffer.from('{"clinic":"demo"}', 'utf8') },
    ];
    const { buffer, header } = buildBundle(files);
    // Magic kontrolü
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('VCBK1');
    const opened = openBundle(buffer);
    expect(opened.header.files).toHaveLength(3);
    expect(opened.file('db/patients.jsonl').toString('utf8')).toBe('{"id":"2"}\n{"id":"3"}\n');
    expect(opened.file('config.json').toString('utf8')).toBe('{"clinic":"demo"}');
    // Başlıktaki checksum'lar gerçek baytlarla eşleşir
    expect(verifyBundleChecksums(opened.header, opened.file)).toHaveLength(0);
    expect(header.files[1]).toMatchObject({ rows: 2 });
  });

  it('openBundle: bozuk magic reddedilir', () => {
    expect(() => openBundle(Buffer.from('XXXXX-not-a-bundle'))).toThrow('BACKUP_BUNDLE_INVALID');
  });

  it('encrypt/decrypt: AES-256-GCM turlaşımı', () => {
    const plain = Buffer.from('gizli yedek içeriği ğüşİÖÇ', 'utf8');
    const enc = encryptBuffer(plain, key);
    expect(enc.subarray(0, 5).toString('ascii')).toBe('VENC1');
    expect(enc.equals(plain)).toBe(false);
    const dec = decryptBuffer(enc, key);
    expect(dec.equals(plain)).toBe(true);
  });

  it('decrypt: tek bayt bozulma auth tag ile düşer (bütünlük kanıtı)', () => {
    const plain = Buffer.from('backup payload', 'utf8');
    const enc = Buffer.from(encryptBuffer(plain, key));
    enc[enc.byteLength - 1]! ^= 0xff; // son baytı boz
    expect(() => decryptBuffer(enc, key)).toThrow();
  });

  it('decrypt: yanlış anahtar reddedilir', () => {
    const plain = Buffer.from('backup payload', 'utf8');
    const enc = encryptBuffer(plain, key);
    expect(() => decryptBuffer(enc, deriveKey('baska-anahtar'))).toThrow();
  });

  it('verifyBundleChecksums: bozulmuş dosya tespiti', () => {
    const { buffer } = createBundle([
      { path: 'db/t.jsonl', data: Buffer.from('row1\nrow2\n', 'utf8'), rows: 2 },
    ]);
    const opened = openBundle(buffer);
    const tampered = Buffer.from('row1\nrowX\n', 'utf8');
    const read = (path: string) => (path === 'db/t.jsonl' ? tampered : Buffer.alloc(0));
    const mismatches = verifyBundleChecksums(opened.header, read);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({ path: 'db/t.jsonl' });
  });

  it('sha256Hex: boş buffer bilinen özet', () => {
    expect(sha256Hex(Buffer.alloc(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});
