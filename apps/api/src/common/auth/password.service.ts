import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * Parola karma — Node yerleşik scrypt (N=16384, r=8, p=1, 64 bayt anahtar).
 * Depolama formatı: `scrypt:N:r:p:salt_hex:key_hex` — algoritma yükseltilebilir.
 * bcrypt/argon2 yerel bağımlılığı yerine standart kütüphane tercih edildi.
 */
@Injectable()
export class PasswordService {
  private static readonly N = 16384;
  private static readonly R = 8;
  private static readonly P = 1;
  private static readonly KEY_LENGTH = 64;

  hash(password: string): string {
    const salt = randomBytes(16);
    const key = scryptSync(password, salt, PasswordService.KEY_LENGTH, {
      N: PasswordService.N,
      r: PasswordService.R,
      p: PasswordService.P,
    });
    return [
      'scrypt',
      PasswordService.N,
      PasswordService.R,
      PasswordService.P,
      salt.toString('hex'),
      key.toString('hex'),
    ].join(':');
  }

  /** Format bozuk/yabancı hash'lerde false döner; istisna atmaz. */
  verify(password: string, storedHash: string): boolean {
    const parts = storedHash.split(':');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const n = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const saltHex = parts[4];
    const keyHex = parts[5];
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
    if (!saltHex || !keyHex) return false;
    let salt: Buffer;
    let expected: Buffer;
    let actual: Buffer;
    try {
      salt = Buffer.from(saltHex, 'hex');
      expected = Buffer.from(keyHex, 'hex');
      actual = scryptSync(password, salt, expected.length, { N: n, r, p });
    } catch {
      return false;
    }
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
