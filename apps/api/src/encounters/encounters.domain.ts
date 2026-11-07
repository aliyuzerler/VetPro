/**
 * Muayene kaydı durum makinesi ve vital kataloğu — Faz 06.
 *
 * Kabul kriterleri:
 * - Signed encounter doğrudan update/delete edilememeli → EDITABLE_STATUSES dışında
 *   tüm yazma uçları ENCOUNTER_SIGNED (409) döndürür.
 * - İmzasız kayda addendum yazılamaz → ADDENDUM_STATUSES dışı ENCOUNTER_NOT_SIGNED.
 * - Durum makinesi ileri yönlüdür; geçersiz geçiş ENCOUNTER_INVALID_TRANSITION.
 */

export type EncounterStatus = 'draft' | 'in_progress' | 'signed' | 'closed' | 'voided';

export const ENCOUNTER_STATUSES: readonly EncounterStatus[] = [
  'draft',
  'in_progress',
  'signed',
  'closed',
  'voided',
];

/** İçeriği düzenlenebilir (SOAP, vital, tanı, ek, hizmet) durumlar. */
export const EDITABLE_STATUSES: readonly EncounterStatus[] = ['draft', 'in_progress'];

/** Addendum yazılabilen durumlar — yalnızca imzalanmış kayıtlar. */
export const ADDENDUM_STATUSES: readonly EncounterStatus[] = ['signed', 'closed'];

/** İleri yönlü geçişler (voided terminaldir; closed terminaldir). */
const TRANSITIONS: Record<EncounterStatus, readonly EncounterStatus[]> = {
  draft: ['in_progress', 'signed', 'voided'],
  in_progress: ['signed', 'voided'],
  signed: ['closed'],
  closed: [],
  voided: [],
};

export function canTransition(from: EncounterStatus, to: EncounterStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isEditable(status: string): boolean {
  return EDITABLE_STATUSES.includes(status as EncounterStatus);
}

export function acceptsAddendum(status: string): boolean {
  return ADDENDUM_STATUSES.includes(status as EncounterStatus);
}

export class InvalidEncounterTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Geçersiz muayene durumu geçişi: ${from} → ${to}`);
    this.name = 'InvalidEncounterTransitionError';
  }
}

/**
 * Vital bulgu kataloğu — kind anahtarı + varsayılan birim. UI seçim listesi
 * buradan okur; API yalnızca listedeki anahtarları kabul eder.
 */
export const VITAL_KINDS = [
  { kind: 'temp', label: 'Vücut sıcaklığı', unit: '°C' },
  { kind: 'weight', label: 'Ağırlık', unit: 'kg' },
  { kind: 'heart_rate', label: 'Kalp atışı', unit: 'atım/dk' },
  { kind: 'resp_rate', label: 'Solunum', unit: '/dk' },
  { kind: 'cap_refill', label: 'Kapiler dolum', unit: 'sn' },
  { kind: 'blood_pressure', label: 'Tansiyon', unit: 'mmHg' },
  { kind: 'glucose', label: 'Kan şekeri', unit: 'mg/dL' },
  { kind: 'pain_score', label: 'Ağrı skoru', unit: '0-10' },
  { kind: 'other', label: 'Diğer', unit: '' },
] as const;

export const VITAL_KIND_KEYS = VITAL_KINDS.map((v) => v.kind);

export function vitalUnitFor(kind: string): string | null {
  return VITAL_KINDS.find((v) => v.kind === kind)?.unit ?? null;
}

/** ServiceRecord durumları — Faz 08'te finalized gerçek stok/finans post'u tetikler. */
export type ServiceRecordStatus = 'draft' | 'finalized';

/** Hizmet satırı tutar hesabı: qty * unitPrice - discount + tax (2 ondalık, banka yuvarlama). */
export function computeLineTotal(
  qty: number | string,
  unitPrice: number | string,
  discount: number | string,
  tax: number | string,
): string {
  const gross = Number(qty) * Number(unitPrice);
  const net = gross - Number(discount) + Number(tax);
  return (Math.round(net * 100) / 100).toFixed(2);
}
