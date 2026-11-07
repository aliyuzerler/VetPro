/**
 * Kasa, tahsilat, cari hesap ve giderler — alan mantığı (Faz 09, saf fonksiyonlar).
 *
 * Kabul kriterlerinin çekirdeği burada test edilir:
 * - Bakiye: ücret kalanı = total − dağıtılmış tahsilat; sahip bakiyesi =
 *   açık ücretler − tahsilatlar + iadeler (kuruş kaymasız 2 ondalık).
 * - Dağıtım: toplam tahsilatı veya ücret kalanını aşan dağıtım reddedilir;
 *   otomatik FIFO dağıtımı en eski açık ücretten başlar.
 * - İade edilebilir tutar = tahsilat − toplam iade; negatif olamaz.
 * - Kasa kapanışı: expected = açılış + giriş − çıkış; fark = sayım − expected;
 *   fark ≠ 0 ise açıklama zorunlu.
 * - Idempotency: aynı anahtar REPLAY, farklı anahtar CONFLICT (karar tablosu).
 * - Para: Decimal hassasiyeti string temsiliyle korunur (number'a çevrilmez).
 */

export const FINANCE_ERROR_CODES = {
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  CHARGE_NOT_FOUND: 'CHARGE_NOT_FOUND',
  CHARGE_VOID: 'CHARGE_VOID',
  CHARGE_OWNER_MISMATCH: 'CHARGE_OWNER_MISMATCH',
  ALLOCATION_EXCEEDS_CHARGE: 'ALLOCATION_EXCEEDS_CHARGE',
  ALLOCATION_EXCEEDS_PAYMENT: 'ALLOCATION_EXCEEDS_PAYMENT',
  ALLOCATION_DUPLICATE: 'ALLOCATION_DUPLICATE',
  IDEMPOTENCY_KEY_CONFLICT: 'IDEMPOTENCY_KEY_CONFLICT',
  REFUND_EXCEEDS_PAYMENT: 'REFUND_EXCEEDS_PAYMENT',
  REFUND_REASON_REQUIRED: 'REFUND_REASON_REQUIRED',
  REFUND_NOT_PERMITTED: 'REFUND_NOT_PERMITTED',
  REGISTER_NOT_FOUND: 'REGISTER_NOT_FOUND',
  SESSION_ALREADY_OPEN: 'SESSION_ALREADY_OPEN',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_CLOSED: 'SESSION_CLOSED',
  CASH_DIFFERENCE_NOTE_REQUIRED: 'CASH_DIFFERENCE_NOTE_REQUIRED',
  EXPENSE_INVALID: 'EXPENSE_INVALID',
  PAYABLE_NOT_FOUND: 'PAYABLE_NOT_FOUND',
  PAYABLE_SETTLED: 'PAYABLE_SETTLED',
  PAYMENT_EXCEEDS_PAYABLE: 'PAYMENT_EXCEEDS_PAYABLE',
} as const;

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'card', 'transfer', 'other'];

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

/** 2 ondalığa kuruş kaymasız yuvarlama. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Decimal(12,2) değerleri string üzerinden kuruş hassasiyetinde toplama. */
export function sumCents(values: Array<string | number>): number {
  let cents = 0;
  for (const value of values) {
    const normalized = typeof value === 'string' ? Number(value) : value;
    cents += Math.round(normalized * 100);
  }
  return cents;
}

/** Kuruş tam sayısını 2 ondalıklı sayıya döndürür. */
export function centsToAmount(cents: number): number {
  return cents / 100;
}

// ── Bakiye hesabı ───────────────────────────────────────────────────────────

/** Bir ücretin kalan bakiyesi: total − dağıtılan (kuruş hassasiyeti). */
export function chargeBalanceCents(totalCents: number, allocatedCents: number): number {
  if (allocatedCents < 0) throw new Error('Dağıtım negatif olamaz');
  if (allocatedCents > totalCents) throw new Error('Dağıtım toplamı ücreti aşamaz');
  return totalCents - allocatedCents;
}

/**
 * Sahip (cari) bakiyesi: açık ücretler (+) − tahsilatlar (−) + iadeler (+).
 * Tahsilatın ücretlere dağılmayan kısmı ileri kredi olduğundan ayrıca
 * düşülmez — zaten tahsilat tarafında tam tutar düşmüştür.
 */
export function ownerBalanceCents(params: {
  chargeTotalCents: number;
  paymentTotalCents: number;
  refundTotalCents: number;
}): number {
  return params.chargeTotalCents - params.paymentTotalCents + params.refundTotalCents;
}

// ── Dağıtım planı ───────────────────────────────────────────────────────────

export interface OpenChargeInput {
  id: string;
  /** Decimal string → kuruş */
  totalCents: number;
  allocatedCents: number;
  createdAt: Date;
}

