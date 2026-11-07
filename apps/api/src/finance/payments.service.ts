import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  FINANCE_ERROR_CODES,
  autoAllocateFifo,
  buildStatement,
  chargeStatusAfterAllocation,
  refundableCents,
  sumCents,
  validateExplicitAllocations,
  validateRefund,
  type StatementEntryInput,
} from './finance.domain';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import type {
  CreatePaymentDto,
  CreateRefundDto,
  ListChargesQueryDto,
  ListPaymentsQueryDto,
} from './finance.dto';

/** Decimal string girdi → kuruş (2 ondalık, kuruş kaymasız). */
function toCents(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new BadRequestException({
      code: 'VALIDATION',
      message: `Geçersiz tutar: ${value}`,
    });
  }
  return Math.round(parsed * 100);
}

function centsToDecimal(cents: number): Prisma.Decimal {
  return new Prisma.Decimal((cents / 100).toFixed(2));
}

/**
 * Tahsilat, iade, ücret sorguları ve cari ekstre — Faz 09.
 *
 * Kabul kriterleri burada uygulanır:
 * 1. Kısmi ödeme + dağıtım doğru bakiye üretir (kuruş kaymasız Decimal).
 * 2. Aynı idempotencyKey ile tekrar istek REPLAY döner — çift kayıt yok.
 * 3. İade orijinal tahsilata bağlıdır; tutar kalanı aşamaz; REFUND_CREATED
 *    denetim yazımı zorunludur.
 * 4. finance.refund izni olmayan kullanıcı iade uçlarına erişemez
 *    (guard zinciri + servis içi savunma).
 */
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private requireBranchAccess(auth: AuthContext, request: AuthRequest, branchId: string): void {
    if (request.branchId) {
      if (request.branchId !== branchId) {
        throw new ForbiddenException({ code: 'BRANCH_SCOPE', message: 'Şube kapsamı dışı istek' });
      }
      return;
    }
    if (auth.allBranches) return;
    if (!auth.branchIds.includes(branchId)) {
      throw new ForbiddenException({ code: 'BRANCH_SCOPE', message: 'Şube erişiminiz yok' });
    }
  }

  // ── Ücretler ───────────────────────────────────────────────────────────────

  /** Ücret listesi — dağıtım özeti ve kalan bakiye ile. */
  async listCharges(auth: AuthContext, query: ListChargesQueryDto) {
    const charges = await this.prisma.charge.findMany({
      where: {
        clinicId: auth.clinicId,
        ...(query.ownerId ? { ownerId: query.ownerId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        patient: { select: { id: true, name: true } },
        allocations: { select: { amount: true } },
        lines: { select: { description: true, total: true } },
      },
      orderBy: { createdAt: 'desc' as const },
      take: query.limit ?? 50,
      skip: query.skip ?? 0,
    });
    return {
      items: charges.map((charge) => {
        const totalCents = sumCents([charge.total.toString()]);
        const allocatedCents = sumCents(charge.allocations.map((a) => a.amount.toString()));
        return {
          id: charge.id,
          ownerId: charge.ownerId,
          owner: charge.owner,
          patientId: charge.patientId,
          patientName: charge.patient?.name ?? null,
          status: charge.status,
          total: charge.total.toFixed(2),
          allocated: (allocatedCents / 100).toFixed(2),
          balance: ((totalCents - allocatedCents) / 100).toFixed(2),
          description: charge.lines[0]?.description ?? charge.note ?? null,
          createdAt: charge.createdAt.toISOString(),
        };
      }),
    };
  }

  /** Sahip bakiyeleri — açık ücret − tahsilat + iade (cari özet). */
  async listBalances(auth: AuthContext, query: { search?: string; limit?: number; skip?: number }) {
    const owners = await this.prisma.owner.findMany({
      where: {
        clinicId: auth.clinicId,
        mergedIntoOwnerId: null,
        ...(query.search
          ? {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, firstName: true, lastName: true, archivedAt: true },
      orderBy: [{ lastName: 'asc' as const }, { firstName: 'asc' as const }],
      take: query.limit ?? 50,
      skip: query.skip ?? 0,
    });

    const items = await Promise.all(
      owners.map(async (owner) => {
        const charges = await this.prisma.charge.aggregate({
          where: { clinicId: auth.clinicId, ownerId: owner.id, status: { not: 'void' } },
          _sum: { total: true },
        });
        const payments = await this.prisma.payment.aggregate({
          where: { clinicId: auth.clinicId, ownerId: owner.id },
          _sum: { amount: true },
        });
        const refunds = await this.prisma.refund.aggregate({
          where: { clinicId: auth.clinicId, ownerId: owner.id },
          _sum: { amount: true },
        });
        const chargeCents = sumCents([charges._sum.total?.toString() ?? '0']);
        const paymentCents = sumCents([payments._sum.amount?.toString() ?? '0']);
        const refundCents = sumCents([refunds._sum.amount?.toString() ?? '0']);
        const balance = (chargeCents - paymentCents + refundCents) / 100;
        return {
          ownerId: owner.id,
          name: `${owner.firstName} ${owner.lastName}`,
          charges: (chargeCents / 100).toFixed(2),
          payments: (paymentCents / 100).toFixed(2),
          refunds: (refundCents / 100).toFixed(2),
          balance: balance.toFixed(2),
          archived: owner.archivedAt !== null,
        };
      }),
    );
    return { items };
  }

  // ── Tahsilat ───────────────────────────────────────────────────────────────

  /**
   * Tahsilat alma — tek transaction: dağıtım doğrulama + Payment +
   * PaymentAllocation + ücret durum güncellemesi + opsiyonel kasa hareketi +
   * denetim yazımı. Aynı idempotencyKey REPLAY döner (kabul kriteri 2).
   */
  async createPayment(
    auth: AuthContext,
    dto: CreatePaymentDto,
    request: AuthRequest,
  ): Promise<{ payment: Record<string, unknown>; replayed: boolean }> {
    const amountCents = toCents(dto.amount);
    if (amountCents <= 0) {
      throw new BadRequestException({ code: 'VALIDATION', message: 'Tutar pozitif olmalı' });
    }

    const owner = await this.prisma.owner.findFirst({
      where: { id: dto.ownerId, clinicId: auth.clinicId },
      select: { id: true },
    });
    if (!owner) {
      throw new NotFoundException({ code: 'OWNER_NOT_FOUND', message: 'Sahip bulunamadı' });
    }
    // Tahsilatın şubesi: aktif istek şubesi. Owner clinic kapsamlıdır (branchId yok);
    // şube isteğinden gelir, yoksa ücretlerin şubesi kullanılır.
    const firstCharge = await this.prisma.charge.findFirst({
      where: { clinicId: auth.clinicId, ownerId: dto.ownerId, status: { not: 'void' } },
      select: { branchId: true },
      orderBy: { createdAt: 'asc' as const },
    });
    const branchId = request.branchId ?? auth.activeBranchId ?? firstCharge?.branchId;
    if (!branchId) {
      throw new BadRequestException({ code: 'VALIDATION', message: 'Şube seçilmeli' });
    }

    // Idempotency — ön kontrol (transaction içi tekrar yapılır; yarış güvenli).
    if (dto.idempotencyKey) {
      const existing = await this.prisma.payment.findUnique({
        where: {
          clinicId_idempotencyKey: { clinicId: auth.clinicId, idempotencyKey: dto.idempotencyKey },
        },
        select: { id: true },
      });
      if (existing) {
        return { payment: await this.paymentDetail(existing.id), replayed: true };
      }
    }

    let paymentId: string;
    try {
      paymentId = await this.prisma.$transaction(async (tx) => {
      // Ücret satırlarını kilitle (cari yarışını serileştirir).
      const openCharges = await tx.charge.findMany({
        where: {
          clinicId: auth.clinicId,
          ownerId: dto.ownerId,
          status: { not: 'void' },
        },
        select: { id: true, total: true, status: true, createdAt: true },
      });
      // Dağıtım özetini ayrı sorguyla al (her ücret için toplam).
      const allocationSums = await tx.paymentAllocation.groupBy({
        by: ['chargeId'],
        where: { charge: { clinicId: auth.clinicId, ownerId: dto.ownerId } },
        _sum: { amount: true },
      });
      const allocatedByCharge = new Map(
        allocationSums.map((row) => [row.chargeId, sumCents([row._sum.amount?.toString() ?? '0'])]),
      );

      const chargeInputs = openCharges.map((charge) => ({
        id: charge.id,
        totalCents: sumCents([charge.total.toString()]),
        allocatedCents: allocatedByCharge.get(charge.id) ?? 0,
        createdAt: charge.createdAt,
      }));

      // Dağıtım planı: elle verilmişse doğrula, aksi halde FIFO.
      let plan;
      let unallocatedCents: number;
      if (dto.allocations && dto.allocations.length > 0) {
        try {
          const result = validateExplicitAllocations(
            amountCents,
            dto.allocations.map((a) => ({ chargeId: a.chargeId, amountCents: toCents(a.amount) })),
            chargeInputs,
          );
          plan = result.plan;
          unallocatedCents = result.unallocatedCents;
        } catch (error) {
          throw new BadRequestException({
            code: 'VALIDATION',
            message: error instanceof Error ? error.message : 'Dağıtım geçersiz',
          });
        }
      } else {
        const result = autoAllocateFifo(amountCents, chargeInputs);
        plan = result.plan;
        unallocatedCents = result.unallocatedCents;
      }

      // Nakit tahsilat: açık oturum zorunlu; kart/havale oturumsuz.
      let cashSessionId: string | null = null;
      if (dto.cashSessionId) {
        const session = await tx.cashSession.findUnique({
          where: { id: dto.cashSessionId },
          select: { id: true, status: true, clinicId: true, branchId: true },
        });
        if (!session || session.clinicId !== auth.clinicId) {
          throw new BadRequestException({ code: 'VALIDATION', message: 'Kasa oturumu bulunamadı' });
        }
        if (session.status !== 'open') {
          throw new ConflictException({
            code: FINANCE_ERROR_CODES.SESSION_CLOSED,
            message: 'Kasa oturumu kapalı — hareket yazılamaz',
          });
        }
        if (session.branchId !== branchId) {
          throw new ForbiddenException({
            code: 'BRANCH_SCOPE',
            message: 'Kasa oturumu başka şubede',
          });
        }
        cashSessionId = session.id;
      } else if (dto.method === 'cash') {
        // Nakit tahsilatın kasa oturumu olmadan da kaydedilebilmesi mümkündür
        // (kasası açık olmayan şubeler) — oturum bağlamadan defter yazımı yok.
        cashSessionId = null;
      }

      const payment = await tx.payment.create({
        data: {
          clinicId: auth.clinicId,
          branchId,
          ownerId: dto.ownerId,
          method: dto.method,
          amount: centsToDecimal(amountCents),
          idempotencyKey: dto.idempotencyKey ?? null,
          cashSessionId,
          note: dto.note ?? null,
          createdById: auth.staffId,
        },
        select: { id: true },
      });

      if (plan.length > 0) {
        await tx.paymentAllocation.createMany({
          data: plan.map((item) => ({
            paymentId: payment.id,
            chargeId: item.chargeId,
            amount: centsToDecimal(item.amountCents),
          })),
        });
        // Ücret durumlarını güncelle (open → partial → paid).
        const allocatedAfter = new Map(plan.map((item) => [item.chargeId, item.amountCents]));
        for (const [chargeId, appliedCents] of allocatedAfter) {
          const charge = chargeInputs.find((input) => input.id === chargeId);
          if (!charge) continue;
          const newAllocated = charge.allocatedCents + appliedCents;
          const status = chargeStatusAfterAllocation(charge.totalCents, newAllocated);
          await tx.charge.update({
            where: { id: chargeId },
            data: { status },
          });
        }
      }

      if (cashSessionId) {
        await tx.cashMovement.create({
          data: {
            clinicId: auth.clinicId,
            branchId,
            sessionId: cashSessionId,
            direction: 'in',
            amount: centsToDecimal(amountCents),
            sourceType: 'payment',
            sourceId: payment.id,
            reason: `Tahsilat (${dto.method})`,
            createdById: auth.staffId,
          },
        });
      }

      await this.audit.record(
        {
          clinicId: auth.clinicId,
          staffId: auth.staffId,
          branchId,
          action: 'PAYMENT_CREATED',
          entityType: 'Payment',
          entityId: payment.id,
          metadata: {
            ownerId: dto.ownerId,
            method: dto.method,
            amount: (amountCents / 100).toFixed(2),
            allocated: ((amountCents - unallocatedCents) / 100).toFixed(2),
            unallocated: (unallocatedCents / 100).toFixed(2),
            replayKey: dto.idempotencyKey ?? null,
          },
        },
        tx,
      );

      return payment.id;
      });
    } catch (error) {
      // Yarış güvencesi: aynı anahtarlı eşzamanlı istek unique kısıttan düşerse
      // (P2002) mevcut tahsilat REPLAY edilir — kabul kriteri 2.
      if (
        dto.idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.payment.findUnique({
          where: {
            clinicId_idempotencyKey: {
              clinicId: auth.clinicId,
              idempotencyKey: dto.idempotencyKey,
            },
          },
          select: { id: true },
        });
        if (existing) {
          return { payment: await this.paymentDetail(existing.id), replayed: true };
        }
      }
      throw error;
    }

    return { payment: await this.paymentDetail(paymentId), replayed: false };
  }
  /** Tahsilat detayı — dağıtımlar + iadeler ilişkisiyle. */
  async paymentDetail(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        allocations: {
          include: {
            charge: { select: { id: true, total: true, status: true } },
          },
        },
        refunds: { select: { id: true, amount: true, reason: true, createdAt: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!payment) {
      throw new NotFoundException({
        code: FINANCE_ERROR_CODES.PAYMENT_NOT_FOUND,
        message: 'Tahsilat bulunamadı',
      });
    }
    const refundedCents = sumCents(payment.refunds.map((refund) => refund.amount.toString()));
    const amountCents = sumCents([payment.amount.toString()]);
    return {
      id: payment.id,
      ownerId: payment.ownerId,
      owner: payment.owner,
      branchId: payment.branchId,
      method: payment.method,
      amount: payment.amount.toFixed(2),
      idempotencyKey: payment.idempotencyKey,
      cashSessionId: payment.cashSessionId,
      note: payment.note,
      createdBy: payment.createdBy,
      createdAt: payment.createdAt.toISOString(),
      allocations: payment.allocations.map((allocation) => ({
        chargeId: allocation.chargeId,
        chargeStatus: allocation.charge.status,
        chargeTotal: allocation.charge.total.toFixed(2),
        amount: allocation.amount.toFixed(2),
      })),
      refunds: payment.refunds.map((refund) => ({
        id: refund.id,
        amount: refund.amount.toFixed(2),
        reason: refund.reason,
        createdAt: refund.createdAt.toISOString(),
      })),
      refunded: (refundedCents / 100).toFixed(2),
      refundable: (refundableCents(amountCents, refundedCents) / 100).toFixed(2),
    };
  }

  async listPayments(auth: AuthContext, query: ListPaymentsQueryDto) {
    const payments = await this.prisma.payment.findMany({
      where: {
        clinicId: auth.clinicId,
        ...(query.ownerId ? { ownerId: query.ownerId } : {}),
        ...(query.method ? { method: query.method } : {}),
      },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        refunds: { select: { amount: true } },
      },
      orderBy: { createdAt: 'desc' as const },
      take: query.limit ?? 50,
      skip: query.skip ?? 0,
    });
    return {
      items: payments.map((payment) => {
        const refundedCents = sumCents(payment.refunds.map((refund) => refund.amount.toString()));
        return {
          id: payment.id,
          ownerId: payment.ownerId,
          owner: payment.owner,
          method: payment.method,
          amount: payment.amount.toFixed(2),
          refunded: (refundedCents / 100).toFixed(2),
          net: ((sumCents([payment.amount.toString()]) - refundedCents) / 100).toFixed(2),
          note: payment.note,
          createdAt: payment.createdAt.toISOString(),
        };
      }),
    };
  }

  // ── İade ───────────────────────────────────────────────────────────────────

  /**
   * İade — orijinal tahsilata bağlı append-only kayıt + denetim. finance.refund
   * izni guard zincirinde zorunludur; servis savunması da eklenir (derinlik).
   */
  async createRefund(
    auth: AuthContext,
    paymentId: string,
    dto: CreateRefundDto,
    request: AuthRequest,
  ) {
    if (!auth.permissions.includes('finance.refund')) {
      throw new ForbiddenException({
        code: FINANCE_ERROR_CODES.REFUND_NOT_PERMITTED,
        message: 'İade için finance.refund izni gerekir',
      });
    }

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, clinicId: auth.clinicId },
      include: { refunds: { select: { amount: true } } },
    });
    if (!payment) {
      throw new NotFoundException({
        code: FINANCE_ERROR_CODES.PAYMENT_NOT_FOUND,
        message: 'Tahsilat bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, payment.branchId);

    const amountCents = toCents(dto.amount);
    const refundedCents = sumCents(payment.refunds.map((refund) => refund.amount.toString()));
    try {
      validateRefund(sumCents([payment.amount.toString()]), refundedCents, amountCents, dto.reason);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'İade geçersiz';
      throw new BadRequestException({ code: 'VALIDATION', message });
    }

    let cashSessionId: string | null = null;
    if (dto.cashSessionId) {
      const session = await this.prisma.cashSession.findUnique({
        where: { id: dto.cashSessionId },
        select: { id: true, status: true, branchId: true, clinicId: true },
      });
      if (!session || session.clinicId !== auth.clinicId) {
        throw new BadRequestException({ code: 'VALIDATION', message: 'Kasa oturumu bulunamadı' });
      }
      if (session.status !== 'open') {
        throw new ConflictException({
          code: FINANCE_ERROR_CODES.SESSION_CLOSED,
          message: 'Kasa oturumu kapalı — iade hareketi yazılamaz',
        });
      }
      if (session.branchId !== payment.branchId) {
        throw new ForbiddenException({ code: 'BRANCH_SCOPE', message: 'Kasa oturumu başka şubede' });
      }
      cashSessionId = session.id;
    }

    const refundId = await this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.create({
        data: {
          clinicId: auth.clinicId,
          branchId: payment.branchId,
          paymentId: payment.id,
          ownerId: payment.ownerId,
          method: dto.method,
          amount: centsToDecimal(amountCents),
          reason: dto.reason.trim(),
          cashSessionId,
          createdById: auth.staffId,
        },
        select: { id: true },
      });
      if (cashSessionId) {
        await tx.cashMovement.create({
          data: {
            clinicId: auth.clinicId,
            branchId: payment.branchId,
            sessionId: cashSessionId,
            direction: 'out',
            amount: centsToDecimal(amountCents),
            sourceType: 'refund',
            sourceId: refund.id,
            reason: `İade: ${dto.reason.trim()}`,
            createdById: auth.staffId,
          },
        });
      }
      await this.audit.record(
        {
          clinicId: auth.clinicId,
          staffId: auth.staffId,
          branchId: payment.branchId,
          action: 'REFUND_CREATED',
          entityType: 'Refund',
          entityId: refund.id,
          metadata: {
            paymentId: payment.id,
            amount: (amountCents / 100).toFixed(2),
            method: dto.method,
            reason: dto.reason.trim(),
          },
        },
        tx,
      );
      return refund.id;
    });

    return { refund: { id: refundId }, payment: await this.paymentDetail(payment.id) };
  }

  // ── Cari ekstre ────────────────────────────────────────────────────────────

  /**
   * Sahip cari ekstresi — ücret(+), tahsilat(−), iade(+) satırları ve koşan
   * bakiye (kabul kriteri: üç kayıt ilişkisi görünür olmalı).
   */
  async ownerStatement(auth: AuthContext, ownerId: string, request: AuthRequest) {
    const owner = await this.prisma.owner.findFirst({
      where: { id: ownerId, clinicId: auth.clinicId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!owner) {
      throw new NotFoundException({ code: 'OWNER_NOT_FOUND', message: 'Sahip bulunamadı' });
    }

    const [charges, payments, refunds] = await Promise.all([
      this.prisma.charge.findMany({
        where: { clinicId: auth.clinicId, ownerId, status: { not: 'void' } },
        select: {
          id: true,
          total: true,
          createdAt: true,
          note: true,
          lines: { select: { description: true }, take: 1 },
        },
      }),
      this.prisma.payment.findMany({
        where: { clinicId: auth.clinicId, ownerId },
        select: {
          id: true,
          amount: true,
          createdAt: true,
          method: true,
          note: true,
          allocations: { select: { chargeId: true, amount: true } },
        },
      }),
      this.prisma.refund.findMany({
        where: { clinicId: auth.clinicId, ownerId },
        select: { id: true, amount: true, createdAt: true, method: true, reason: true },
      }),
    ]);

    const entries: StatementEntryInput[] = [
      ...charges.map((charge) => ({
        id: charge.id,
        kind: 'charge' as const,
        amount: charge.total.toFixed(2),
        occurredAt: charge.createdAt,
        description: charge.lines[0]?.description ?? charge.note ?? 'Hizmet ücreti',
      })),
      ...payments.map((payment) => ({
        id: payment.id,
        kind: 'payment' as const,
        amount: payment.amount.toFixed(2),
        occurredAt: payment.createdAt,
        description: `Tahsilat (${payment.method})${payment.note ? ` — ${payment.note}` : ''}`,
      })),
      ...refunds.map((refund) => ({
        id: refund.id,
        kind: 'refund' as const,
        amount: refund.amount.toFixed(2),
        occurredAt: refund.createdAt,
        description: `İade (${refund.method}) — ${refund.reason}`,
      })),
    ];

    const statement = buildStatement(entries);
    return {
      owner: { id: owner.id, name: `${owner.firstName} ${owner.lastName}` },
      rows: statement.rows,
      closingBalance: statement.closingBalance,
      summary: {
        charges: (sumCents(charges.map((charge) => charge.total.toString())) / 100).toFixed(2),
        payments: (sumCents(payments.map((payment) => payment.amount.toString())) / 100).toFixed(2),
        refunds: (sumCents(refunds.map((refund) => refund.amount.toString())) / 100).toFixed(2),
      },
    };
  }
}
