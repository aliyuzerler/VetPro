import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { LicenseStatus } from '@vetcore/contracts';
import { ENV_TOKEN, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Faz 15 — kalıcı lisans aktivasyon servisi.
 *
 * Tasarım (agents.md ürün kararı: tek seferlik kalıcı lisans, abonelik yok):
 * - Anahtar biçimi şeffaftır: `VETCORE.<payload-b64url>.<sig-b64url>`
 *   payload = base64url(JSON {v, licensee, edition, issuedAt})
 *   sig     = base64url(HMAC-SHA256(payload, satıcı imza anahtarı))
 * - Doğrulama tamamen çevrimdışıdır; ağ çağrısı, kill switch veya telemetri yoktur.
 * - Aktivasyon klinik başına tek kayıttır; yeniden aktivasyon geçerli yeni
 *   anahtarla yapılır ve denetim kaydına yazılır.
 */
@Injectable()
export class LicenseService {
  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  get activationEnabled(): boolean {
    return this.env.VETCORE_LICENSE_SIGNING_KEY.length > 0;
  }

  async status(clinicId: string): Promise<LicenseStatus> {
    const activation = await this.prisma.licenseActivation.findUnique({
      where: { clinicId },
    });
    if (!activation) {
      return { activated: false, activationEnabled: this.activationEnabled };
    }
    return {
      activated: true,
      licenseeName: activation.licenseeName,
      productEdition: activation.productEdition,
      activatedAt: activation.activatedAt.toISOString(),
      activationEnabled: this.activationEnabled,
      keyTail: activation.licenseKey.slice(-4),
    };
  }

  /**
   * Anahtarı doğrular ve klinik için kaydeder.
   * Hata kodları: LICENSE_SIGNING_DISABLED, LICENSE_MALFORMED, LICENSE_BAD_SIGNATURE.
   */
  async activate(
    clinicId: string,
    staffId: string,
    licenseKey: string,
    note?: string,
  ): Promise<LicenseStatus> {
    if (!this.activationEnabled) {
      throw new ServiceUnavailableException({
        code: 'LICENSE_SIGNING_DISABLED',
        message: 'Lisans aktivasyonu sunucuda yapılandırılmadı (VETCORE_LICENSE_SIGNING_KEY).',
      });
    }
    const parsed = this.parseKey(licenseKey.trim());
    const existing = await this.prisma.licenseActivation.findUnique({ where: { clinicId } });

    const activation = existing
      ? await this.prisma.licenseActivation.update({
          where: { clinicId },
          data: {
            licenseKey: parsed.key,
            licenseeName: parsed.payload.licensee,
            productEdition: parsed.payload.edition,
            activatedAt: new Date(),
            activatedByStaffId: staffId,
            note: note ?? null,
          },
        })
      : await this.prisma.licenseActivation.create({
          data: {
            clinicId,
            licenseKey: parsed.key,
            licenseeName: parsed.payload.licensee,
            productEdition: parsed.payload.edition,
            activatedByStaffId: staffId,
            note: note ?? null,
          },
        });

    await this.prisma.auditEvent.create({
      data: {
        clinicId,
        staffId,
        action: existing ? 'license.reactivate' : 'license.activate',
        entityType: 'LicenseActivation',
        entityId: activation.id,
        metadata: {
          licensee: activation.licenseeName,
          edition: activation.productEdition,
          ...(note ? { note } : {}),
        },
      },
    });

    return {
      activated: true,
      licenseeName: activation.licenseeName,
      productEdition: activation.productEdition,
      activatedAt: activation.activatedAt.toISOString(),
      activationEnabled: true,
      keyTail: activation.licenseKey.slice(-4),
    };
  }

  /** Anahtarı ayrıştırır ve imzayı zaman-güvenli karşılaştırmayla doğrular. */
  private parseKey(raw: string): { key: string; payload: LicensePayload } {
    const parts = raw.split('.');
    if (parts.length !== 3 || parts[0] !== 'VETCORE') {
      throw badLicense(
        'LICENSE_MALFORMED',
        'Lisans anahtarı biçimi geçersiz (beklenen: VETCORE.<payload>.<imza>).',
      );
    }
    const [, payloadB64, sigB64] = parts;
    if (!payloadB64) {
      throw badLicense('LICENSE_MALFORMED', 'Lisans yükü boş.');
    }
    let payloadJson: string;
    try {
      payloadJson = Buffer.from(payloadB64 ?? '', 'base64url').toString('utf8');
    } catch {
      throw badLicense('LICENSE_MALFORMED', 'Lisans yükü çözümlenemedi.');
    }
    let payload: LicensePayload;
    try {
      const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
      if (typeof parsed.licensee !== 'string' || parsed.licensee.length === 0) {
        throw new Error('licensee zorunlu');
      }
      payload = {
        v: typeof parsed.v === 'number' ? parsed.v : 1,
        licensee: parsed.licensee,
        edition: typeof parsed.edition === 'string' ? parsed.edition : 'standard',
        issuedAt: typeof parsed.issuedAt === 'string' ? parsed.issuedAt : undefined,
      };
    } catch {
      throw badLicense('LICENSE_MALFORMED', 'Lisans yükü geçersiz.');
    }

    const expected = createHmac('sha256', this.env.VETCORE_LICENSE_SIGNING_KEY)
      .update(payloadB64)
      .digest('base64url');
    const a = Buffer.from(expected);
    const b = Buffer.from(sigB64 ?? '');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw badLicense(
        'LICENSE_BAD_SIGNATURE',
        'Lisans imzası doğrulanamadı; anahtarı satıcınızdan aldığınız haliyle girin.',
      );
    }
    return { key: raw, payload };
  }
}

export interface LicensePayload {
  v: number;
  licensee: string;
  edition: string;
  issuedAt?: string;
}

function badLicense(
  code: 'LICENSE_MALFORMED' | 'LICENSE_BAD_SIGNATURE',
  message: string,
): BadRequestException {
  return new BadRequestException({ code, message });
}
