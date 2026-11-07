import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import {
  CreatePaymentDto,
  CreateRefundDto,
  ListBalancesQueryDto,
  ListChargesQueryDto,
  ListPaymentsQueryDto,
} from './finance.dto';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';

/**
 * Finans — tahsilat, iade, ücret ve cari uçları (Faz 09). İzin modeli:
 * - tahsilat: finance.pay
 * - iade: finance.refund (kabul kriteri: izinsiz kullanıcı 403 alır)
 * - okuma uçları (ücret, bakiye, ekstre): kimlik + şube kapsamı yeterli
 * Yazımlar append-only: ücret/tahsilat/iade kaydı silinmez, düzeltme ters
 * kayıtla yapılır.
 */
@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('finance')
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  // ── Ücretler ve cari ───────────────────────────────────────────────────────

  @Get('charges')
  listCharges(@Query() query: ListChargesQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.payments.listCharges(auth, query);
  }

  @Get('balances')
  listBalances(@Query() query: ListBalancesQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.payments.listBalances(auth, query);
  }

  @Get('owners/:ownerId/statement')
  ownerStatement(
    @Param('ownerId', ParseUUIDPipe) ownerId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.payments.ownerStatement(auth, ownerId, request);
  }

  // ── Tahsilat ───────────────────────────────────────────────────────────────

  @Post('payments')
  @RequirePermissions('finance.pay')
  createPayment(
    @Body() dto: CreatePaymentDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.payments.createPayment(auth, dto, request);
  }

  @Get('payments')
  listPayments(@Query() query: ListPaymentsQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.payments.listPayments(auth, query);
  }

  @Get('payments/:id')
  paymentDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.paymentDetail(id);
  }

  @Post('payments/:id/refund')
  @RequirePermissions('finance.refund')
  createRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRefundDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.payments.createRefund(auth, id, dto, request);
  }
}
