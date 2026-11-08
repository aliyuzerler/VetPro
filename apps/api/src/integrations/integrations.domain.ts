/**
 * Entegrasyon alan mantığı — Faz 12. Adapter sözleşmeleri (ADR-008/ADR-009):
 * e-fatura ve lab entegrasyonları mock DEĞİL, sözleşme + sandbox stub.
 * Canlı yetkili entegrasyon yoksa API bu durumu açıkça raporlar.
 */

export const INTEGRATION_KINDS = ['einvoice', 'lab'] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export const INTEGRATION_MODES = ['sandbox', 'live'] as const;
export type IntegrationMode = (typeof INTEGRATION_MODES)[number];

export const INTEGRATION_STATUSES = ['active', 'inactive'] as const;

/** Yasak config anahtar deseni — sağlayıcı secret veritabanına yazılamaz. */
const SECRET_KEY_PATTERN = /(pass(word)?|secret|token|api[-_]?key|credential|auth)/i;

export function containsSecretKey(config: unknown): string | null {
  if (!config || typeof config !== 'object') return null;
  for (const key of Object.keys(config as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) return key;
  }
  return null;
}

/**
 * Adapter sözleşmesi — e-fatura. Canlı yetkili entegrasyon için özel
 * sağlayıcı sınıfları bu arayüzü uygular; mode her zaman yüzeye yansır.
 */
export interface EInvoiceAdapterContract {
  readonly kind: 'einvoice';
  readonly name: string;
  readonly mode: IntegrationMode;
  /** Bağlantı/parametre sağlığı kontrolü — sandbox stub deterministik döner. */
  ping(config: Record<string, unknown> | null): Promise<{ ok: boolean; detail: string }>;
  /** Taslak fatura gönderimi — sandbox stub'ta dış kimlik üretir. */
  createDraftInvoice(
    config: Record<string, unknown> | null,
    input: { receiverName: string; amount: number; currency: string },
  ): Promise<{ externalId: string; status: string }>;
}

/** Adapter sözleşmesi — lab entegrasyonu (analizör sonuç aktarımı). */
export interface LabIntegrationAdapterContract {
  readonly kind: 'lab';
  readonly name: string;
  readonly mode: IntegrationMode;
  ping(config: Record<string, unknown> | null): Promise<{ ok: boolean; detail: string }>;
  submitOrder(
    config: Record<string, unknown> | null,
    input: { labelCode: string; testCode: string },
  ): Promise<{ externalId: string; status: string }>;
  fetchResult(
    config: Record<string, unknown> | null,
    externalId: string,
  ): Promise<{ status: 'pending' | 'completed'; value?: string; unit?: string }>;
}

export type IntegrationAdapter = EInvoiceAdapterContract | LabIntegrationAdapterContract;

/** Sandbox stub'ları sağlayıcı kimliği; canlı sağlayıcılar ayrıca eklenir. */
export const SANDBOX_PROVIDER_NAME = 'vetcore-sandbox';
