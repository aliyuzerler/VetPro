import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StockService } from './stock.service';
import {
  CompleteCountDto,
  CreateAdjustmentDto,
  CreateConsumptionDto,
  CreateCountDto,
  CreateReceiptDto,
  CreateSupplierReturnDto,
  CreateTemperatureLogDto,
  CreateTransferDto,
  ListBalancesQueryDto,
  ListMovementsQueryDto,
  ListTemperatureQueryDto,
  ListTransfersQueryDto,
  UpdateCountLinesDto,
  UpdateLotStatusDto,
} from './inventory.dto';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';

/**
 * Stok işlem uçları — Faz 07. İzin modeli:
 * - mal kabul + tedarikçi iadesi: inventory.receive
 * - tüketim: inventory.consume
 * - manuel düzeltme + sayım tamamlama: inventory.adjust
 * - transfer kurulum/sevk/teslim: inventory.transfer
 * - sıcaklık kaydı: warehouse.manage
 * Okuma uçları kimlik + şube kapsamı yeterlidir. Defter uçları yalnızca
 * okuma: hareket üzerinde PATCH/DELETE yoktur (append-only).
 */
@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('stock')
export class StockController {
  constructor(@Inject(StockService) private readonly stock: StockService) {}

  // ── Yazma işlemleri ───────────────────────────────────────────────────────

  @Post('receipts')
  @RequirePermissions('inventory.receive')
  createReceipt(
    @Body() dto: CreateReceiptDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.stock.createReceipt(auth, dto, request);
  }

  @Post('consumptions')
  @RequirePermissions('inventory.consume')
  createConsumption(
    @Body() dto: CreateConsumptionDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.stock.createConsumption(auth, dto, request);
  }

  @Post('returns')
  @RequirePermissions('inventory.receive')
  createSupplierReturn(
    @Body() dto: CreateSupplierReturnDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.stock.createSupplierReturn(auth, dto, request);
  }

  @Post('adjustments')
  @RequirePermissions('inventory.adjust')
  createAdjustment(
    @Body() dto: CreateAdjustmentDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.stock.createAdjustment(auth, dto, request);
  }

  // ── Defter (salt okunur) ──────────────────────────────────────────────────

  @Get('movements')
  listMovements(@Query() query: ListMovementsQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.stock.listMovements(auth, query);
  }

  @Get('movements/:id')
  movementDetail(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.stock.movementDetail(auth, id);
  }

  @Get('balances')
  listBalances(@Query() query: ListBalancesQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.stock.listBalances(auth, query);
  }

  @Get('alerts')
  listAlerts(@CurrentAuth() auth: AuthContext) {
    return this.stock.listAlerts(auth);
  }

  // ── Transfer ──────────────────────────────────────────────────────────────

  @Get('transfers')
  listTransfers(@Query() query: ListTransfersQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.stock.listTransfers(auth, query.status);
  }

  @Post('transfers')
  @RequirePermissions('inventory.transfer')
  createTransfer(
    @Body() dto: CreateTransferDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.stock.createTransfer(auth, dto, request);
  }

  @Get('transfers/:id')
  transferDetail(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.stock.transferDetail(auth, id);
  }

  @Patch('transfers/:id/dispatch')
  @RequirePermissions('inventory.transfer')
  dispatchTransfer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.stock.dispatchTransfer(auth, id, request);
  }

  @Patch('transfers/:id/receive')
  @RequirePermissions('inventory.transfer')
  receiveTransfer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.stock.receiveTransfer(auth, id, request);
  }

  @Patch('transfers/:id/cancel')
  @RequirePermissions('inventory.transfer')
  cancelTransfer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.stock.cancelTransfer(auth, id, request);
  }

  // ── Sayım ─────────────────────────────────────────────────────────────────

  @Get('counts')
  listCounts(@Query('status') status: string | undefined, @CurrentAuth() auth: AuthContext) {
    return this.stock.listCounts(auth, status || undefined);
  }

  @Post('counts')
  @RequirePermissions('inventory.adjust')
  createCount(
    @Body() dto: CreateCountDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.stock.createCount(auth, dto, request);
  }

  @Get('counts/:id')
  countDetail(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.stock.countDetail(auth, id);
  }

  @Patch('counts/:id/lines')
  @RequirePermissions('inventory.adjust')
  updateCountLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCountLinesDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.stock.updateCountLines(auth, id, dto, request);
  }

  @Post('counts/:id/complete')
  @RequirePermissions('inventory.adjust')
  completeCount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteCountDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.stock.completeCount(auth, id, dto, request);
  }

  @Patch('lots/:lotId/status')
  @RequirePermissions('inventory.receive')
  updateLotStatus(
    @Param('lotId', ParseUUIDPipe) lotId: string,
    @Body() dto: UpdateLotStatusDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.stock.updateLotStatus(auth, lotId, dto.status, request);
  }

  // ── Sıcaklık kayıtları ────────────────────────────────────────────────────

  @Get('temperature-logs')
  listTemperatureLogs(
    @Query() query: ListTemperatureQueryDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.stock.listTemperatureLogs(auth, query);
  }

  @Post('temperature-logs')
  @RequirePermissions('warehouse.manage')
  createTemperatureLog(
    @Body() dto: CreateTemperatureLogDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.stock.createTemperatureLog(auth, dto, request);
  }
}
