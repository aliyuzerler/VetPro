import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { CreateRoomDto, UpdateRoomDto } from '../master/master.dto';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';

@ApiTags('rooms')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('rooms')
export class RoomsController {
  constructor(@Inject(RoomsService) private readonly roomsService: RoomsService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.roomsService.list(auth.clinicId, request.branchId);
  }

  @Post()
  @RequirePermissions('room.manage')
  create(@Body() dto: CreateRoomDto, @CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.roomsService.create(auth, dto, request.branchId!);
  }

  @Patch(':id')
  @RequirePermissions('room.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoomDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.roomsService.update(auth, id, dto);
  }
}
