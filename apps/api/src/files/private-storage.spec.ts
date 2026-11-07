import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { LocalPrivateStorageAdapter } from './private-storage';

/** Private storage adaptörü — yerel disk uygulaması sözleşme testleri. */
describe('LocalPrivateStorageAdapter', () => {
  let root: string;
  let adapter: LocalPrivateStorageAdapter;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'vetcore-storage-'));
    adapter = new LocalPrivateStorageAdapter(root);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('kaydet → oku gidiş dönüşü bayt düzeyinde korunur', async () => {
    const content = Buffer.from('lab sonucu PDF içeriği (demo)');
    const stored = await adapter.save(content, 'sonuc.pdf', 'application/pdf');
    expect(stored.sizeBytes).toBe(content.byteLength);

    const stream = await adapter.readStream(stored.storageKey);
    expect(stream).not.toBeNull();
    const chunks: Buffer[] = [];
    for await (const chunk of stream as Readable) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString('utf8')).toBe(content.toString('utf8'));
  });

  it('storage key dışarıdan dosya adı taşımaz (UUID tabanlı, tahmin edilemez)', async () => {
    const stored = await adapter.save(Buffer.from('x'), 'rapor.txt', 'text/plain');
    expect(stored.storageKey).toMatch(/^[a-f0-9-]{36}\.bin$/);
    expect(stored.storageKey).not.toContain('rapor');
  });

  it('path traversal denemesi null döner (../../etc/passwd)', async () => {
    expect(await adapter.readStream('../../etc/passwd')).toBeNull();
    expect(await adapter.readStream('../../../etc/shadow')).toBeNull();
  });

  it('geçersiz biçimli anahtar null döner', async () => {
    expect(await adapter.readStream('not-a-uuid.bin')).toBeNull();
    expect(await adapter.readStream('')).toBeNull();
  });

  it('olmayan anahtar null döner (bilgi sızmaz)', async () => {
    expect(await adapter.readStream('00000000-0000-4000-8000-000000000000.bin')).toBeNull();
  });

  it('remove sonrası okuma null döner', async () => {
    const stored = await adapter.save(Buffer.from('silinecek'), 'a.txt', 'text/plain');
    await adapter.remove(stored.storageKey);
    expect(await adapter.readStream(stored.storageKey)).toBeNull();
  });
});
