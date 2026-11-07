import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV_TOKEN, type Env } from '../../config/env';

/**
 * Access token — HS256 JWT. jose kütüphanesi yalnızca ESM dağıtır ve API CommonJS
 * derlendiği için standart, bağımlılıksız bir HMAC-SHA256 JWT uygulaması kullanılır
 * (RFC 7519: base64url(header).base64url(payload).base64url(HMAC-SHA256)).
 * Payload izin/şube taşımaz: guard her istekte veritabanından taze yükler.
 */
export type AccessTokenPayload = {
  sub: string; // staffId
  sid: string; // sessionId
  cid: string; // clinicId
  /// Aktif şube (oturum açılışındaki varsayım; canlı değer Session tablosundan okunur)
  br: string | null;
};

type JwtParts = {
  header: { alg: 'HS256'; typ: 'JWT' };
  payload: AccessTokenPayload & { iss: string; aud: string; iat: number; exp: number };
};

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

@Injectable()
export class TokenService {
  private readonly secret: Buffer;
  private readonly ttlSec: number;

  constructor(@Inject(ENV_TOKEN) env: Env) {
    this.secret = Buffer.from(env.AUTH_JWT_SECRET, 'utf8');
    this.ttlSec = env.AUTH_ACCESS_TTL_SEC;
  }

  get accessTtlSeconds(): number {
    return this.ttlSec;
  }

  async signAccessToken(payload: AccessTokenPayload): Promise<string> {
    const header = { alg: 'HS256' as const, typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const fullPayload = {
      ...payload,
      iss: 'vetcore',
      aud: 'vetcore-api',
      iat: now,
      exp: now + this.ttlSec,
    };
    const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(fullPayload))}`;
    const signature = createHmac('sha256', this.secret).update(signingInput).digest('base64url');
    return `${signingInput}.${signature}`;
  }

  /** İmza ve süre doğrular; geçersizse null döner (istisna atmaz). */
  async verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const headerB64 = parts[0];
    const payloadB64 = parts[1];
    const signatureB64 = parts[2];
    if (!headerB64 || !payloadB64 || !signatureB64) return null;
    const expected = createHmac('sha256', this.secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest();
    let actual: Buffer;
    try {
      actual = Buffer.from(signatureB64, 'base64url');
    } catch {
      return null;
    }
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    let parsed: JwtParts['payload'];
    try {
      parsed = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      ) as JwtParts['payload'];
    } catch {
      return null;
    }
    if (parsed.iss !== 'vetcore' || parsed.aud !== 'vetcore-api') return null;
    if (typeof parsed.exp !== 'number' || parsed.exp * 1000 <= Date.now()) return null;
    if (
      typeof parsed.sub !== 'string' ||
      typeof parsed.sid !== 'string' ||
      typeof parsed.cid !== 'string'
    ) {
      return null;
    }
    return {
      sub: parsed.sub,
      sid: parsed.sid,
      cid: parsed.cid,
      br: typeof parsed.br === 'string' ? parsed.br : null,
    };
  }
}
