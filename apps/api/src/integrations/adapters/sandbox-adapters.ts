import { Injectable } from '@nestjs/common';
import {
  SANDBOX_PROVIDER_NAME,
  type EInvoiceAdapterContract,
  type IntegrationAdapter,
  type IntegrationKind,
  type IntegrationMode,
  type LabIntegrationAdapterContract,
} from '../integrations.domain';

/**
 * Sandbox entegrasyon stub'ları — Faz 12. Bunlar sahte başarı üretmez:
 * her yanıt sandbox modunu açıkça belirtir ve deterministiktir. Canlı
 * yetkili entegrasyon yokken UI "canlı entegrasyon yok" uyarısı gösterir;
 * gerçek sağlayıcılar (GİB e-fatura, analizör arabirimleri) yetkili
 * sözleşmeyle aynı adapter sözleşmesini uygular (ADR-008/ADR-009).
 */

export class SandboxEInvoiceAdapter implements EInvoiceAdapterContract {
  readonly kind = 'einvoice' as const;
  readonly name = SANDBOX_PROVIDER_NAME;
  readonly mode: IntegrationMode = 'sandbox';

  async ping(_config: Record<string, unknown> | null) {
    void _config;
    return { ok: true, detail: 'Sandbox e-fatura sağlayıcısı yanıt veriyor (canlı bağlantı yok)' };
  }

  async createDraftInvoice(
    config: Record<string, unknown> | null,
    input: { receiverName: string; amount: number; currency: string },
  ) {
    const orgCode = typeof config?.orgCode === 'string' ? config.orgCode : 'ORG';
    const externalId = `SBX-EI-${orgCode}-${Date.now().toString(36)}`;
    return { externalId, status: 'sandbox_draft_created' };
  }
}

export class SandboxLabAdapter implements LabIntegrationAdapterContract {
  readonly kind = 'lab' as const;
  readonly name = SANDBOX_PROVIDER_NAME;
  readonly mode: IntegrationMode = 'sandbox';

  async ping(_config: Record<string, unknown> | null) {
    void _config;
    return { ok: true, detail: 'Sandbox lab sağlayıcısı yanıt veriyor (canlı bağlantı yok)' };
  }

  async submitOrder(
    _config: Record<string, unknown> | null,
    input: { labelCode: string; testCode: string },
  ) {
    void input;
    return { externalId: `SBX-LAB-${Date.now().toString(36)}`, status: 'sandbox_order_submitted' };
  }

  async fetchResult(_config: Record<string, unknown> | null, externalId: string) {
    void externalId;
    // Sandbox deterministik davranır: bekleyen sonuç — gerçek analizör verisi değildir.
    return { status: 'pending' as const };
  }
}

/** Adapter fabrikası — kind + provider + mode'a göre stub döndürür. */
@Injectable()
export class IntegrationAdapterFactory {
  resolve(kind: IntegrationKind, providerName: string, mode: IntegrationMode): IntegrationAdapter {
    if (providerName === SANDBOX_PROVIDER_NAME) {
      if (kind === 'einvoice') return new SandboxEInvoiceAdapter();
      return new SandboxLabAdapter();
    }
    // Canlı sağlayıcılar yetkili sözleşmeyle buraya eklenir; tanınmayan
    // sağlayıcı sandbox'a düşer ve mode sandbox olarak raporlanır.
    if (kind === 'einvoice') return new SandboxEInvoiceAdapter();
    return new SandboxLabAdapter();
  }
}
