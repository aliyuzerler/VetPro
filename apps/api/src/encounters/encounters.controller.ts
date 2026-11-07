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
import { IsString, MaxLength, MinLength } from 'class-validator';
import { EncountersService } from './encounters.service';
import {
  AddDiagnosisDto,
  AddVitalDto,
  CreateAddendumDto,
  CreateAttachmentDto,
  CreateEncounterDto,
  CreateServiceRecordDto,
  ListEncountersQueryDto,
  UpdateEncounterDto,
} from './encounters.dto';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';

export class VoidEncounterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

/**
 * Muayene uçları — ŞUBE KAPSAMLI (BranchScopeGuard). Yazma uçları encounter.manage,
 * imza ve addendum clinical.sign izni ister (kabul kriteri: yetkisiz kişi
 * imzalayamaz). İmzalı kayıtlar PATCH/DELETE'te 409 ENCOUNTER_SIGNED döner.
 */
@ApiTags('encounters')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('encounters')
export class EncountersController {
  constructor(@Inject(EncountersService) private readonly service: EncountersService) {}

  @Get()
  list(@Query() query: ListEncountersQueryDto, @CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.service.list(auth, request, query);
  }

  @Post()
  @RequirePermissions('encounter.manage')
  create(@Body() dto: CreateEncounterDto, @CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.service.create(auth, dto, request);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.service.detail(auth, request, id);
  }

  @Patch(':id')
  @RequirePermissions('encounter.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEncounterDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.update(auth, id, dto, request);
  }

  @Post(':id/sign')
  @RequirePermissions('clinical.sign')
  sign(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.service.sign(auth, id, request);
  }

  @Post(':id/close')
  @RequirePermissions('clinical.sign')
  close(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.service.close(auth, id, request);
  }

  @Post(':id/void')
  @RequirePermissions('encounter.manage')
  void(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidEncounterDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.void(auth, id, dto.reason, request);
  }

  @Delete(':id')
  @RequirePermissions('encounter.manage')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.service.remove(auth, id, request);
  }

  // ---- Vital bulgular ----

  @Post(':id/vitals')
  @RequirePermissions('encounter.manage')
  addVital(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddVitalDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.addVital(auth, id, dto, request);
  }

  /** Hasta vital geçmişi — aynı kind için tüm ölçümler korunur (kabul kriteri 2). */
  @Get('patient/:patientId/vitals')
  patientVitals(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query('kind') kind: string | undefined,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.patientVitals(auth, request, patientId, kind);
  }

  // ---- Tanılar ----

  @Post(':id/diagnoses')
  @RequirePermissions('encounter.manage')
  addDiagnosis(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddDiagnosisDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.addDiagnosis(auth, id, dto, request);
  }

  @Delete(':id/diagnoses/:diagnosisId')
  @RequirePermissions('encounter.manage')
  removeDiagnosis(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('diagnosisId', ParseUUIDPipe) diagnosisId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.removeDiagnosis(auth, id, diagnosisId, request);
  }

  // ---- Ekler ----

  @Post(':id/attachments')
  @RequirePermissions('encounter.manage')
  addAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAttachmentDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.addAttachment(auth, id, dto, request);
  }

  @Delete(':id/attachments/:attachmentId')
  @RequirePermissions('encounter.manage')
  removeAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.removeAttachment(auth, id, attachmentId, request);
  }

  // ---- Addendum ----

  @Post(':id/addendums')
  @RequirePermissions('clinical.sign')
  addAddendum(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAddendumDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.addAddendum(auth, id, dto, request);
  }

  // ---- Hizmet kayıtları ----

  @Post(':id/service-records')
  @RequirePermissions('encounter.manage')
  createServiceRecord(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateServiceRecordDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.createServiceRecord(auth, id, dto, request);
  }

  @Patch(':id/service-records/:recordId/lines')
  @RequirePermissions('encounter.manage')
  replaceServiceRecordLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body() dto: CreateServiceRecordDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.replaceServiceRecordLines(auth, id, recordId, dto, request);
  }

  @Post(':id/service-records/:recordId/finalize')
  @RequirePermissions('encounter.manage')
  finalizeServiceRecord(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.finalizeServiceRecord(auth, id, recordId, request);
  }

  @Delete(':id/service-records/:recordId')
  @RequirePermissions('encounter.manage')
  removeServiceRecord(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.removeServiceRecord(auth, id, recordId, request);
  }
}
