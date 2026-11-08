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
import { SurgeriesService } from './surgeries.service';
import {
  CancelSurgeryDto,
  CreateSurgeryCaseDto,
  ListSurgeriesQueryDto,
  ToggleChecklistItemDto,
  UpdateSurgeryCaseDto,
  UpsertAnesthesiaDto,
} from './surgeries.dto';

/**
 * Cerrahi uçları — Faz 11: olgu planlama, hazırlık, ameliyat, iyileşme,
 * tamamlama; anestezi çizelgesi ve kontrol listeleri. Tüm uçlar
 * surgery.manage ister; olgular encounter/patient/vet bağlantılı üretilir.
 */
@ApiTags('surgeries')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('surgeries')
export class SurgeriesController {
  constructor(@Inject(SurgeriesService) private readonly surgeries: SurgeriesService) {}

  @Get()
  @RequirePermissions('surgery.manage')
  listCases(
    @Query() query: ListSurgeriesQueryDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.surgeries.listCases(auth, query, request);
  }

  @Get(':id')
  @RequirePermissions('surgery.manage')
  getCase(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.surgeries.getCase(auth, id, request);
  }

  @Post()
  @RequirePermissions('surgery.manage')
  createCase(
    @Body() dto: CreateSurgeryCaseDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.surgeries.createCase(auth, dto, request);
  }

  @Patch(':id')
  @RequirePermissions('surgery.manage')
  updateCase(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSurgeryCaseDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.surgeries.updateCase(auth, id, dto, request);
  }

  @Post(':id/prep')
  @RequirePermissions('surgery.manage')
  prepCase(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.surgeries.prepCase(auth, id, request);
  }

  @Post(':id/start')
  @RequirePermissions('surgery.manage')
  startSurgery(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.surgeries.startSurgery(auth, id, request);
  }

  @Post(':id/recovery')
  @RequirePermissions('surgery.manage')
  recovery(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.surgeries.recovery(auth, id, request);
  }

  @Post(':id/complete')
  @RequirePermissions('surgery.manage')
  completeCase(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.surgeries.completeCase(auth, id, request);
  }

  @Post(':id/cancel')
  @RequirePermissions('surgery.manage')
  cancelCase(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelSurgeryDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.surgeries.cancelCase(auth, id, dto, request);
  }

  @Post(':id/anesthesia')
  @RequirePermissions('surgery.manage')
  upsertAnesthesia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertAnesthesiaDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.surgeries.upsertAnesthesia(auth, id, dto, request);
  }

  @Post(':id/checklists/:kind/items')
  @RequirePermissions('surgery.manage')
  toggleChecklistItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind') kind: string,
    @Body() dto: ToggleChecklistItemDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.surgeries.toggleChecklistItem(auth, id, kind, dto, request);
  }
}
