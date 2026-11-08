import { Injectable, Logger } from '@nestjs/common';
import {
  deriveProviderMessageId,
  parseSandboxFailPlan,
  type FailureClass,
  type NotificationChannel,
} from '../notifications.domain';

/**
 * Sağlayıcı sözleşmesi — ADR-008 deseninin bildirim uzantısı. Gerçek SMS/e-posta/
 * WhatsApp/push sağlayıcıları (NetgSM, SendGrid, Meta Cloud API, FCM vb.) aynı
 * arayüzle eklenir; sandbox stub'ları geliştirme ve test içindir.
 *
 * Kurallar:
 * - idempotencyKey = Notification.id: sağlayıcı çağrısı bildirim başına
 *   tekilleşir; providerMessageId deterministik türetilir (retry duplicate yok).
 * - Hata asla sessiz yutulmaz: ProviderError (retryable/permanent) fırlatılır,
 *   kuyruk işleyicisi kaydın durumunu buna göre günceller.
 */
export interface ProviderSendInput {
  channel: NotificationChannel;
  /** Normalleştirilmiş alıcı (telefon 90..., e-posta küçük harf). */
  to: string;
  subject?: string | null;
  body: string;
  /** Sağlayıcı tarafı tekilleştirme anahtarı — Notification.id. */
  idempotencyKey: string;
}

export interface ProviderSendResult {
  providerMessageId: string;
  deliveredAt: Date;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly failureClass: FailureClass,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface NotificationProvider {
  readonly name: string;
  send(input: ProviderSendInput): Promise<ProviderSendResult>;
}

/**
 * Sandbox sağlayıcı tabanı — deterministik stub. Hata enjeksiyonu yalnızca
 * sunucu tarafı VETCORE_SANDBOX_FAIL env'inden gelir (web/mobile bundle'ına
 * giremez); 'once' modu kimlik başına tek kez, 'always' modu her çağrıda hata üretir.
 */
abstract class SandboxProviderBase implements NotificationProvider {
  abstract readonly name: string;
  abstract readonly channel: NotificationChannel;
  protected readonly logger = new Logger('SandboxProvider');
  private readonly failedOnce = new Set<string>();

  constructor(private readonly failMode?: 'once' | 'always') {}

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    if (this.failMode === 'always') {
      throw new ProviderError(
        `${this.channel.toUpperCase()}_PROVIDER_TIMEOUT (sandbox fail plan: always)`,
        'retryable',
      );
    }
    if (this.failMode === 'once' && !this.failedOnce.has(input.idempotencyKey)) {
      this.failedOnce.add(input.idempotencyKey);
      throw new ProviderError(
        `${this.channel.toUpperCase()}_PROVIDER_TIMEOUT (sandbox fail plan: once)`,
        'retryable',
      );
    }
    // Sağlayıcı hata eşikleri dışında alıcı doğrulaması: boş/geçersiz alıcı kalıcıdır.
    if (!input.to || input.to.length < 5) {
      throw new ProviderError('INVALID_RECIPIENT', 'permanent');
    }
    this.logger.debug(
      `[sandbox:${this.channel}] ${input.to} — mesaj kuyruğa alındı (idem=${input.idempotencyKey})`,
    );
    return {
      providerMessageId: deriveProviderMessageId(input.idempotencyKey, this.name),
      deliveredAt: new Date(),
    };
  }
}

export class SandboxPushProvider extends SandboxProviderBase {
  readonly name = 'sandbox-push';
  readonly channel = 'push' as const;
}

export class SandboxSmsProvider extends SandboxProviderBase {
  readonly name = 'sandbox-sms';
  readonly channel = 'sms' as const;
}

export class SandboxEmailProvider extends SandboxProviderBase {
  readonly name = 'sandbox-email';
  readonly channel = 'email' as const;
}

export class SandboxWhatsappProvider extends SandboxProviderBase {
  readonly name = 'sandbox-whatsapp';
  readonly channel = 'whatsapp' as const;
}

/**
 * Sağlayıcı kaydı — kanala göre sağlayıcı döndürür. Sandbox fail planı
 * VETCORE_SANDBOX_FAIL env'inden okunur ("channel:once|always" virgülle ayrılmış).
 * Canlı sağlayıcılar yetkili sözleşmeyle buraya eklenir (ADR-008).
 */
@Injectable()
export class NotificationProviderRegistry {
  private readonly failPlan: Record<string, 'once' | 'always'>;
  private readonly providers: Map<NotificationChannel, NotificationProvider>;

  constructor() {
    // Hata planı yalnızca sunucu tarafı env'den okunur (bundle'a girmez):
    // VETCORE_SANDBOX_FAIL="sms:always,email:once".
    this.failPlan = parseSandboxFailPlan(process.env.VETCORE_SANDBOX_FAIL);
    const build = (provider: SandboxProviderBase, channel: NotificationChannel) => {
      const mode = this.failPlan[channel];
      // failMode kurucuda okunur; kayıt anında kanala göre yeniden inşa edilir.
      const Ctor = provider.constructor as new (mode?: 'once' | 'always') => SandboxProviderBase;
      return new Ctor(mode);
    };
    this.providers = new Map<NotificationChannel, NotificationProvider>([
      ['push', build(new SandboxPushProvider(), 'push')],
      ['sms', build(new SandboxSmsProvider(), 'sms')],
      ['email', build(new SandboxEmailProvider(), 'email')],
      ['whatsapp', build(new SandboxWhatsappProvider(), 'whatsapp')],
    ]);
  }

  resolve(channel: NotificationChannel): NotificationProvider {
    const provider = this.providers.get(channel);
    if (!provider) {
      throw new ProviderError(`UNKNOWN_CHANNEL:${channel}`, 'permanent');
    }
    return provider;
  }
}
