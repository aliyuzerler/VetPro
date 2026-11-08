import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import {
  CreateStaffDto,
  SetStaffBranchesDto,
  SetStaffRolesDto,
  UpdateStaffDto,
} from '../master/master.dto';
import { CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext } from '../common/auth/auth-context';

@ApiTags('staff')
@ApiBearerAuth()
@Controller('staff')
export class StaffController {
  constructor(@Inject(StaffService) private readonly staffService: StaffService) {}

  /**
   * Atama seçicileri için hafif personel listesi (ad-soyad/unvan) — oturum
   * açmış herkes okuyabilir (lab/cerrahi/yatış diyaloqlarında veteriner ataması
   * staff.manage gerektirmeden yapılır). İletişim ve rol verisi içermez.
   */
  @Get('veterinarians')
  listAssignees(@CurrentAuth() auth: AuthContext) {
    return this.staffService.listAssignees(auth.clinicId);
  }

  @Get()
  @RequirePermissions('staff.manage')
  list(@CurrentAuth() auth: AuthContext) {
    return this.staffService.list(auth.clinicId);
  }

  @Get(':id')
  @RequirePermissions('staff.manage')
  async detail(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.staffService.detail(auth.clinicId, id);
  }

  @Post()
  @RequirePermissions('staff.manage')
  create(@Body() dto: CreateStaffDto, @CurrentAuth() auth: AuthContext) {
    return this.staffService.create(auth, dto);
  }

  @Patch(':id')
  @RequirePermissions('staff.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.staffService.update(auth, id, dto);
  }

  @Put(':id/roles')
  @RequirePermissions('staff.manage')
  setRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStaffRolesDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.staffService.setRoles(auth, id, dto.roleIds);
  }

  @Put(':id/branches')
  @RequirePermissions('staff.manage')
  setBranches(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStaffBranchesDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.staffService.setBranches(auth, id, dto.branchIds);
  }
}
