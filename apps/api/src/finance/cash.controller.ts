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
import { CashService } from './cash.service';
import {
  CloseSessionDto,
  CreateCashMovementDto,
  CreateRegisterDto,
  ListSessionsQueryDto,
  OpenSessionDto,
} from './finance.dto';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';

/**
 * Kasa uçları — açılış/kapanış, fark açıklaması ve nakit hareketleri (Faz 09).
 * Yazma uçları finance.cash izni ister; okuma uçları kimlik + şube kapsamıdır.
 */
@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('cash')
export class CashController {
  constructor(@Inject(CashService) private readonly cash: CashService) {}

  @Get('registers')
  listRegisters(@CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.cash.listRegisters(auth, request.branchId);
  }

  @Post('registers')
  @RequirePermissions('finance.cash')
  createRegister(@Body() dto: CreateRegisterDto, @CurrentAuth() auth: AuthContext) {
    return this.cash.createRegister(auth, dto);
  }

  @Get('sessions')
  listSessions(@Query() query: ListSessionsQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.cash.listSessions(auth, query);
  }

  @Get('sessions/:id')
  sessionDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.cash.sessionDetail(id);
  }

  @Post('sessions/open')
  @RequirePermissions('finance.cash')
  openSession(
    @Body() dto: OpenSessionDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.cash.openSession(auth, dto, request);
  }

  @Post('sessions/:id/close')
  @RequirePermissions('finance.cash')
  closeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseSessionDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.cash.closeSessionFor(auth, id, dto, request);
  }

  @Post('sessions/:id/movements')
  @RequirePermissions('finance.cash')
  createMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCashMovementDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.cash.createMovement(auth, id, dto, request);
  }
}
