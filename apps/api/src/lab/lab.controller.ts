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
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import { LabService } from './lab.service';
import {
  CancelLabOrderDto,
  CollectSampleDto,
  CreateLabOrderDto,
  CreateLabResultDto,
  CreateLabTestDto,
  ListCriticalResultsQueryDto,
  ListLabOrdersQueryDto,
  RejectSampleDto,
  UpdateLabTestDto,
} from './lab.dto';

/**
 * Lab uçları — Faz 11: katalog, sipariş yaşam döngüsü, numune, sonuç ve
 * kritik sonuç uyarısı. Tüm uçlar lab.manage ister; kritik sonucu onaylama
 * (acknowledge) ek olarak clinical.sign ister (yetkili klinisyen).
 */
@ApiTags('lab')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('lab')
export class LabController {
  constructor(@Inject(LabService) private readonly lab: LabService) {}

  @Get('tests')
  @RequirePermissions('lab.manage')
  listTests(@CurrentAuth() auth: AuthContext, @Query('includeInactive') includeInactive?: string) {
    return this.lab.listTests(auth, includeInactive === 'true');
  }

  @Post('tests')
  @RequirePermissions('lab.manage')
  createTest(
    @Body() dto: CreateLabTestDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.lab.createTest(auth, dto, request);
  }

  @Patch('tests/:id')
  @RequirePermissions('lab.manage')
  updateTest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabTestDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.lab.updateTest(auth, id, dto, request);
  }

  @Get('orders')
  @RequirePermissions('lab.manage')
  listOrders(
    @Query() query: ListLabOrdersQueryDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.lab.listOrders(auth, query, request);
  }

  @Get('orders/:id')
  @RequirePermissions('lab.manage')
  getOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.lab.getOrder(auth, id, request);
  }

  @Post('orders')
  @RequirePermissions('lab.manage')
  createOrder(
    @Body() dto: CreateLabOrderDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.lab.createOrder(auth, dto, request);
  }

  @Post('orders/:id/collect')
  @RequirePermissions('lab.manage')
  collectSample(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CollectSampleDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.lab.collectSample(auth, id, dto, request);
  }

  @Post('orders/:id/reject-sample')
  @RequirePermissions('lab.manage')
  rejectSample(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectSampleDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.lab.rejectSample(auth, id, dto, request);
  }

  @Post('orders/:id/start')
  @RequirePermissions('lab.manage')
  startAnalysis(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.lab.startAnalysis(auth, id, request);
  }

  @Post('orders/:id/results')
  @RequirePermissions('lab.manage')
  addResult(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLabResultDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.lab.addResult(auth, id, dto, request);
  }

  @Post('orders/:id/cancel')
  @RequirePermissions('lab.manage')
  cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelLabOrderDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.lab.cancelOrder(auth, id, dto, request);
  }

  @Get('results/critical')
  @RequirePermissions('lab.manage')
  listCriticalResults(
    @Query() query: ListCriticalResultsQueryDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.lab.listCriticalResults(auth, query, request);
  }

  @Post('results/:id/acknowledge')
  @RequirePermissions('lab.manage', 'clinical.sign')
  acknowledgeResult(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.lab.acknowledgeResult(auth, id, request);
  }
}
