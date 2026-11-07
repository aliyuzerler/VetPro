import {
  Body,
  Controller,
  Delete,
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
import { ServicesService } from './services.service';
import {
  CreateConsumptionRuleDto,
  CreateServiceDto,
  CreateServicePriceDto,
  ListServicesQueryDto,
  UpdateServiceDto,
} from './services.dto';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';

/**
 * Hizmet kataloğu uçları — Faz 06. Yazma uçları service.manage izni ister;
 * okuma uçları kimlik doğrulama + şube kapsamı yeterlidir (muayene ekranının
 * hizmet seçimi ve fiyat çözümleme için).
 */
@ApiTags('services')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('services')
export class ServicesController {
  constructor(@Inject(ServicesService) private readonly service: ServicesService) {}

  @Get()
  list(@Query() query: ListServicesQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.service.list(auth, query);
  }

  @Post()
  @RequirePermissions('service.manage')
  create(@Body() dto: CreateServiceDto, @CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.service.create(auth, dto, request);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.service.detail(auth, id);
  }

  @Patch(':id')
  @RequirePermissions('service.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.update(auth, id, dto, request);
  }

  @Get(':id/prices')
  listPrices(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.service.listPrices(auth, id);
  }

  @Post(':id/prices')
  @RequirePermissions('service.manage')
  createPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateServicePriceDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.createPrice(auth, id, dto, request);
  }

  @Get(':id/consumption-rules')
  listRules(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.service.detail(auth, id).then((s) => ({ items: s.consumptionRules }));
  }

  @Post(':id/consumption-rules')
  @RequirePermissions('service.manage')
  createRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateConsumptionRuleDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.createConsumptionRule(auth, id, dto, request);
  }

  @Delete(':id/consumption-rules/:ruleId')
  @RequirePermissions('service.manage')
  deleteRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.deleteConsumptionRule(auth, id, ruleId, request);
  }
}
