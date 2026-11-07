import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto, SetRolePermissionsDto, UpdateRoleDto } from '../master/master.dto';
import { CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext } from '../common/auth/auth-context';

@ApiTags('roles')
@ApiBearerAuth()
@Controller()
export class RolesController {
  constructor(@Inject(RolesService) private readonly rolesService: RolesService) {}

  /** Rol listesi — ayarlar dışında ad görüntüleme için de kimlikli erişime açıktır. */
  @Get('roles')
  list(@CurrentAuth() auth: AuthContext) {
    return this.rolesService.list(auth.clinicId);
  }

  /** İzin kataloğu — global sabit liste. */
  @Get('permissions')
  permissions() {
    return this.rolesService.permissionCatalog();
  }

  @Post('roles')
  @RequirePermissions('roles.manage')
  create(@Body() dto: CreateRoleDto, @CurrentAuth() auth: AuthContext) {
    return this.rolesService.create(auth, dto);
  }

  @Patch('roles/:id')
  @RequirePermissions('roles.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.rolesService.update(auth, id, dto);
  }

  /** İzin matrisi güncellemesi — denetim defterine before/after yazılır. */
  @Put('roles/:id/permissions')
  @RequirePermissions('roles.manage')
  setPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRolePermissionsDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.rolesService.setPermissions(auth, id, dto.permissionKeys);
  }
}
