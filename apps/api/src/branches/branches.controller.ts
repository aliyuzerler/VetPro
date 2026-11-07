import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from '../master/master.dto';
import { CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext } from '../common/auth/auth-context';

@ApiTags('branches')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
  constructor(@Inject(BranchesService) private readonly branchesService: BranchesService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    return this.branchesService.list(auth.clinicId);
  }

  @Post()
  @RequirePermissions('branch.manage')
  create(@Body() dto: CreateBranchDto, @CurrentAuth() auth: AuthContext) {
    return this.branchesService.create(auth.clinicId, auth.staffId, dto);
  }

  @Patch(':id')
  @RequirePermissions('branch.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.branchesService.update(auth.clinicId, auth.staffId, id, dto);
  }
}
