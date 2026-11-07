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
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PatientsService } from './patients.service';
import {
  ArchivePatientDto,
  CreateAlertDto,
  CreatePatientDto,
  CreateWeightDto,
  MergePatientDto,
  UpdatePatientDto,
} from './patients.dto';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';

export class ListPatientsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  speciesId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  includeArchived?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

export class DuplicatesQueryDto {
  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  microchip?: string;

  @IsOptional()
  @IsString()
  speciesId?: string;
}

export class UpdateAlertBodyDto {
  @IsBoolean()
  active!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  resolutionNote?: string;
}

/**
 * Hasta uçları — ŞUBE KAPSAMLI (BranchScopeGuard): kayıt şubesine erişimi olmayan
 * personel 403 alır (kabul kriteri). Yazma uçları patient.manage izni ister.
 */
@ApiTags('patients')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('patients')
export class PatientsController {
  constructor(@Inject(PatientsService) private readonly patientsService: PatientsService) {}

  @Get()
  list(@Query() query: ListPatientsQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.patientsService.list(auth, {
      search: query.search,
      branchId: query.branchId,
      speciesId: query.speciesId,
      includeArchived: query.includeArchived === 'true',
      take: query.take,
    });
  }

  /** Mükerrer hasta kontrolü — mikroçip veya aynı sahipte aynı ad. */
  @Get('duplicates')
  duplicates(@Query() query: DuplicatesQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.patientsService.duplicates(auth, {
      ownerId: query.ownerId,
      name: query.name,
      microchip: query.microchip,
      speciesId: query.speciesId,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.patientsService.findOne(auth, id);
  }

  /** Hasta zaman çizelgesi iskeleti (kilo, uyarı, dosya, denetim olayları). */
  @Get(':id/timeline')
  timeline(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.patientsService.timeline(auth, id);
  }

  @Patch(':id')
  @RequirePermissions('patient.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.patientsService.update(auth, id, dto);
  }

  @Patch(':id/archive')
  @RequirePermissions('patient.manage')
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ArchivePatientDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.patientsService.archive(auth, id, dto.reason);
  }

  @Patch(':id/unarchive')
  @RequirePermissions('patient.manage')
  unarchive(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.patientsService.unarchive(auth, id);
  }

  @Post(':id/merge')
  @RequirePermissions('patient.manage')
  merge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergePatientDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.patientsService.merge(auth, id, dto.intoPatientId, dto.reason);
  }

  @Post(':id/alerts')
  @RequirePermissions('patient.manage')
  createAlert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAlertDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.patientsService.createAlert(auth, id, dto);
  }

  @Patch(':id/alerts/:alertId')
  @RequirePermissions('patient.manage')
  updateAlert(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @Body() dto: UpdateAlertBodyDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.patientsService.resolveAlert(auth, id, alertId, dto.active);
  }

  @Post(':id/weights')
  @RequirePermissions('patient.manage')
  createWeight(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateWeightDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.patientsService.createWeight(auth, id, dto);
  }
}

/**
 * Sahip altında hasta oluşturma — /owners/:id/patients yolu (API_CONTRACTS).
 * Şube kapsamı: aktif şube veya body.branchId; BranchScopeGuard doğrular.
 */
@ApiTags('patients')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('owners')
export class OwnerPatientsController {
  constructor(@Inject(PatientsService) private readonly patientsService: PatientsService) {}

  @Post(':id/patients')
  @RequirePermissions('patient.manage')
  createForOwner(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePatientDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.patientsService.createForOwner(auth, id, dto, dto.branchId ?? request.branchId);
  }
}
