import { z } from 'zod';

/**
 * Sağlık/durum uçlarının ortak sözleşmesi.
 * Web ve mobil aynı şemayı kullanır; API yanıtları bu şemayla doğrulanır.
 */

export const HealthStatusSchema = z.enum(['ok', 'degraded', 'down']);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const HealthCheckSchema = z.object({
  /** Kontrolün kısa adı, ör. "api", "database" */
  name: z.string().min(1),
  status: HealthStatusSchema,
  /** Kontrol süresi (ms); ölçülemiyorsa null */
  latencyMs: z.number().nonnegative().nullable().optional(),
  /** İnsan tarafından okunabilir kısa açıklama (gizli veri içermez) */
  detail: z.string().max(200).optional(),
});
export type HealthCheck = z.infer<typeof HealthCheckSchema>;

export const HealthResponseSchema = z.object({
  status: HealthStatusSchema,
  service: z.string().min(1),
  version: z.string().min(1),
  environment: z.string().min(1),
  uptimeSeconds: z.number().nonnegative(),
  /** ISO 8601 UTC */
  timestamp: z.string().min(1),
  checks: z.array(HealthCheckSchema),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** Readiness yanıtı, liveness yanıtıyla aynı sözleşmeyi paylaşır. */
export const ReadinessResponseSchema = HealthResponseSchema;
export type ReadinessResponse = HealthResponse;
