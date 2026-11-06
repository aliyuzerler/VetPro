import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Her istek için korelasyon kimliği üretir/taşır.
 * Loglar ve hata zarfları bu kimliği taşır; gizli veya kişisel veri içermez.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(CORRELATION_ID_HEADER);
    const correlationId =
      typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128
        ? incoming
        : randomUUID();

    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    (req as Request & { correlationId?: string }).correlationId = correlationId;
    next();
  }
}
