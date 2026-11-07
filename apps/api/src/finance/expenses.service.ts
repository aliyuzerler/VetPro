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
  payableStatusAfterPayment,
  sumCents,
  validatePayablePayment,
} from './finance.domain';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import type {
  CreateExpenseDto,
  CreatePayableDto,
  ListExpensesQueryDto,
  ListPayablesQueryDto,
  PayPayableDto,
} from './finance.dto';

/** Decimal string girdi → kuruş. */
function toCents(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new BadRequestException({ code: 'VALIDATION', message: `Geçersiz tutar: ${value}` });
  }
  return Math.round(parsed * 100);
}

function centsToDecimal(cents: number): Prisma.Decimal {
  return new Prisma.Decimal((cents / 100).toFixed(2));
}

/**
 * Gider ve tedarikçi borcu — Faz 09. Nakit gider açık kasa oturumuna bağlanır
 * ve kasadan çıkış hareketi üretir. Tedarikçi borcu kısmi ödeme ile izlenir;
 * bakiye kapandığında (paid ≥ amount) kayıt 'settled' olur ve denetim yazılır.
 */
@Injectable()
export class ExpensesService {
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

  // ── Giderler ───────────────────────────────────────────────────────────────

  async createExpense(auth: AuthContext, dto: CreateExpenseDto, request: AuthRequest) {
    const amountCents = toCents(dto.amount);
    if (amountCents <= 0) {
      throw new BadRequestException({ code: 'VALIDATION', message: 'Tutar pozitif olmalı' });
    }
    const branchId = request.branchId ?? auth.activeBranchId;
    if (!branchId) {
      throw new BadRequestException({ code: 'VALIDATION', message: 'Şube seçilmeli' });
    }

    if (dto.vendorId) {
      const vendor = await this.prisma.supplier.findFirst({
        where: { id: dto.vendorId, clinicId: auth.clinicId },
        select: { id: true },
      });
      if (!vendor) {
        throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', message: 'Tedarikçi bulunamadı' });
      }
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
          message: 'Kasa oturumu kapalı — gider hareketi yazılamaz',
        });
      }
      if (session.branchId !== branchId) {
        throw new ForbiddenException({ code: 'BRANCH_SCOPE', message: 'Kasa oturumu başka şubede' });
      }
      cashSessionId = session.id;
    } else if (dto.method === 'cash') {
      throw new BadRequestException({
        code: FINANCE_ERROR_CODES.EXPENSE_INVALID,
        message: 'Nakit gider için açık kasa oturumu gerekli',
      });
    }

    const expenseId = await this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          clinicId: auth.clinicId,
          branchId,
          category: dto.category,
          method: dto.method,
          amount: centsToDecimal(amountCents),
          vendorId: dto.vendorId ?? null,
          description: dto.description.trim(),
          spentAt: new Date(dto.spentAt),
          cashSessionId,
          createdById: auth.staffId,
        },
        select: { id: true },
      });
      if (cashSessionId) {
        await tx.cashMovement.create({
          data: {
            clinicId: auth.clinicId,
            branchId,
            sessionId: cashSessionId,
            direction: 'out',
            amount: centsToDecimal(amountCents),
            sourceType: 'expense',
            sourceId: expense.id,
            reason: `Gider (${dto.category}): ${dto.description.trim()}`,
            createdById: auth.staffId,
          },
        });
      }
      await this.audit.record(
        {
          clinicId: auth.clinicId,
          staffId: auth.staffId,
          branchId,
          action: 'EXPENSE_CREATED',
          entityType: 'Expense',
          entityId: expense.id,
          metadata: {
            category: dto.category,
            method: dto.method,
            amount: (amountCents / 100).toFixed(2),
            vendorId: dto.vendorId ?? null,
          },
        },
        tx,
      );
      return expense.id;
    });
    return { expense: { id: expenseId } };
  }

  async listExpenses(auth: AuthContext, query: ListExpensesQueryDto) {
    const expenses = await this.prisma.expense.findMany({
      where: {
        clinicId: auth.clinicId,
        ...(query.category ? { category: query.category } : {}),
        ...(query.from || query.to
          ? {
              spentAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      include: {
        vendor: { select: { id: true, name: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { spentAt: 'desc' as const },
      take: query.limit ?? 50,
    });
    const totalCents = sumCents(expenses.map((expense) => expense.amount.toString()));
    return {
      items: expenses.map((expense) => ({
        id: expense.id,
        branchId: expense.branchId,
        category: expense.category,
        method: expense.method,
        amount: expense.amount.toFixed(2),
        description: expense.description,
        vendor: expense.vendor,
        createdBy: expense.createdBy,
        spentAt: expense.spentAt.toISOString(),
      })),
      total: (totalCents / 100).toFixed(2),
    };
  }

  // ── Tedarikçi borçları ─────────────────────────────────────────────────────

  async createPayable(auth: AuthContext, dto: CreatePayableDto, request: AuthRequest) {
    const amountCents = toCents(dto.amount);
    if (amountCents <= 0) {
      throw new BadRequestException({ code: 'VALIDATION', message: 'Tutar pozitif olmalı' });
    }
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, clinicId: auth.clinicId },
      select: { id: true, name: true },
    });
    if (!supplier) {
      throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', message: 'Tedarikçi bulunamadı' });
    }
    const branchId = request.branchId ?? auth.activeBranchId;
    if (!branchId) {
      throw new BadRequestException({ code: 'VALIDATION', message: 'Şube seçilmeli' });
    }

    const payable = await this.prisma.supplierPayable.create({
      data: {
        clinicId: auth.clinicId,
        branchId,
        supplierId: dto.supplierId,
        documentNo: dto.documentNo ?? null,
        description: dto.description ?? null,
        amount: centsToDecimal(amountCents),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        createdById: auth.staffId,
      },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId,
      action: 'SUPPLIER_PAYABLE_CREATED',
      entityType: 'SupplierPayable',
      entityId: payable.id,
      metadata: {
        supplierId: dto.supplierId,
        amount: (amountCents / 100).toFixed(2),
        documentNo: dto.documentNo ?? null,
      },
    });
    return {
      payable: {
        id: payable.id,
        status: payable.status,
        amount: payable.amount.toFixed(2),
        paidAmount: payable.paidAmount.toFixed(2),
        supplierId: payable.supplierId,
      },
    };
  }

  /** Borç ödemesi — kısmi ödeme paidAmount'a eklenir; bakiye kapansa 'settled'. */
  async payPayable(auth: AuthContext, payableId: string, dto: PayPayableDto, request: AuthRequest) {
    const payable = await this.prisma.supplierPayable.findFirst({
      where: { id: payableId, clinicId: auth.clinicId },
    });
    if (!payable) {
      throw new NotFoundException({
        code: FINANCE_ERROR_CODES.PAYABLE_NOT_FOUND,
        message: 'Tedarikçi borcu bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, payable.branchId);

    const amountCents = sumCents([payable.amount.toString()]);
    const paidCents = sumCents([payable.paidAmount.toString()]);
    const paymentCents = toCents(dto.amount);
    try {
      validatePayablePayment(payable.status, amountCents, paidCents, paymentCents);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ödeme geçersiz';
      throw new BadRequestException({ code: 'VALIDATION', message });
    }

    const newPaidCents = paidCents + paymentCents;
    const status = payableStatusAfterPayment(amountCents, newPaidCents);
    const updated = await this.prisma.supplierPayable.update({
      where: { id: payable.id },
      data: {
        paidAmount: centsToDecimal(newPaidCents),
        status,
        settledAt: status === 'settled' ? new Date() : null,
      },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: payable.branchId,
      action: 'SUPPLIER_PAYABLE_PAID',
      entityType: 'SupplierPayable',
      entityId: payable.id,
      metadata: {
        payment: (paymentCents / 100).toFixed(2),
        paidTotal: (newPaidCents / 100).toFixed(2),
        status,
        note: dto.note ?? null,
      },
    });
    return {
      payable: {
        id: updated.id,
        status: updated.status,
        amount: updated.amount.toFixed(2),
        paidAmount: updated.paidAmount.toFixed(2),
        settledAt: updated.settledAt?.toISOString() ?? null,
      },
    };
  }

  async listPayables(auth: AuthContext, query: ListPayablesQueryDto) {
    const payables = await this.prisma.supplierPayable.findMany({
      where: {
        clinicId: auth.clinicId,
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' as const },
      take: query.limit ?? 50,
    });
    const openCents = sumCents(
      payables
        .filter((payable) => payable.status === 'open')
        .map((payable) => {
          const amount = sumCents([payable.amount.toString()]);
          const paid = sumCents([payable.paidAmount.toString()]);
          return amount - paid;
        }),
    );
    return {
      items: payables.map((payable) => ({
        id: payable.id,
        supplier: payable.supplier,
        documentNo: payable.documentNo,
        description: payable.description,
        amount: payable.amount.toFixed(2),
        paidAmount: payable.paidAmount.toFixed(2),
        status: payable.status,
        dueDate: payable.dueDate?.toISOString() ?? null,
        settledAt: payable.settledAt?.toISOString() ?? null,
        createdAt: payable.createdAt.toISOString(),
      })),
      openTotal: (openCents / 100).toFixed(2),
    };
  }
}
