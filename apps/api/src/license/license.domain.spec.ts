import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { LicenseService } from './license.service';

/**
 * Faz 15 — lisans doğrulama mantığı birim testleri (DB'siz, stub prisma).
 * Kalıcı lisans: çevrimdışı doğrulama, abonelik yok, kill switch yok.
 */

const SIGNING_KEY = 'test-signing-key-0123456789abcdef';

function makeKey(
  licensee: string,
  signingKey = SIGNING_KEY,
  opts: { edition?: string; tamperSig?: boolean; omitSig?: boolean } = {},
): string {
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      licensee,
      edition: opts.edition ?? 'standard',
      issuedAt: '2026-11-09T00:00:00Z',
    }),
    'utf8',
  ).toString('base64url');
  const sig = createHmac('sha256', signingKey).update(payload).digest('base64url');
  return `VETCORE.${payload}.${opts.omitSig ? '' : opts.tamperSig ? 'A'.repeat(sig.length) : sig}`;
}

function makeService(licenseSigningKey: string): LicenseService {
  const env = { VETCORE_LICENSE_SIGNING_KEY: licenseSigningKey } as never;
  const prisma = {
    licenseActivation: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'lic-1',
        activatedAt: new Date('2026-11-09T00:00:00Z'),
        ...data,
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'lic-1',
        activatedAt: new Date('2026-11-09T00:00:00Z'),
        ...data,
      }),
    },
    auditEvent: { create: async () => ({}) },
  } as never;
  return new LicenseService(env, prisma);
}

describe('LicenseService doğrulama mantığı', () => {
  it('imza anahtarı yoksa aktivasyon 503 LICENSE_SIGNING_DISABLED ile reddedilir', async () => {
    const service = makeService('');
    expect(service.activationEnabled).toBe(false);
    await expect(service.activate('c1', 's1', makeKey('Klinik'), undefined)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('geçerli anahtar aktivasyonu onaylar ve durum döner', async () => {
    const service = makeService(SIGNING_KEY);
    const key = makeKey('VetCore Demo Kliniği', SIGNING_KEY, { edition: 'standard' });
    const status = await service.activate('c1', 's1', key, 'kurulum');
    expect(status.activated).toBe(true);
    expect(status.licenseeName).toBe('VetCore Demo Kliniği');
    expect(status.productEdition).toBe('standard');
    // Anahtar ham haliyle ASLA döndürülmez; yalnızca son 4 karakter:
    expect(status.keyTail).toBe(key.slice(-4));
    expect(status.keyTail!.length).toBe(4);
    expect(JSON.stringify(status)).not.toContain(key);
  });

  it('biçimi bozuk anahtar 400 LICENSE_MALFORMED ile reddedilir', async () => {
    const service = makeService(SIGNING_KEY);
    await expect(service.activate('c1', 's1', 'ABC.DEF', undefined)).rejects.toMatchObject({
      response: { code: 'LICENSE_MALFORMED' },
    });
    await expect(
      service.activate('c1', 's1', 'VETCORE.onlypayload', undefined),
    ).rejects.toMatchObject({
      response: { code: 'LICENSE_MALFORMED' },
    });
  });

  it('yanlış imza 400 LICENSE_BAD_SIGNATURE ile reddedilir (BadRequestException)', async () => {
    const service = makeService(SIGNING_KEY);
    const tampered = makeKey('Klinik', SIGNING_KEY, { tamperSig: true });
    await expect(service.activate('c1', 's1', tampered, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.activate('c1', 's1', tampered, undefined)).rejects.toMatchObject({
      response: { code: 'LICENSE_BAD_SIGNATURE' },
    });
  });

  it('farklı imza anahtarıyla üretilen anahtar reddedilir', async () => {
    const service = makeService('another-signing-key-ffffffffffff');
    const key = makeKey('Klinik', SIGNING_KEY);
    await expect(service.activate('c1', 's1', key, undefined)).rejects.toMatchObject({
      response: { code: 'LICENSE_BAD_SIGNATURE' },
    });
  });

  it('licensee alanı olmayan yük reddedilir', async () => {
    const service = makeService(SIGNING_KEY);
    const payload = Buffer.from(JSON.stringify({ v: 1 }), 'utf8').toString('base64url');
    const sig = createHmac('sha256', SIGNING_KEY).update(payload).digest('base64url');
    await expect(
      service.activate('c1', 's1', `VETCORE.${payload}.${sig}`, undefined),
    ).rejects.toMatchObject({
      response: { code: 'LICENSE_MALFORMED' },
    });
  });

  it('activationEnabled yalnız imza anahtarı yapılandırılmışsa doğrudur', () => {
    expect(makeService('').activationEnabled).toBe(false);
    expect(makeService(SIGNING_KEY).activationEnabled).toBe(true);
  });
});
