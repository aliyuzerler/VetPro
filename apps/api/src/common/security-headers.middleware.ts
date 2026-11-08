import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Faz 15 — API güvenlik başlıkları.
 * Tüm yanıtlara savunma amaçlı başlıklar ekler; web arayüzü ayrı Next.js
 * uygulaması olduğundan CSP burada doküman bazlı değil, API zarfı bazlıdır.
 * Helm benzeri bağımlılık eklenmedi — ADR-018: sıfır yeni runtime bağımlılığı.
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    // API yanıt gövdesi tarayıcıda render edilmemeli; bayat tarayıcı önbelleklerini de kilitler.
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    // Hassas uçların (denetim/yedek/rapor) proxy katmanında önbelleklenmemesi için.
    res.setHeader('Cache-Control', 'no-store');
    next();
  }
}
