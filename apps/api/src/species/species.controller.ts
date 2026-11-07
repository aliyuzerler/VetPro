import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { SpeciesService } from './species.service';
import { CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext } from '../common/auth/auth-context';

export class CreateBreedDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;
}

/**
 * Tür/ırk kataloğu — global master veri (seed ile doldurulur).
 * Okuma tüm kimlikli personel içindir (hasta formunda seçim için);
 * yeni ırk ekleme master.manage izni ister (klinik özel ırklar).
 * Guard zinciri globaldir: JwtAuthGuard → PermissionsGuard.
 */
@ApiTags('species')
@ApiBearerAuth()
@Controller('species')
export class SpeciesController {
  constructor(@Inject(SpeciesService) private readonly speciesService: SpeciesService) {}

  /** Tür kataloğu + aktif ırklar; hasta formundaki seçimler için. */
  @Get()
  list() {
    return this.speciesService.list();
  }

  /** Klinik özel ırk ekleme — master.manage izni gerekir. */
  @Post(':id/breeds')
  @RequirePermissions('master.manage')
  createBreed(
    @Param('id', ParseUUIDPipe) speciesId: string,
    @Body() dto: CreateBreedDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.speciesService.createBreed(auth, speciesId, dto.name.trim());
  }
}
