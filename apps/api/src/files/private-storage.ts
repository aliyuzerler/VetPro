import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';

/**
 * Özel (private) dosya saklama adaptörü — Faz 04.
 * Tasarım (ADR-018): dosyalar HTTP tarafından erişilemeyen bir dizinde tutulur;
 * indirme yalnızca yetki + şube kapsamı doğrulayan API ucuyla akar. Public URL yok.
 * LocalPrivateStorageAdapter geliştirme/demo içindir; S3 uyumlu adaptör aynı
 * arayüzle sonra eklenebilir (sağlayıcı bağımsızlığı — ADR-008 deseni).
 */
export interface PrivateStorageAdapter {
  /** Dosyayı saklar ve opak bir storage key döndürür (dışarıya URL sızmaz). */
  save(buffer: Buffer, originalName: string, mimeType: string): Promise<StoredFile>;
  /** Storage key'den okunabilir akış döndürür; key geçersizse null. */
  readStream(storageKey: string): Promise<Readable | null>;
  /** Kaydı fiziksel siler (yalnızca test/temizlik; iş akışı silme yapmaz). */
  remove(storageKey: string): Promise<void>;
}

export type StoredFile = {
  storageKey: string;
  sizeBytes: number;
};

export const PRIVATE_STORAGE_DIR = process.env.PRIVATE_STORAGE_DIR ?? '.uploads';

@Injectable()
export class LocalPrivateStorageAdapter implements PrivateStorageAdapter {
  private readonly root: string;

  constructor(root?: string) {
    // root enjekte edilebilir (testlerde tmp dizini); yoksa PRIVATE_STORAGE_DIR.
    this.root = resolve(root ?? join(process.cwd(), PRIVATE_STORAGE_DIR));
  }

  /** Dizin listesini ve ad tahminini engellemek için saklanan dosya adı
   *  yalnızca üretilmiş UUID'den oluşur; MIME meta veride tutulur. */
  async save(buffer: Buffer, originalName: string, _mimeType: string): Promise<StoredFile> {
    void originalName;
    void _mimeType;
    const storageKey = `${randomUUID()}.bin`;
    const target = join(this.root, storageKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer, { mode: 0o600 });
    return { storageKey, sizeBytes: buffer.byteLength };
  }

  async readStream(storageKey: string): Promise<Readable | null> {
    // Path traversal koruması: anahtar yalnızca UUID.bin biçiminde olabilir.
    if (!/^[a-f0-9-]{36}\.bin$/.test(storageKey)) return null;
    const target = join(this.root, storageKey);
    if (!target.startsWith(this.root)) return null;
    try {
      const content = await readFile(target);
      return Readable.from(content);
    } catch {
      return null;
    }
  }

  async remove(storageKey: string): Promise<void> {
    if (!/^[a-f0-9-]{36}\.bin$/.test(storageKey)) return;
    await rm(join(this.root, storageKey), { force: true });
  }
}
