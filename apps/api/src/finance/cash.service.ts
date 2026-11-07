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
import { FINANCE_ERROR_CODES, closeSession, expectedCashCents, sumCents } from './finance.domain';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import type {
  CloseSessionDto,
  CreateCashMovementDto,
  CreateRegisterDto,
  ListSessionsQueryDto,
  OpenSessionDto,
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
 * Kasa yönetimi — açılış/kapanış, nakit giriş/çıkış ve oturum defteri.
 *
 * Kabul kriteri: kapanışta fark hesaplanır (sayım − beklenen); fark ≠ 0 ise
 * açıklama zorunludur. Kasa başına tek açık oturum kısmi tekil indeksle
 * garanti edilir; kapalı oturuma hareket yazılamaz.
 */
@Injectable()
export class CashService {
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

  // ── Kasalar ────────────────────────────────────────────────────────────────

  async listRegisters(auth: AuthContext, branchId?: string) {
    const registers = await this.prisma.cashRegister.findMany({
      where: {
        clinicId: auth.clinicId,
        ...(branchId ? { branchId } : {}),
      },
      include: {
        branch: { select: { id: true, name: true } },
        sessions: {
          where: { status: 'open' },
          select: {
            id: true,
            openingFloat: true,
            openedAt: true,
            movements: { select: { direction: true, amount: true } },
          },
        },
      },
      orderBy: [{ branchId: 'asc' as const }, { name: 'asc' as const }],
    });
    return {
      items: registers.map((register) => {
        const openSession = register.sessions[0] ?? null;
        let expected: string | null = null;
        if (openSession) {
          const opening = sumCents([openSession.openingFloat.toString()]);
          const inCents = sumCents(
            openSession.movements
              .filter((movement) => movement.direction === 'in')
              .map((movement) => movement.amount.toString()),
          );
          const outCents = sumCents(
            openSession.movements
              .filter((movement) => movement.direction === 'out')
              .map((movement) => movement.amount.toString()),
          );
          expected = (expectedCashCents({ openingFloatCents: opening, inCents, outCents }) / 100).toFixed(2);
        }
        return {
          id: register.id,
          name: register.name,
          branch: register.branch,
          active: register.active,
          openSession: openSession
            ? {
                id: openSession.id,
                openingFloat: openSession.openingFloat.toFixed(2),
                expected: expected,
                openedAt: openSession.openedAt.toISOString(),
              }
            : null,
        };
      }),
    };
  }

  async createRegister(auth: AuthContext, dto: CreateRegisterDto) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, clinicId: auth.clinicId },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Şube bulunamadı' });
    }
    const register = await this.prisma.cashRegister.create({
      data: {
        clinicId: auth.clinicId,
        branchId: dto.branchId,
        name: dto.name.trim(),
      },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: dto.branchId,
      action: 'CASH_REGISTER_CREATED',
      entityType: 'CashRegister',
      entityId: register.id,
      metadata: { name: dto.name },
    });
    return { register };
  }

  // ── Oturumlar ──────────────────────────────────────────────────────────────

  /** Kasa açılışı — açılış bakiyesi ile; kasa başına tek açık oturum. */
  async openSession(auth: AuthContext, dto: OpenSessionDto, request: AuthRequest) {
    const register = await this.prisma.cashRegister.findFirst({
      where: { id: dto.registerId, clinicId: auth.clinicId },
      select: { id: true, branchId: true, name: true, active: true },
    });
    if (!register) {
      throw new NotFoundException({
        code: FINANCE_ERROR_CODES.REGISTER_NOT_FOUND,
        message: 'Kasa bulunamadı',
      });
    }
    if (!register.active) {
      throw new BadRequestException({ code: 'VALIDATION', message: 'Kasa pasif' });
    }
    this.requireBranchAccess(auth, request, register.branchId);
    const openingFloatCents = toCents(dto.openingFloat);

    const sessionId = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.cashSession.findFirst({
        where: { registerId: register.id, status: 'open' },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException({
          code: FINANCE_ERROR_CODES.SESSION_ALREADY_OPEN,
          message: 'Kasada açık oturum var — önce kapatın',
        });
      }
      const session = await tx.cashSession.create({
        data: {
          clinicId: auth.clinicId,
          branchId: register.branchId,
          registerId: register.id,
          openingFloat: centsToDecimal(openingFloatCents),
          openedById: auth.staffId,
        },
        select: { id: true },
      });
      // Açılış bakiyesi deftere 'manual_in' açılış hareketi olarak yazılmaz:
      // expected = openingFloat + giriş − çıkış formülünde ayrı terimdir.
      await this.audit.record(
        {
          clinicId: auth.clinicId,
          staffId: auth.staffId,
          branchId: register.branchId,
          action: 'CASH_SESSION_OPENED',
          entityType: 'CashSession',
          entityId: session.id,
          metadata: { registerId: register.id, openingFloat: (openingFloatCents / 100).toFixed(2) },
        },
        tx,
      );
      return session.id;
    });
    return this.sessionDetail(sessionId);
  }

  /**
   * Kasa kapanışı — fark hesabı + açıklama zorunluluğu (kabul kriteri).
   * Fark = sayım − (açılış + giriş − çıkış).
   */
  async closeSessionFor(
    auth: AuthContext,
    sessionId: string,
    dto: CloseSessionDto,
    request: AuthRequest,
  ) {
    const session = await this.prisma.cashSession.findFirst({
      where: { id: sessionId, clinicId: auth.clinicId },
      include: { register: { select: { id: true, name: true } } },
    });
    if (!session) {
      throw new NotFoundException({
        code: FINANCE_ERROR_CODES.SESSION_NOT_FOUND,
        message: 'Kasa oturumu bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, session.branchId);
    if (session.status === 'closed') {
      throw new ConflictException({
        code: FINANCE_ERROR_CODES.SESSION_CLOSED,
        message: 'Oturum zaten kapalı',
      });
    }

    const openingFloatCents = sumCents([session.openingFloat.toString()]);
    const movements = await this.prisma.cashMovement.findMany({
      where: { sessionId: session.id },
      select: { direction: true, amount: true },
    });
    const inCents = sumCents(
      movements.filter((m) => m.direction === 'in').map((m) => m.amount.toString()),
    );
    const outCents = sumCents(
      movements.filter((m) => m.direction === 'out').map((m) => m.amount.toString()),
    );
    const countedCents = toCents(dto.countedTotal);

    let closed: ReturnType<typeof closeSession>;
    try {
      closed = closeSession({
        openingFloatCents,
        inCents,
        outCents,
        countedCents,
        differenceNote: dto.differenceNote ?? '',
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === FINANCE_ERROR_CODES.CASH_DIFFERENCE_NOTE_REQUIRED
      ) {
        throw new BadRequestException({
          code: FINANCE_ERROR_CODES.CASH_DIFFERENCE_NOTE_REQUIRED,
          message: 'Fark açıklaması zorunlu — sayım beklenen tutarla uyuşmuyor',
        });
      }
      throw error;
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cashSession.updateMany({
        where: { id: session.id, status: 'open' },
        data: {
          status: 'closed',
          countedTotal: centsToDecimal(closed.countedCents),
          expectedTotal: centsToDecimal(closed.expectedCents),
          difference: centsToDecimal(closed.differenceCents),
          differenceNote: closed.differenceNote || null,
          closedById: auth.staffId,
          closedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new ConflictException({
          code: FINANCE_ERROR_CODES.SESSION_CLOSED,
          message: 'Oturum eşzamanlı istekle kapatıldı',
        });
      }
      await this.audit.record(
        {
          clinicId: auth.clinicId,
          staffId: auth.staffId,
          branchId: session.branchId,
          action: 'CASH_SESSION_CLOSED',
          entityType: 'CashSession',
          entityId: session.id,
          metadata: {
            expected: (closed.expectedCents / 100).toFixed(2),
            counted: (closed.countedCents / 100).toFixed(2),
            difference: (closed.differenceCents / 100).toFixed(2),
            differenceNote: closed.differenceNote || null,
          },
        },
        tx,
      );
    });
    return this.sessionDetail(session.id);
  }

  /** Oturum detayı — hareket defteri ve hesaplanan beklenen tutar ile. */
  async sessionDetail(sessionId: string) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id: sessionId },
      include: {
        register: { select: { id: true, name: true } },
        openedBy: { select: { id: true, firstName: true, lastName: true } },
        closedBy: { select: { id: true, firstName: true, lastName: true } },
        movements: {
          orderBy: { createdAt: 'asc' as const },
          select: {
            id: true,
            direction: true,
            amount: true,
            sourceType: true,
            sourceId: true,
            reason: true,
            createdAt: true,
          },
        },
      },
    });
    if (!session) {
      throw new NotFoundException({
        code: FINANCE_ERROR_CODES.SESSION_NOT_FOUND,
        message: 'Kasa oturumu bulunamadı',
      });
    }
    const openingFloatCents = sumCents([session.openingFloat.toString()]);
    const inCents = sumCents(
      session.movements.filter((m) => m.direction === 'in').map((m) => m.amount.toString()),
    );
    const outCents = sumCents(
      session.movements.filter((m) => m.direction === 'out').map((m) => m.amount.toString()),
    );
    const expectedCents = expectedCashCents({ openingFloatCents, inCents, outCents });
    return {
      id: session.id,
      status: session.status,
      register: session.register,
      branchId: session.branchId,
      openingFloat: session.openingFloat.toFixed(2),
      countedTotal: session.countedTotal?.toFixed(2) ?? null,
      expectedTotal: session.expectedTotal?.toFixed(2) ?? null,
      difference: session.difference?.toFixed(2) ?? null,
      differenceNote: session.differenceNote,
      openedBy: session.openedBy,
      closedBy: session.closedBy,
      openedAt: session.openedAt.toISOString(),
      closedAt: session.closedAt?.toISOString() ?? null,
      live: {
        expected: (expectedCents / 100).toFixed(2),
        cashIn: (inCents / 100).toFixed(2),
        cashOut: (outCents / 100).toFixed(2),
      },
      movements: session.movements.map((movement) => ({
        id: movement.id,
        direction: movement.direction,
        amount: movement.amount.toFixed(2),
        sourceType: movement.sourceType,
        sourceId: movement.sourceId,
        reason: movement.reason,
        createdAt: movement.createdAt.toISOString(),
      })),
    };
  }

  async listSessions(auth: AuthContext, query: ListSessionsQueryDto) {
    const sessions = await this.prisma.cashSession.findMany({
      where: {
        clinicId: auth.clinicId,
        ...(query.registerId ? { registerId: query.registerId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        register: { select: { id: true, name: true } },
        openedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { openedAt: 'desc' as const },
      take: query.limit ?? 20,
    });
    return {
      items: sessions.map((session) => ({
        id: session.id,
        status: session.status,
        register: session.register,
        openingFloat: session.openingFloat.toFixed(2),
        countedTotal: session.countedTotal?.toFixed(2) ?? null,
        expectedTotal: session.expectedTotal?.toFixed(2) ?? null,
        difference: session.difference?.toFixed(2) ?? null,
        differenceNote: session.differenceNote,
        openedBy: session.openedBy,
        openedAt: session.openedAt.toISOString(),
        closedAt: session.closedAt?.toISOString() ?? null,
      })),
    };
  }

  /** Elle nakit giriş/çıkış — açık oturuma yazılır; kapalı oturum reddedilir. */
  async createMovement(auth: AuthContext, sessionId: string, dto: CreateCashMovementDto, request: AuthRequest) {
    const session = await this.prisma.cashSession.findFirst({
      where: { id: sessionId, clinicId: auth.clinicId },
      select: { id: true, status: true, branchId: true },
    });
    if (!session) {
      throw new NotFoundException({
        code: FINANCE_ERROR_CODES.SESSION_NOT_FOUND,
        message: 'Kasa oturumu bulunamadı',
      });
    }
    this.requireBranchAccess(auth, request, session.branchId);
    if (session.status !== 'open') {
      throw new ConflictException({
        code: FINANCE_ERROR_CODES.SESSION_CLOSED,
        message: 'Kasa oturumu kapalı — hareket yazılamaz',
      });
    }
    const amountCents = toCents(dto.amount);
    if (amountCents <= 0) {
      throw new BadRequestException({ code: 'VALIDATION', message: 'Tutar pozitif olmalı' });
    }
    const movement = await this.prisma.cashMovement.create({
      data: {
        clinicId: auth.clinicId,
        branchId: session.branchId,
        sessionId: session.id,
        direction: dto.sourceType === 'manual_in' ? 'in' : 'out',
        amount: centsToDecimal(amountCents),
        sourceType: dto.sourceType,
        reason: dto.reason.trim(),
        createdById: auth.staffId,
      },
    });
    await this.audit.record({
      clinicId: auth.clinicId,
      staffId: auth.staffId,
      branchId: session.branchId,
      action: 'CASH_MOVEMENT_CREATED',
      entityType: 'CashMovement',
      entityId: movement.id,
      metadata: {
        sessionId: session.id,
        sourceType: dto.sourceType,
        amount: (amountCents / 100).toFixed(2),
        reason: dto.reason.trim(),
      },
    });
    return { movement: { id: movement.id }, session: await this.sessionDetail(session.id) };
  }
}
