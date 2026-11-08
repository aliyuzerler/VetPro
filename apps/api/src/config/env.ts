import { z } from 'zod';

/**
 * Ortam değişkeni sözleşmesi.
 * Faz 01: tüm değişkenler varsayılanlı/toleranslıdır; API veritabanı olmadan da
 * açılabilir ve readiness kontrolü durumu dürüstçe raporlar.
 * Faz 03'ten itibaren üretim ortamında zorunlu alanlar sıkılaştırılacaktır.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().min(1).default('VetCore'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'verbose']).default('info'),
  DATABASE_URL: z
    .string()
    .default('postgresql://vetcore:change-me@localhost:5432/vetcore?schema=public'),
  REDIS_URL: z.string().optional(),
  /// HS256 access token imza anahtarı. Development için varsayılan vardır;
  /// üretimde zorunlu olacak (Faz 15 sıkılaştırması).
  AUTH_JWT_SECRET: z.string().min(16).default('dev-only-vetcore-local-secret-change-me'),
  AUTH_ACCESS_TTL_SEC: z.coerce.number().int().positive().default(900), // 15 dk
  AUTH_REFRESH_TTL_SEC: z.coerce.number().int().positive().default(2_592_000), // 30 gün
  CLINIC_TIMEZONE: z.string().default('Europe/Istanbul'),
  DEFAULT_LOCALE: z.string().default('tr-TR'),
  /// Faz 04 — private dosya saklama kök dizini (HTTP tarafından servis edilmez).
  PRIVATE_STORAGE_DIR: z.string().default('.uploads'),
  /// Faz 04 — tek dosya için üst boyut sınırı (byte).
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  /// Faz 15 — CORS izin listesi: virgülle ayrılmış kökenler; boşsa aynı köken
  /// dışındaki tüm tarayıcı istekleri reddedilir (sunucular arası entegrasyonlar
  /// tarayıcı CORS denetimine girmez).
  VETCORE_CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  /// Faz 15 — Swagger UI yalnızca açıkça istenirse yayında kalır (üretimde kapalı).
  VETCORE_ENABLE_SWAGGER: z.coerce.boolean().default(false),
  /// Faz 15 — hız sınırları (dakika başına): kimlik uçları ve genel API.
  VETCORE_RATE_LIMIT_AUTH: z.coerce.number().int().positive().default(20),
  VETCORE_RATE_LIMIT_API: z.coerce.number().int().positive().default(600),
  /// Faz 15 — kalıcı lisans aktivasyon imza anahtarı (satıcı tarafı HMAC-SHA256).
  /// Boşsa lisans uçları yalnızca durum okur; aktivasyon 503 ile reddedilir.
  VETCORE_LICENSE_SIGNING_KEY: z.string().default(''),
  /// Faz 14 yedek anahtarı gibi üretimde zorunlu olan sırlar için ortak kapı.
  VETCORE_REQUIRE_PROD_SECRETS: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof EnvSchema>;

export class EnvValidationError extends Error {
  public readonly issues: string[];

  constructor(issues: string[]) {
    super(`Geçersiz ortam değişkenleri:\n${issues.map((i) => ` - ${i}`).join('\n')}`);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const env = result.data;
  // Faz 15 sıkılaştırması: üretimde geliştirme varsayılanı sırlar kesinlikle kabul edilmez.
  if (env.NODE_ENV === 'production') {
    const prodErrors: string[] = [];
    if (env.AUTH_JWT_SECRET === 'dev-only-vetcore-local-secret-change-me') {
      prodErrors.push('AUTH_JWT_SECRET: üretimde varsayılan geliştirme anahtarı kabul edilmez');
    }
    if (prodErrors.length > 0) {
      throw new EnvValidationError(prodErrors);
    }
  }
  return env;
}

export const ENV_TOKEN = Symbol('ENV');
