import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorEnvelope {
  statusCode: number;
  code: string;
  message: string;
  correlationId: string;
  timestamp: string;
  path: string;
  [key: string]: unknown;
}

/**
 * Tüm hataları ortak zarfa çevirir:
 * { statusCode, code, message, correlationId, timestamp, path, ... }
 *
 * - HttpException gövdeleri (ör. readiness 503 sözleşme gövdesi) korunur ve
 *   korelasyon kimliği/tarih damgası eklenir.
 * - Bilinmeyen hatalar için iç yığın izleri istemciye asla döndürülmez
 *   (docs/ARCHITECTURE.md §6).
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { correlationId?: string }>();
    const correlationId = request.correlationId ?? 'bilinmiyor';
    const timestamp = new Date().toISOString();

    const isHttp = exception instanceof HttpException;
    const statusCode = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let envelope: ErrorEnvelope;

    if (isHttp) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        envelope = {
          statusCode,
          code: 'request_error',
          message: body,
          correlationId,
          timestamp,
          path: request.url,
        };
      } else {
        // Sözleşmeli gövdeleri koru (ör. readiness kontrol detayları).
        envelope = {
          code: 'request_error',
          message: exception.message,
          correlationId,
          timestamp,
          path: request.url,
          ...(body as Record<string, unknown>),
          statusCode,
        };
      }
    } else {
      envelope = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'internal_error',
        message: 'Beklenmeyen bir sunucu hatası oluştu',
        correlationId,
        timestamp,
        path: request.url,
      };
      this.logger.error(
        `İşlenmemiş hata (${request.method} ${request.url}): ${
          exception instanceof Error ? exception.message : String(exception)
        }`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(statusCode).json(envelope);
  }
}
