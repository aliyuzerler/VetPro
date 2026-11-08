import { z } from 'zod';

/**
 * Faz 15 — kalıcı lisans sözleşmesi.
 * Aboneliksiz tek seferlik aktivasyon: satıcı tarafından imzalanan anahtar
 * kurulumda bir kez doğrulanır; uzak kill switch, telefon-home veya telemetri
 * yoktur (agents.md ürün kararı). Doğrulama tamamen çevrimdışıdır.
 */

export const LicenseStatusSchema = z.object({
  activated: z.boolean(),
  licenseeName: z.string().max(200).optional(),
  productEdition: z.string().max(60).optional(),
  activatedAt: z.string().optional(),
  /** Sunucu, aktivasyon doğrulaması için imza anahtarıyla yapılandırılmış mı */
  activationEnabled: z.boolean(),
  /** Lisans anahtarı ham haliyle ASLA döndürülmez; yalnızca son 4 karakter */
  keyTail: z.string().max(8).optional(),
});
export type LicenseStatus = z.infer<typeof LicenseStatusSchema>;

export const ActivateLicenseRequestSchema = z.object({
  licenseKey: z.string().min(8).max(500),
  note: z.string().max(300).optional(),
});
export type ActivateLicenseRequest = z.infer<typeof ActivateLicenseRequestSchema>;
