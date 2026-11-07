/**
 * Faz 04 — arama ve saklama normalizasyonu.
 * Sahip telefonu/e-postası ve hasta mikroçipi farklı biçimlerde girilebilir;
 * arama tutarlı olsun diye normalize edilmiş değer saklanır ve sorgulanır.
 */

/** Türk mobil/şehir formatlarını 90'lı ülke kodlu saf rakamlara indirger.
 *  - '+90 532 111 22 33' → '905321112233'
 *  - '0532 111 22 33'    → '905321112233'
 *  - '5321112233'        → '905321112233'
 *  - Yabancı numaralar rakam olarak korunur ('4915...' → aynen).
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('5')) return `90${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `90${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('90')) return digits;
  return digits;
}

/** E-posta normalizasyonu: küçük harf + kenar boşlukları kırpılır. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Mikroçip normalizasyonu: boşluk/tire noktalama silinir, büyük harf. */
export function normalizeMicrochip(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

/** İletişim türüne göre normalize değeri üretir ('phone' | 'email'). */
export function normalizeContact(kind: string, value: string): string {
  if (kind === 'email') return normalizeEmail(value);
  return normalizePhone(value);
}

/** Ad/soyad karşılaştırma anahtarı: küçük harf + çoklu boşluk tek boşluğa iner.
 * Türkçe karakterler korunur (locale-duyarlı karşılaştırma servis katmanında). */
export function nameKey(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}
