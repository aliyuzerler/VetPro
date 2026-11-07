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
import { ExpensesService } from './expenses.service';
import {
  CreateExpenseDto,
  CreatePayableDto,
  ListExpensesQueryDto,
  ListPayablesQueryDto,
  PayPayableDto,
} from './finance.dto';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';

/**
 * Gider ve tedarikçi borcu uçları (Faz 09). Yazma uçları finance.expense /
 * finance.payable izni ister; okuma uçları kimlik + şube kapsamıdır.
 */
@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('finance')
export class ExpensesController {
  constructor(@Inject(ExpensesService) private readonly expenses: ExpensesService) {}

  @Post('expenses')
  @RequirePermissions('finance.expense')
  createExpense(
    @Body() dto: CreateExpenseDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.expenses.createExpense(auth, dto, request);
  }

  @Get('expenses')
  listExpenses(@Query() query: ListExpensesQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.expenses.listExpenses(auth, query);
  }

  @Post('payables')
  @RequirePermissions('finance.payable')
  createPayable(
    @Body() dto: CreatePayableDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.expenses.createPayable(auth, dto, request);
  }

  @Get('payables')
  listPayables(@Query() query: ListPayablesQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.expenses.listPayables(auth, query);
  }

  @Post('payables/:id/pay')
  @RequirePermissions('finance.payable')
  payPayable(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayPayableDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.expenses.payPayable(auth, id, dto, request);
  }
}
