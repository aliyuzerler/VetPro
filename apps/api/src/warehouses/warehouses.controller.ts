import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from '../master/master.dto';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';

@ApiTags('warehouses')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('warehouses')
export class WarehousesController {
  constructor(@Inject(WarehousesService) private readonly warehousesService: WarehousesService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.warehousesService.list(auth.clinicId, request.branchId);
  }

  @Post()
  @RequirePermissions('warehouse.manage')
  create(@Body() dto: CreateWarehouseDto, @CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.warehousesService.create(auth, dto, request.branchId!);
  }

  @Patch(':id')
  @RequirePermissions('warehouse.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.warehousesService.update(auth, id, dto);
  }
}
