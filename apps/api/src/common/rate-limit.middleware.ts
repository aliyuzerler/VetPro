import { Injectable, NestMiddleware } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Faz 15 — bellek içi kayan pencere hız sınırlayıcı.
 *
 * Tasarım kararları (ADR-018):
 * - Tek müşteri kurulum modeli gereği dağıtık olmayan, proses içi sayaç yeterlidir;
 *   Redis bağımlılığı eklenmez. Çok örnekli kurulumda ters vekil katmanı
 *   (infra/nginx) limiti üstlenir.
 * - Kimlik uçları (login/refresh) IP başına katı; genel API istemci başına geniş.
 * - Sınır aşıldığında 429 + Retry-After döner ve denetim yazılmaz (gürültü önleme);
 *   olay yalnızca uygulama loguna düşer.
 * - Harita büyümesi sınırlıdır: pencere sonunda boş girişler silinir, en fazla
 *   maxEntries kayıt tutulur (bellek taşması koruması).
 */

interface WindowEntry {
  hits: number[];
}

export const RATE_LIMIT_DEFAULTS = {
  /** Kimlik uçları: IP başına pencere başına istek. */
  authLimit: 20,
  /** Genel API: istemci başına pencere başına istek. */
  apiLimit: 600,
  /** Pencere uzunluğu (ms). */
  windowMs: 60_000,
  /** Bellek koruması: izlenen en fazla anahtar sayısı. */
  maxEntries: 10_000,
} as const;

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger('RateLimit');
  private readonly windows = new Map<string, WindowEntry>();

  constructor(
    private readonly options: {
      authLimit?: number;
      apiLimit?: number;
      windowMs?: number;
      maxEntries?: number;
    } = {},
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const windowMs = this.options.windowMs ?? RATE_LIMIT_DEFAULTS.windowMs;
    const isAuthPath = req.path.includes('/auth/login') || req.path.includes('/auth/refresh');
    const limit = isAuthPath
      ? (this.options.authLimit ?? RATE_LIMIT_DEFAULTS.authLimit)
      : (this.options.apiLimit ?? RATE_LIMIT_DEFAULTS.apiLimit);

    const key = `${isAuthPath ? 'auth' : 'api'}:${clientKey(req)}`;
    const now = Date.now();

    this.evict(now, windowMs);

    let entry = this.windows.get(key);
    if (!entry) {
      entry = { hits: [] };
      this.windows.set(key, entry);
    }

    entry.hits = entry.hits.filter((t) => now - t < windowMs);

    if (entry.hits.length >= limit) {
      const oldest = entry.hits[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      this.logger.warn(`Hız sınırı aşıldı: ${key} → 429 (pencere=${windowMs}ms limit=${limit})`);
      res.status(429).json({
        statusCode: 429,
        message: 'Çok fazla istek; lütfen kısa süre sonra yeniden deneyin',
        error: 'Too Many Requests',
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    entry.hits.push(now);
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - entry.hits.length)));
    next();
  }

  /** Pencere dışı kalan girişleri ve boş kovaları temizler; harita büyümesini sınırlar. */
  private evict(now: number, windowMs: number): void {
    const maxEntries = this.options.maxEntries ?? RATE_LIMIT_DEFAULTS.maxEntries;
    if (this.windows.size <= maxEntries) return;
    for (const [key, entry] of this.windows) {
      entry.hits = entry.hits.filter((t) => now - t < windowMs);
      if (entry.hits.length === 0) this.windows.delete(key);
    }
    // Hâlâ doluysa en eski anahtarları düşür (deterministik, O(n) tek geçiş).
    if (this.windows.size > maxEntries) {
      for (const key of this.windows.keys()) {
        if (this.windows.size <= maxEntries) break;
        this.windows.delete(key);
      }
    }
  }
}

/** Vekil arkasında X-Forwarded-For zincirinin ilk istemcisini seçer. */
function clientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || forwarded;
  }
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
