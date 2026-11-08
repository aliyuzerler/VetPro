/**
 * Bildirim alan mantığı — Faz 12. Saf fonksiyonlar; Prisma/Nest bağımlılığı yok
 * (birim testleri doğrudan kaplar).
 *
 * Kabul kriterleriyle bağı:
 * - "Notification job retry duplicate message üretmemeli": idempotencyKey
 *   tekilleştirmesi + sağlayıcıya bildirim kimliğinden türetilen deterministik
 *   providerMessageId (aynı bildirimin tüm denemelerinde aynı döner).
 * - "İletişim tercihi/izin kuralı kontrol edilmeli": consentKindForChannel
 *   kanalı OwnerConsent türüne eşler; push (uygulama içi) dış izin istemez.
 * - "Provider başarısızlığı ... retryable status üretmeli": classifyFailure +
 *   durum makinesi processing→queued geri dönüşü tanımlar.
 */

export const NOTIFICATION_CHANNELS = ['push', 'sms', 'email', 'whatsapp'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_CATEGORIES = [
  'appointment',
  'vaccine',
  'lab',
  'hospital',
  'custom',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_STATUSES = [
  'queued',
  'processing',
  'sent',
  'failed',
  'dead_letter',
  'skipped',
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** Sağlayıcı denemesi tükenmeden önceki en fazla gönderim denemesi. */
export const MAX_PROVIDER_ATTEMPTS = 3;

/** Kuyruğa alma anında dış kanallar için zorunlu sahip rızası (OwnerConsent). */
export function consentKindForChannel(channel: NotificationChannel): string | null {
  switch (channel) {
    case 'sms':
      return 'sms';
    case 'email':
      return 'email';
    case 'whatsapp':
      return 'whatsapp';
    case 'push':
      // Uygulama içi bildirim — dış mesajlaşma kanalı olmadığından ayrı rıza istemez.
      return null;
    default:
      return null;
  }
}

/** Konservatif kanal normalizasyonu: telefon → 90xxxxxxxxxx, e-posta → küçük harf. */
export function normalizeRecipient(channel: NotificationChannel, raw: string): string {
  const value = raw.trim();
  if (channel === 'email') return value.toLowerCase();
  const digits = value.replace(/\D+/g, '');
  if (digits.startsWith('90')) return digits;
  if (digits.startsWith('0')) return `90${digits.slice(1)}`;
  if (digits.startsWith('5')) return `90${digits}`;
  return digits;
}

/** Şablondaki {{degisken}} yer tutucularını çıkarır (tekilleştirilmiş sıra). */
export function requiredTemplateVars(template: string): string[] {
  const matches = template.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.replace(/\{\{\s*|\s*\}\}/g, '')))];
}

/**
 * Şablonu değişkenlerle doldurur. Değişken adı {{ownerName}} gibi büyük/küçük
 * harf duyarlıdır; eksik değişken TEMPLATE_VAR_MISSING ile reddedilir (sessiz
 * boşluk bırakmak yerine hatayı yüzeye taşıyarak teslim raporunu dürüst tutar).
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = vars[key];
    if (value === undefined || value === null) {
      throw new TemplateVarMissingError(key);
    }
    return value;
  });
}

export class TemplateVarMissingError extends Error {
  constructor(public readonly varName: string) {
    super(`Şablon değişkeni eksik: ${varName}`);
    this.name = 'TemplateVarMissingError';
  }
}

/**
 * Sağlayıcı hatasını sınıflandırır: retryable → kuyruğa geri (backoff ile),
 * permanent → failed (operatör müdahalesi gerekir).
 */
export type FailureClass = 'retryable' | 'permanent';

export function classifyFailure(message: string): FailureClass {
  const normalized = message.toUpperCase();
  const permanentMarkers = [
    'INVALID_RECIPIENT',
    'PERMANENT',
    'CONSENT_',
    'TEMPLATE_',
    'RECIPIENT_MISSING',
    'BLOCKED_LIST',
  ];
  if (permanentMarkers.some((marker) => normalized.includes(marker))) return 'permanent';
  return 'retryable';
}

/** Üstel backoff: 30 sn, 2 dk, 8 dk ... 30 dk üst sınır (deneme numarasına göre). */
export function backoffDelayMs(attemptNo: number): number {
  const step = Math.min(attemptNo - 1, 6);
  return Math.min(30_000 * 2 ** step, 1_800_000);
}

/**
 * Sağlayıcı mesaj kimliği — bildirim kimliğinden deterministik türetilir.
 * Kuyruk retry'ı veya zaman aşımı sonrası ikinci çağrı AYNI kimliği döndürür;
 * sağlayıcı tarafında tekilleştirme kanıtlanabilir (duplicate kabul kriteri).
 */
export function deriveProviderMessageId(notificationId: string, providerName: string): string {
  return `sbx-${providerName}-${notificationId}`;
}

/**
 * Bildirim durum makinesi. Geçersiz geçiş false döner — servis 409 üretir.
 * queued→processing kuyruk talebi (koşullu UPDATE ile tek işleyici kazanır);
 * processing→queued retryable hata sonrası backoff'lu geri dönüş;
 * failed→queued operatörün manuel yeniden kuyruklaması (aynı satır —
 * idempotencyKey ve türetilen sağlayıcı kimliği korunur).
 */
export function canTransitionNotification(
  from: NotificationStatus,
  to: NotificationStatus,
): boolean {
  const table: Record<NotificationStatus, NotificationStatus[]> = {
    queued: ['processing', 'skipped'],
    processing: ['sent', 'queued', 'dead_letter', 'failed'],
    failed: ['queued'],
    // dead_letter terminal DEĞİLDİR: yalnızca operatörün manuel retry ucu
    // (runQueue asla dead_letter'dan okumaz) kaydı yeniden kuyruğa alabilir.
    dead_letter: ['queued'],
    sent: [],
    skipped: [],
  };
  return table[from]?.includes(to) ?? false;
}

/**
 * Sandbox sağlayıcı hata enjeksiyonu — yalnızca sunucu tarafı env'den okunur:
 * "VETCORE_SANDBOX_FAIL=email:once,sms:always". Web/mobile bundle'a girmez.
 */
export function parseSandboxFailPlan(raw: string | undefined): Record<string, 'once' | 'always'> {
  if (!raw) return {};
  const plan: Record<string, 'once' | 'always'> = {};
  for (const part of raw.split(',')) {
    const [channel, mode] = part.split(':').map((s) => s.trim().toLowerCase());
    if (channel && (mode === 'once' || mode === 'always')) plan[channel] = mode;
  }
  return plan;
}
