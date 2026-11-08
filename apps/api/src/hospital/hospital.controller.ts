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
import { HospitalService } from './hospital.service';
import {
  AdmitStayDto,
  AdministerMedicationDto,
  CreateKennelDto,
  CreateObservationDto,
  DischargeStayDto,
  ListStaysQueryDto,
  TransferStayDto,
  UpdateKennelDto,
} from './hospital.dto';

/**
 * Yatış uçları — Faz 11: kennel tanımları, kabul/transfer/taburculuk,
 * günlük gözlem ve tedavi sarfı. Stok düşümlü ilaç uygulaması Faz 08 ortak
 * transaction servisini kullanır ve inventory.consume izni ister.
 */
@ApiTags('hospital')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('hospital')
export class HospitalController {
  constructor(@Inject(HospitalService) private readonly hospital: HospitalService) {}

  @Get('kennels')
  @RequirePermissions('hospital.manage')
  listKennels(@CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.hospital.listKennels(auth, request);
  }

  @Post('kennels')
  @RequirePermissions('hospital.manage')
  createKennel(
    @Body() dto: CreateKennelDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.hospital.createKennel(auth, dto, request);
  }

  @Patch('kennels/:id')
  @RequirePermissions('hospital.manage')
  updateKennel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKennelDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.hospital.updateKennel(auth, id, dto, request);
  }

  @Get('panel')
  @RequirePermissions('hospital.manage')
  panel(@CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.hospital.panel(auth, request);
  }

  @Get('stays')
  @RequirePermissions('hospital.manage')
  listStays(
    @Query() query: ListStaysQueryDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.hospital.listStays(auth, query, request);
  }

  @Get('stays/:id')
  @RequirePermissions('hospital.manage')
  getStay(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.hospital.getStay(auth, id, request);
  }

  @Post('stays')
  @RequirePermissions('hospital.manage')
  admit(
    @Body() dto: AdmitStayDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.hospital.admit(auth, dto, request);
  }

  @Post('stays/:id/transfer')
  @RequirePermissions('hospital.manage')
  transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferStayDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.hospital.transfer(auth, id, dto, request);
  }

  @Post('stays/:id/discharge')
  @RequirePermissions('hospital.manage')
  discharge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DischargeStayDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.hospital.discharge(auth, id, dto, request);
  }

  @Get('stays/:id/observations')
  @RequirePermissions('hospital.manage')
  listObservations(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.hospital.listObservations(auth, id, request);
  }

  @Post('stays/:id/observations')
  @RequirePermissions('hospital.manage')
  addObservation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateObservationDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.hospital.addObservation(auth, id, dto, request);
  }

  @Post('stays/:id/medications')
  @RequirePermissions('hospital.manage', 'inventory.consume')
  administerMedication(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdministerMedicationDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.hospital.administerMedication(auth, id, dto, request);
  }

  @Get('stays/:id/medications')
  @RequirePermissions('hospital.manage')
  listMedications(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.hospital.listMedications(auth, id, request);
  }
}
