import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClinicService } from './clinic.service';
import { UpdateClinicDto } from '../auth/dto/auth.dto';
import { CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext } from '../common/auth/auth-context';

@ApiTags('clinic')
@ApiBearerAuth()
@Controller('clinic')
export class ClinicController {
  constructor(@Inject(ClinicService) private readonly clinicService: ClinicService) {}

  @Get()
  get(@CurrentAuth() auth: AuthContext) {
    return this.clinicService.get(auth.clinicId);
  }

  @Patch()
  @RequirePermissions('settings.manage')
  update(@Body() dto: UpdateClinicDto, @CurrentAuth() auth: AuthContext) {
    return this.clinicService.update(auth.clinicId, auth.staffId, dto);
  }
}
