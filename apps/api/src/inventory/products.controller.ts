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
import { ProductsService } from './products.service';
import {
  CreateCategoryDto,
  CreateConversionDto,
  CreateProductDto,
  CreateUnitDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from './inventory.dto';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';

/**
 * Ürün kataloğu uçları — Faz 07. Yazma uçları product.manage izni ister;
 * okuma uçları kimlik doğrulama yeterlidir (muayene/tüketim ekranları için).
 */
@ApiTags('inventory')
@ApiBearerAuth()
@Controller()
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly products: ProductsService) {}

  @Get('products')
  list(@Query() query: ListProductsQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.products.list(auth, query);
  }

  @Post('products')
  @RequirePermissions('product.manage')
  create(@Body() dto: CreateProductDto, @CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.products.create(auth, dto, request);
  }

  @Get('products/:id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.products.detail(auth, id);
  }

  @Patch('products/:id')
  @RequirePermissions('product.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.products.update(auth, id, dto, request);
  }

  @Get('products/:id/lots')
  @UseGuards(BranchScopeGuard)
  @BranchScoped()
  listLots(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('warehouseId') warehouseId: string | undefined,
    @Query('includeBlocked') includeBlocked: string | undefined,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.products.listLots(auth, request, id, {
      warehouseId: warehouseId || undefined,
      includeBlocked: includeBlocked === 'true',
    });
  }

  @Get('product-categories')
  listCategories(@CurrentAuth() auth: AuthContext) {
    return this.products.listCategories(auth);
  }

  @Post('product-categories')
  @RequirePermissions('product.manage')
  createCategory(
    @Body() dto: CreateCategoryDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.products.createCategory(auth, dto, request);
  }

  @Get('units')
  listUnits(@CurrentAuth() auth: AuthContext) {
    return this.products.listUnits(auth);
  }

  @Post('units')
  @RequirePermissions('product.manage')
  createUnit(@Body() dto: CreateUnitDto, @CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.products.createUnit(auth, dto, request);
  }

  @Get('products/:id/conversions')
  listConversions(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.products.listConversions(auth, id);
  }

  @Post('products/:id/conversions')
  @RequirePermissions('product.manage')
  createConversion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateConversionDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.products.createConversion(auth, id, dto, request);
  }
}
