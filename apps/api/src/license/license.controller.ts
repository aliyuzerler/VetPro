import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { LicenseStatus } from '@vetcore/contracts';
import { LicenseService } from './license.service';
import { ActivateLicenseDto } from './license.dto';
import { CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext } from '../common/auth/auth-context';

/**
 * Faz 15 — kalıcı lisans uçları.
 * Durum tüm oturum açan personele görünür (Ayarlar kartı); aktivasyon
 * settings.manage izni gerektirir. Abonelik/billing kavramı YOKTUR.
 */
@ApiTags('license')
@ApiBearerAuth()
@Controller('license')
export class LicenseController {
  constructor(@Inject(LicenseService) private readonly licenseService: LicenseService) {}

  @Get()
  status(@CurrentAuth() auth: AuthContext): Promise<LicenseStatus> {
    return this.licenseService.status(auth.clinicId);
  }

  @Post('activate')
  @RequirePermissions('settings.manage')
  activate(
    @Body() dto: ActivateLicenseDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<LicenseStatus> {
    return this.licenseService.activate(auth.clinicId, auth.staffId, dto.licenseKey, dto.note);
  }
}
