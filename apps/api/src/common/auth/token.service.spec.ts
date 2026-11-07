import { describe, expect, it } from 'vitest';
import { TokenService } from './token.service';

function serviceWith(secret: string, ttl: number): TokenService {
  return new TokenService({
    AUTH_JWT_SECRET: secret,
    AUTH_ACCESS_TTL_SEC: ttl,
  } as never);
}

const PAYLOAD = { sub: 'staff-1', sid: 'session-1', cid: 'clinic-1', br: 'branch-1' };

describe('TokenService (HS256 JWT)', () => {
  it('imzalanan token doğrulanır ve yük döner', async () => {
    const service = serviceWith('test-secret-0123456789abcdef', 900);
    const token = await service.signAccessToken(PAYLOAD);
    const payload = await service.verifyAccessToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('staff-1');
    expect(payload?.sid).toBe('session-1');
    expect(payload?.cid).toBe('clinic-1');
    expect(payload?.br).toBe('branch-1');
  });

  it('imzası değiştirilmiş token reddedilir', async () => {
    const service = serviceWith('test-secret-0123456789abcdef', 900);
    const token = await service.signAccessToken(PAYLOAD);
    const forged = `${token.slice(0, -4)}AAAA`;
    expect(await service.verifyAccessToken(forged)).toBeNull();
  });

  it('farklı gizli anahtarla imzalanmış token reddedilir', async () => {
    const signer = serviceWith('anahtar-a-0123456789abcdef', 900);
    const verifier = serviceWith('anahtar-b-0123456789abcdef', 900);
    const token = await signer.signAccessToken(PAYLOAD);
    expect(await verifier.verifyAccessToken(token)).toBeNull();
  });

  it('süresi geçmiş token reddedilir', async () => {
    const service = serviceWith('test-secret-0123456789abcdef', -10);
    const token = await service.signAccessToken(PAYLOAD);
    expect(await service.verifyAccessToken(token)).toBeNull();
  });

  it('yanlış formattaki token reddedilir', async () => {
    const service = serviceWith('test-secret-0123456789abcdef', 900);
    expect(await service.verifyAccessToken('bozuk-token')).toBeNull();
    expect(await service.verifyAccessToken('a.b')).toBeNull();
  });
});
