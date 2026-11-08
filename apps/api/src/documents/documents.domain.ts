/**
 * Belge alan mantığı — Faz 12. Saf fonksiyonlar: belge türleri, numaralandırma
 * ve anlık görüntü (snapshot) yapısı. PDF çizimi renderer'dadır.
 */

export const DOCUMENT_KINDS = [
  'exam_summary',
  'vaccine_card',
  'prescription',
  'consent',
  'lab_report',
  'discharge',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface DocumentKindMeta {
  kind: DocumentKind;
  label: string;
  /** Kaynak varlık türü — UI "kaynak seç" diyaloğunu bundan türetir. */
  source: 'encounter' | 'patient' | 'prescription' | 'owner' | 'lab_order' | 'hospital_stay';
  /** Snapshot zorunlu imza/durum alanı gerektirir mi (reçete imza kriteri). */
  requiresSignatureStatus: boolean;
}

export const DOCUMENT_KIND_META: Record<DocumentKind, DocumentKindMeta> = {
  exam_summary: {
    kind: 'exam_summary',
    label: 'Muayene Özeti',
    source: 'encounter',
    requiresSignatureStatus: false,
  },
  vaccine_card: {
    kind: 'vaccine_card',
    label: 'Aşı Kartı',
    source: 'patient',
    requiresSignatureStatus: false,
  },
  prescription: {
    kind: 'prescription',
    label: 'Reçete',
    source: 'prescription',
    requiresSignatureStatus: true,
  },
  consent: {
    kind: 'consent',
    label: 'Onam Formu',
    source: 'owner',
    requiresSignatureStatus: false,
  },
  lab_report: {
    kind: 'lab_report',
    label: 'Lab Raporu',
    source: 'lab_order',
    requiresSignatureStatus: false,
  },
  discharge: {
    kind: 'discharge',
    label: 'Taburculuk Özeti',
    source: 'hospital_stay',
    requiresSignatureStatus: false,
  },
};

/** BELGE-0001 biçiminde numara üretir; sıfır dolgulu 4 basamak (lexik sıra güvenli). */
export function formatDocumentNo(seq: number): string {
  return `BELGE-${String(seq).padStart(4, '0')}`;
}

/** Depolanan son belge numarasından sıradaki numarayı hesaplar. */
export function nextDocumentNo(latestNo: string | null | undefined): string {
  if (!latestNo) return formatDocumentNo(1);
  const match = latestNo.match(/^BELGE-(\d{4,})$/);
  if (!match) return formatDocumentNo(1);
  return formatDocumentNo(Number(match[1]) + 1);
}

/** PDF satır yapısı — renderer'ın çizdiği bölüm içerikleri. */
export type DocSection =
  | { type: 'keyValue'; title?: string; rows: Array<{ label: string; value: string }> }
  | { type: 'paragraph'; title?: string; text: string }
  | {
      type: 'table';
      title?: string;
      columns: string[];
      widths: number[];
      rows: string[][];
    };

export interface DocumentBuildResult {
  title: string;
  sections: DocSection[];
  /** Denetlenebilir anlık görüntü — PrintDocument.snapshot alanına yazılır. */
  snapshot: Record<string, unknown>;
  /** Reçete taslaksa filigran metni ("TASLAK — İMZALANMAMIŞ"). */
  watermark?: string;
  /** İmza bloğu — reçete imzalıysa veteriner + unvan + zaman. */
  signature?: {
    veterinarianName: string;
    veterinarianTitle: string;
    signedAt: string;
    authorizedStatus: string;
  };
}

/** TR tarih biçimi (Europe/Istanbul) — snapshot ve PDF aynı metni taşır. */
export function formatTrDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatTrDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/** Decimal Prisma alanlarını güvenli sayıya çevirir. */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  // Prisma.Decimal
  const candidate = value as { toNumber?: () => number };
  if (typeof candidate.toNumber === 'function') return candidate.toNumber();
  return null;
}
