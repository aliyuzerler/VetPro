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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, ListSuppliersQueryDto, UpdateSupplierDto } from './inventory.dto';
import { CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';

/**
 * Tedarikçi uçları — Faz 07. Yazma uçları supplier.manage izni ister;
 * okuma uçları kimlik doğrulama yeterlidir (mal kabul ekranı için).
 */
@ApiTags('inventory')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(@Inject(SuppliersService) private readonly suppliers: SuppliersService) {}

  @Get()
  list(@Query() query: ListSuppliersQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.suppliers.list(auth, query);
  }

  @Post()
  @RequirePermissions('supplier.manage')
  create(@Body() dto: CreateSupplierDto, @CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.suppliers.create(auth, dto, request);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.suppliers.detail(auth, id);
  }

  @Patch(':id')
  @RequirePermissions('supplier.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.suppliers.update(auth, id, dto, request);
  }
}
