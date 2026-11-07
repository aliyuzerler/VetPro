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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OwnersService } from './owners.service';
import { ArchiveOwnerDto, CreateOwnerDto, MergeOwnerDto, UpdateOwnerDto } from './owners.dto';
import { CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext } from '../common/auth/auth-context';

export class ListOwnersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

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
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;
}

/**
 * Hasta sahibi uçları — klinik kapsamlı (şube bağımsız; hastalar şube kapsamlı).
 * Okuma tüm kimlikli personel için; yazma owner.manage izni ister.
 */
@ApiTags('owners')
@ApiBearerAuth()
@Controller('owners')
export class OwnersController {
  constructor(@Inject(OwnersService) private readonly ownersService: OwnersService) {}

  @Get()
  list(@Query() query: ListOwnersQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.ownersService.list(auth.clinicId, {
      search: query.search,
      includeArchived: query.includeArchived === 'true',
      take: query.take,
    });
  }

  /** Mükerrer kontrolü — yeni sahip formunda uyarı için; otomatik birleştirme yok. */
  @Get('duplicates')
  duplicates(@Query() query: DuplicatesQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.ownersService.duplicates(auth.clinicId, {
      firstName: query.firstName?.trim() || undefined,
      lastName: query.lastName?.trim() || undefined,
      phone: query.phone?.trim() || undefined,
      email: query.email?.trim() || undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.ownersService.findOne(auth.clinicId, id);
  }

  @Post()
  @RequirePermissions('owner.manage')
  create(@Body() dto: CreateOwnerDto, @CurrentAuth() auth: AuthContext) {
    return this.ownersService.create(auth, dto);
  }

  @Patch(':id')
  @RequirePermissions('owner.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOwnerDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.ownersService.update(auth, id, dto);
  }

  @Patch(':id/archive')
  @RequirePermissions('owner.manage')
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ArchiveOwnerDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.ownersService.archive(auth, id, dto.reason);
  }

  @Patch(':id/unarchive')
  @RequirePermissions('owner.manage')
  unarchive(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.ownersService.unarchive(auth, id);
  }

  /** Açık birleştirme: kaynak hastaları hedefe taşınır, kaynak arşivlenir. */
  @Post(':id/merge')
  @RequirePermissions('owner.manage')
  merge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergeOwnerDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.ownersService.merge(auth, id, dto.intoOwnerId, dto.reason);
  }
}
