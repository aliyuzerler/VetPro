/**
 * Faz 11 — Cerrahi alan mantığı: olgu yaşam döngüsü, kontrol listesi
 * tamamlanma kuralı ve varsayılan listeler. Saf fonksiyonlar.
 */

export const SURGERY_STATUSES = [
  'planned',
  'prepped',
  'in_surgery',
  'recovery',
  'completed',
  'cancelled',
] as const;
export type SurgeryStatus = (typeof SURGERY_STATUSES)[number];

/**
 * Plan → hazırlık → ameliyat → iyileşme → tamamlandı. İptal yalnız ameliyat
 * başlamadan önce; in_surgery/recovery'den geri dönüş ve iptal yoktur.
 */
export const SURGERY_TRANSITIONS: Record<SurgeryStatus, readonly SurgeryStatus[]> = {
  planned: ['prepped', 'cancelled'],
  prepped: ['in_surgery', 'cancelled'],
  in_surgery: ['recovery'],
  recovery: ['completed'],
  completed: [],
  cancelled: [],
};

export function isSurgeryStatus(value: string): value is SurgeryStatus {
  return (SURGERY_STATUSES as readonly string[]).includes(value);
}

export function canTransitionSurgery(from: string, to: string): boolean {
  if (!isSurgeryStatus(from) || !isSurgeryStatus(to)) return false;
  return SURGERY_TRANSITIONS[from].includes(to);
}

export const SURGERY_CHECKLIST_KINDS = ['pre', 'post'] as const;
export type SurgeryChecklistKind = (typeof SURGERY_CHECKLIST_KINDS)[number];

export interface ChecklistItem {
  label: string;
  done: boolean;
  doneAt?: string | null;
  doneById?: string | null;
}

/**
 * Varsayılan kontroller — olgu 'prepped'e geçerken üretilir; klinik dilde,
 * sentetik demo akışına uygun. Maddeler klinik düzenlenebilir (Json).
 */
export const DEFAULT_CHECKLISTS: Record<SurgeryChecklistKind, string[]> = {
  pre: [
    'Hasta kimliği ve prosedür doğrulandı',
    'Oruç süresi tamamlandı (8-12 saat)',
    'Sahip onayı ve anestezi izni alındı',
    'Operasyon alanı tıraşlandı',
    'IV kanül ve sıvı hazır',
  ],
  post: [
    'Sutura ve pansuman kontrolü yapıldı',
    'Ağrı yönetimi planı yazıldı',
    'Sahibi taburculuk talimatı ile bilgilendirildi',
  ],
};

export function buildDefaultChecklist(kind: SurgeryChecklistKind): ChecklistItem[] {
  return DEFAULT_CHECKLISTS[kind].map((label) => ({ label, done: false, doneAt: null, doneById: null }));
}

/**
 * Kabul kriteri destekleyicisi: ameliyata başlamadan (prepped→in_surgery)
 * 'pre' listesindeki tüm maddeler işaretlenmiş olmalı.
 */
export function allChecklistItemsDone(items: unknown): boolean {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      (item as ChecklistItem).done === true,
  );
}

export function checklistItemSummary(items: unknown): { total: number; done: number } {
  if (!Array.isArray(items)) return { total: 0, done: 0 };
  return {
    total: items.length,
    done: items.filter((i) => typeof i === 'object' && i !== null && (i as ChecklistItem).done === true)
      .length,
  };
}
