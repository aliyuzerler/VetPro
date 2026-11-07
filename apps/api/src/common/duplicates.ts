import { nameKey, normalizePhone } from './normalize';

/**
 * Faz 04 — mükerrer kayıt (olası çift kayıt) eşleştirme kuralları.
 * Otomatik birleştirme YOKTUR: bu fonksiyonlar yalnızca kullanıcıya uyarı
 * gösterecek adayları ve eşleşme nedenlerini üretir (kabul kriteri).
 */

export type DuplicateReason = 'phone' | 'email' | 'name';

export type OwnerCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  /** Normalize edilmiş iletişim değerleri (telefon: 90... rakamlar, e-posta: küçük harf). */
  phoneNumbers: string[];
  emails: string[];
};

export type OwnerDuplicateMatch = OwnerCandidate & { reasons: DuplicateReason[] };

/** Girilen telefon/ad/e-posta'ya göre olası çift sahip kayıtlarını döndürür.
 *  - Telefon eşleşmesi güçlü sinyal: doğrudan aday sayılır.
 *  - Ad + soyad eşleşmesi zayıf sinyal: yine kullanıcıya gösterilir (yazım farkı olabileceği için).
 *  - E-posta eşleşmesi güçlü sinyal. */
export function findOwnerDuplicates(
  input: { firstName?: string; lastName?: string; phone?: string; email?: string },
  existing: OwnerCandidate[],
): OwnerDuplicateMatch[] {
  const phone = input.phone ? normalizePhone(input.phone) : '';
  const email = (input.email ?? '').trim().toLowerCase();
  const first = input.firstName ? nameKey(input.firstName) : '';
  const last = input.lastName ? nameKey(input.lastName) : '';

  const matches: OwnerDuplicateMatch[] = [];
  for (const candidate of existing) {
    const reasons: DuplicateReason[] = [];
    if (phone && phone.length >= 7 && candidate.phoneNumbers.includes(phone)) reasons.push('phone');
    if (email && candidate.emails.includes(email)) reasons.push('email');
    if (
      first &&
      last &&
      nameKey(candidate.firstName) === first &&
      nameKey(candidate.lastName) === last
    ) {
      reasons.push('name');
    }
    if (reasons.length > 0) matches.push({ ...candidate, reasons });
  }
  return matches;
}

export type PatientCandidate = {
  id: string;
  name: string;
  ownerId: string;
  microchip: string | null;
  speciesId: string;
};

export type PatientDuplicateMatch = PatientCandidate & { reasons: ('microchip' | 'owner-name')[] };

/** Girilen mikroçip/sahip+ad bilgisine göre olası çift hasta kayıtlarını döndürür. */
export function findPatientDuplicates(
  input: { ownerId?: string; name?: string; microchip?: string; speciesId?: string },
  existing: PatientCandidate[],
): PatientDuplicateMatch[] {
  const microchip = input.microchip ? input.microchip.replace(/[\s-]/g, '').toUpperCase() : '';
  const name = input.name ? nameKey(input.name) : '';

  const matches: PatientDuplicateMatch[] = [];
  for (const candidate of existing) {
    const reasons: ('microchip' | 'owner-name')[] = [];
    if (microchip && candidate.microchip === microchip) reasons.push('microchip');
    if (
      input.ownerId &&
      name &&
      candidate.ownerId === input.ownerId &&
      nameKey(candidate.name) === name
    ) {
      reasons.push('owner-name');
    }
    if (reasons.length > 0) matches.push({ ...candidate, reasons });
  }
  return matches;
}
