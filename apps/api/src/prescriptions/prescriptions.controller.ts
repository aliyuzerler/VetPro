import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import { PrescriptionsService } from './prescriptions.service';
import {
  AddPrescriptionLineDto,
  AdministerDto,
  ApproveDoseDto,
  CreatePrescriptionDto,
  DispenseLineDto,
  DoseHelperDto,
  ListAdministrationsQueryDto,
  ListPrescriptionsQueryDto,
  SignPrescriptionDto,
  VoidPrescriptionDto,
} from './prescriptions.dto';

/**
 * Reçete uçları — Faz 10.
 *
 * İzin modeli:
 * - prescription.manage: taslak oluşturma/satır düzenleme/uygulama kaydı
 * - prescription.sign: imza + doz önerisi onayı (yetkili veteriner)
 * - prescription.dispense: imzalı reçeteden depo sevki (stok düşümü ile)
 */
@ApiTags('prescriptions')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(@Inject(PrescriptionsService) private readonly prescriptions: PrescriptionsService) {}

  /** Doz yardımcısı — saf aritmetik öneri (kalıcılık yok, onay gerektirmez). */
  @Post('dose-helper')
  @RequirePermissions('prescription.manage')
  doseHelper(@Body() dto: DoseHelperDto) {
    return this.prescriptions.doseHelper(dto);
  }

  @Post()
  @RequirePermissions('prescription.manage')
  create(
    @Body() dto: CreatePrescriptionDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.prescriptions.create(auth, dto, request);
  }

  @Get()
  @RequirePermissions('prescription.manage')
  list(@Query() query: ListPrescriptionsQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.prescriptions.list(auth, query);
  }

  @Get('administrations')
  @RequirePermissions('prescription.manage')
  listAdministrations(
    @Query() query: ListAdministrationsQueryDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.prescriptions.listAdministrations(auth, query);
  }

  @Get(':id')
  @RequirePermissions('prescription.manage')
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.prescriptions.detail(auth, id, request);
  }

  @Get(':id/dispenses')
  @RequirePermissions('prescription.manage')
  listDispenses(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.prescriptions.listDispenses(auth, id, request);
  }

  @Post(':id/lines')
  @RequirePermissions('prescription.manage')
  addLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPrescriptionLineDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.prescriptions.addLine(auth, id, dto, request);
  }

  @Delete(':id/lines/:lineId')
  @RequirePermissions('prescription.manage')
  removeLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.prescriptions.removeLine(auth, id, lineId, request);
  }

  /** Doz önerisi onayı — yalnızca yetkili veteriner (prescription.sign). */
  @Post(':id/lines/:lineId/approve-dose')
  @RequirePermissions('prescription.sign')
  approveDose(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: ApproveDoseDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.prescriptions.approveDose(auth, id, lineId, dto, request);
  }

  @Post(':id/sign')
  @RequirePermissions('prescription.sign')
  sign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignPrescriptionDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.prescriptions.sign(auth, id, dto, request);
  }

  @Post(':id/void')
  @RequirePermissions('prescription.manage')
  void(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidPrescriptionDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.prescriptions.void(auth, id, dto, request);
  }

  @Post(':id/dispense')
  @RequirePermissions('prescription.dispense')
  dispense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DispenseLineDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.prescriptions.dispense(auth, id, dto, request);
  }

  @Post('administrations')
  @RequirePermissions('prescription.manage')
  administer(
    @Body() dto: AdministerDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.prescriptions.administer(auth, dto, request);
  }
}
