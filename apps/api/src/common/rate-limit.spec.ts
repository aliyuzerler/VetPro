import { describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { RateLimitMiddleware } from './rate-limit.middleware';

/**
 * Faz 15 — hız sınırlayıcı birim testleri (ağ/DB'siz).
 * 429 + Retry-After + Limit/Remaining başlıkları + kimlik ucu katılığı.
 */

function fakeReq(path: string, ip = '10.0.0.1', forwarded?: string): Request {
  return {
    path,
    ip,
    socket: { remoteAddress: ip },
    headers: forwarded ? { 'x-forwarded-for': forwarded } : {},
  } as unknown as Request;
}

interface FakeRes {
  res: Response;
  statuses: number[];
  bodies: unknown[];
  headers: Record<string, string>;
}

function fakeRes(): FakeRes {
  const statuses: number[] = [];
  const bodies: unknown[] = [];
  const headers: Record<string, string> = {};
  const res = {
    status(code: number) {
      statuses.push(code);
      return res;
    },
    json(body: unknown) {
      bodies.push(body);
      return res;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
      return res;
    },
  } as unknown as Response;
  return { res, statuses, bodies, headers };
}

const passThrough: NextFunction = () => undefined;

describe('RateLimitMiddleware', () => {
  it('limit altındaki istekler geçer ve Remaining düşer', () => {
    const mw = new RateLimitMiddleware({ authLimit: 3, apiLimit: 100, windowMs: 60_000 });
    for (let i = 0; i < 2; i += 1) {
      const { res, statuses } = fakeRes();
      mw.use(fakeReq('/api/v1/auth/login'), res, passThrough);
      expect(statuses).toHaveLength(0);
    }
    // 3. istek kovayı doldurur → Remaining 0:
    const third = fakeRes();
    mw.use(fakeReq('/api/v1/auth/login'), third.res, passThrough);
    expect(third.statuses).toHaveLength(0);
    expect(third.headers['X-RateLimit-Remaining']).toBe('0');
  });

  it('limit aşımında 429 döner, zincir çağrılmaz ve Retry-After verir', () => {
    const mw = new RateLimitMiddleware({ authLimit: 2, apiLimit: 100, windowMs: 60_000 });
    for (let i = 0; i < 2; i += 1) {
      mw.use(fakeReq('/api/v1/auth/login'), fakeRes().res, passThrough);
    }
    let nextCalled = false;
    const fourth = fakeRes();
    mw.use(fakeReq('/api/v1/auth/login'), fourth.res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(false);
    expect(fourth.statuses).toEqual([429]);
    expect(fourth.bodies[0]).toMatchObject({ statusCode: 429 });
    expect(
      (fourth.bodies[0] as { retryAfterSeconds: number }).retryAfterSeconds,
    ).toBeGreaterThanOrEqual(1);
  });

  it('kimlik uçları genel APIye göre daha katı sınırlanır', () => {
    const mw = new RateLimitMiddleware({ authLimit: 2, apiLimit: 100, windowMs: 60_000 });
    // Genel API'de aynı IP'den 10 istek sorunsuz akar:
    for (let i = 0; i < 10; i += 1) {
      const attempt = fakeRes();
      mw.use(fakeReq('/api/v1/patients'), attempt.res, passThrough);
      expect(attempt.statuses).toHaveLength(0);
    }
    // Aynı IP'de auth ucu 3. istekte 429 alır:
    for (let i = 0; i < 2; i += 1) {
      mw.use(fakeReq('/api/v1/auth/refresh'), fakeRes().res, passThrough);
    }
    const third = fakeRes();
    mw.use(fakeReq('/api/v1/auth/refresh'), third.res, passThrough);
    expect(third.statuses).toEqual([429]);
  });

  it('X-Forwarded-For zincirinin ilk istemcisi kova anahtarıdır', () => {
    const mw = new RateLimitMiddleware({ authLimit: 1, apiLimit: 100, windowMs: 60_000 });
    mw.use(
      fakeReq('/api/v1/auth/login', '127.0.0.1', '203.0.113.7, 10.0.0.2'),
      fakeRes().res,
      passThrough,
    );
    // Farklı ilk istemci kendi kovasında → akar:
    const first = fakeRes();
    mw.use(
      fakeReq('/api/v1/auth/login', '127.0.0.1', '203.0.113.9, 10.0.0.2'),
      first.res,
      passThrough,
    );
    expect(first.statuses).toHaveLength(0);
    // Aynı ilk istemci → 429:
    const again = fakeRes();
    mw.use(
      fakeReq('/api/v1/auth/login', '127.0.0.1', '203.0.113.7, 10.0.0.2'),
      again.res,
      passThrough,
    );
    expect(again.statuses).toEqual([429]);
  });

  it('çok istemcilik akışta harita büyümesi sınırlı kalır ve yeni istemci akar', () => {
    const mw = new RateLimitMiddleware({
      authLimit: 1,
      apiLimit: 1,
      windowMs: 30_000,
      maxEntries: 5,
    });
    for (let i = 0; i < 50; i += 1) {
      mw.use(fakeReq('/api/v1/patients', `10.1.${i}.1`), fakeRes().res, passThrough);
    }
    const fresh = fakeRes();
    mw.use(fakeReq('/api/v1/patients', '10.9.9.9'), fresh.res, passThrough);
    expect(fresh.statuses).toHaveLength(0);
  });
});