export interface AllocationPlan {
  chargeId: string;
  amountCents: number;
}

export interface AutoAllocateResult {
  plan: AllocationPlan[];
  /** Dağıtılamayan kalan (ileri kredi olarak sahibin carisinde kalır) */
  unallocatedCents: number;
}

/**
 * Otomatik FIFO dağıtım — en eski açık ücretten başlayarak tutarı dağıtır.
 * Kısmi ödeme: tutar tüm ücretleri kapatmıyorsa kalan açık ücretler
 * bakiyesinde kalır ve unallocated 0 olur (tutar tükenir).
 */
export function autoAllocateFifo(
  amountCents: number,
  openCharges: OpenChargeInput[],
): AutoAllocateResult {
  const ordered = [...openCharges].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const plan: AllocationPlan[] = [];
  let remaining = amountCents;
  for (const charge of ordered) {
    if (remaining <= 0) break;
    const balance = chargeBalanceCents(charge.totalCents, charge.allocatedCents);
    if (balance <= 0) continue;
    const applied = Math.min(balance, remaining);
    plan.push({ chargeId: charge.id, amountCents: applied });
    remaining -= applied;
  }
  return { plan, unallocatedCents: remaining };
}

/**
 * Elle dağıtım doğrulaması: her ücret en fazla bir kez, dağıtım ücret
 * kalanını ve tahsilat tutarını aşamaz. Dönen plan kuruş hassasiyetlidir.
 */
export function validateExplicitAllocations(
  amountCents: number,
  requested: Array<{ chargeId: string; amountCents: number }>,
  openCharges: OpenChargeInput[],
): AutoAllocateResult {
  const byId = new Map(openCharges.map((charge) => [charge.id, charge]));
  const plan: AllocationPlan[] = [];
  let total = 0;
  const seen = new Set<string>();
  for (const item of requested) {
    if (item.amountCents <= 0) throw new Error('Dağıtım tutarı pozitif olmalı');
    if (seen.has(item.chargeId)) throw new Error('Aynı ücrete ikinci dağıtım yazılamaz');
    seen.add(item.chargeId);
    const charge = byId.get(item.chargeId);
    if (!charge) throw new Error('Ücret bulunamadı veya açık değil');
    const balance = chargeBalanceCents(charge.totalCents, charge.allocatedCents);
    if (item.amountCents > balance) throw new Error('Dağıtım ücret bakiyesini aşıyor');
    plan.push({ chargeId: item.chargeId, amountCents: item.amountCents });
    total += item.amountCents;
  }
  if (total > amountCents) throw new Error('Dağıtım toplamı tahsilatı aşıyor');
  return { plan, unallocatedCents: amountCents - total };
}

/** Ücret durumu dağıtımdan sonra: paid | partial (void ayrı ele alınır). */
export function chargeStatusAfterAllocation(
  totalCents: number,
  allocatedCents: number,
): 'paid' | 'partial' {
  return chargeBalanceCents(totalCents, allocatedCents) === 0 ? 'paid' : 'partial';
}

// ── İade ────────────────────────────────────────────────────────────────────

/** İade edilebilir kalan: tahsilat − toplam iade (kuruş). */
export function refundableCents(paymentAmountCents: number, refundedCents: number): number {
  if (refundedCents < 0) throw new Error('İade toplamı negatif olamaz');
  return Math.max(0, paymentAmountCents - refundedCents);
}

export function validateRefund(
  paymentAmountCents: number,
  refundedCents: number,
  refundAmountCents: number,
  reason: string,
): void {
  if (!reason.trim()) {
    throw new Error(FINANCE_ERROR_CODES.REFUND_REASON_REQUIRED);
  }
  if (refundAmountCents <= 0) throw new Error('İade tutarı pozitif olmalı');
  if (refundAmountCents > refundableCents(paymentAmountCents, refundedCents)) {
    throw new Error(FINANCE_ERROR_CODES.REFUND_EXCEEDS_PAYMENT);
  }
}

// ── Kasa oturumu ────────────────────────────────────────────────────────────

export const CASH_MOVEMENT_SOURCES = [
  'payment',
  'refund',
  'expense',
  'manual_in',
  'manual_out',
] as const;
export type CashMovementSource = (typeof CASH_MOVEMENT_SOURCES)[number];

export interface SessionExpectedInput {
  openingFloatCents: number;
  inCents: number;
  outCents: number;
}

/** Beklenen kasa tutarı: açılış + giriş − çıkış. */
export function expectedCashCents(params: SessionExpectedInput): number {
  if (params.openingFloatCents < 0) throw new Error('Açılış bakiyesi negatif olamaz');
  return params.openingFloatCents + params.inCents - params.outCents;
}

export interface SessionCloseInput {
  openingFloatCents: number;
  inCents: number;
  outCents: number;
  countedCents: number;
  differenceNote: string;
}

export interface SessionCloseResult {
  expectedCents: number;
  countedCents: number;
  differenceCents: number;
  differenceNote: string;
}

/**
 * Kasa kapanışı: fark hesaplanır; fark ≠ 0 ise açıklama zorunludur
 * (kabul kriteri). Fark = 0 iken açıklama boş bırakılabilir.
 */
export function closeSession(params: SessionCloseInput): SessionCloseResult {
  const expectedCents = expectedCashCents({
    openingFloatCents: params.openingFloatCents,
    inCents: params.inCents,
    outCents: params.outCents,
  });
  const differenceCents = params.countedCents - expectedCents;
  const note = params.differenceNote.trim();
  if (differenceCents !== 0 && !note) {
    throw new Error(FINANCE_ERROR_CODES.CASH_DIFFERENCE_NOTE_REQUIRED);
  }
  return {
    expectedCents,
    countedCents: params.countedCents,
    differenceCents,
    differenceNote: note,
  };
}

// ── Idempotency ─────────────────────────────────────────────────────────────

export type ReplayDecision<T> =
  | { decision: 'proceed' }
  | { decision: 'replay'; result: T };

/**
 * Idempotency kararı — mobil retry için: aynı anahtarla ikinci istek aynı
 * sonucu REPLAY olarak döner; farklı anahtarlı kayıt CONFLICT sayılır.
 */
export function decidePaymentReplay<T>(
  existing: { idempotencyKey: string | null; id: string } | null,
  requestKey: string | undefined,
  replayResult: (payment: { idempotencyKey: string | null; id: string }) => T,
): ReplayDecision<T> {
  if (!existing) return { decision: 'proceed' };
  if (requestKey !== undefined && existing.idempotencyKey === requestKey) {
    return { decision: 'replay', result: replayResult(existing) };
  }
  return { decision: 'proceed' };
}

// ── Cari ekstre ─────────────────────────────────────────────────────────────

export type StatementEntryKind = 'charge' | 'payment' | 'refund';

export interface StatementEntryInput {
  id: string;
  kind: StatementEntryKind;
  /** Decimal string değer */
  amount: string;
  occurredAt: Date;
  description: string;
}

export interface StatementRow {
  id: string;
  kind: StatementEntryKind;
  /** + ücret/borç, − tahsilat, + iade */
  direction: '+' | '-';
  amount: string;
  runningBalance: string;
  occurredAt: string;
  description: string;
}

/**
 * Cari ekstre satırları — charge(+), payment(−), refund(+) ve koşan bakiye.
 * Kabul kriteri: ekstre üç kayıt tipinin ilişkisini görünür kılar.
 */
export function buildStatement(
  entries: StatementEntryInput[],
  openingBalanceCents = 0,
): { rows: StatementRow[]; closingBalance: string } {
  const ordered = [...entries].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id),
  );
  let running = openingBalanceCents;
  const rows: StatementRow[] = ordered.map((entry) => {
    const cents = Math.round(Number(entry.amount) * 100);
    if (entry.kind === 'payment') running -= cents;
    else running += cents; // charge ve refund borcu artırır
    return {
      id: entry.id,
      kind: entry.kind,
      direction: entry.kind === 'payment' ? '-' : '+',
      amount: entry.amount,
      runningBalance: (running / 100).toFixed(2),
      occurredAt: entry.occurredAt.toISOString(),
      description: entry.description,
    };
  });
  return { rows, closingBalance: (running / 100).toFixed(2) };
}

// ── Tedarikçi borcu ─────────────────────────────────────────────────────────

/** Borç kapatma sonrası durum: paid ≥ amount → settled, değilse open. */
export function payableStatusAfterPayment(
  amountCents: number,
  paidCents: number,
): 'open' | 'settled' {
  return paidCents >= amountCents ? 'settled' : 'open';
}

/** Tedarikçi ödemesi doğrulaması: tutar kalanı aşamaz, kayıt açık olmalı. */
export function validatePayablePayment(
  status: string,
  amountCents: number,
  paidCents: number,
  paymentCents: number,
): void {
  if (status === 'void') throw new Error(FINANCE_ERROR_CODES.PAYABLE_NOT_FOUND);
  if (status === 'settled' && paidCents >= amountCents) {
    throw new Error(FINANCE_ERROR_CODES.PAYABLE_SETTLED);
  }
  if (paymentCents <= 0) throw new Error('Ödeme tutarı pozitif olmalı');
  if (paymentCents > amountCents - paidCents) {
    throw new Error(FINANCE_ERROR_CODES.PAYMENT_EXCEEDS_PAYABLE);
  }
}
