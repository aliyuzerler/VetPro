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
import { SchedulingService } from './scheduling.service';
import {
  BookWaitlistDto,
  CreateAppointmentTypeDto,
  CreateScheduleBlockDto,
  CreateWaitlistDto,
  UpdateAppointmentTypeDto,
  UpdateScheduleBlockDto,
  UpdateWaitlistDto,
} from './appointments.dto';
import { ScheduleBlocksQueryDto, WaitlistStatusQueryDto } from './appointments.controller';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';

/** Randevu türü kataloğu — klinik kapsamlı; yazma appointment.manage ister. */
@ApiTags('appointment-types')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('appointment-types')
export class AppointmentTypesController {
  constructor(@Inject(SchedulingService) private readonly service: SchedulingService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    return this.service.listTypes(auth.clinicId);
  }

  @Post()
  @RequirePermissions('appointment.manage')
  create(@Body() dto: CreateAppointmentTypeDto, @CurrentAuth() auth: AuthContext) {
    return this.service.createType(auth, dto);
  }

  @Patch(':id')
  @RequirePermissions('appointment.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentTypeDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.updateType(auth, id, dto);
  }
}

/** Çalışma saatleri ve plan engelleri — şube kapsamlı; yazma appointment.manage ister. */
@ApiTags('schedule-blocks')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('schedule-blocks')
export class ScheduleBlocksController {
  constructor(@Inject(SchedulingService) private readonly service: SchedulingService) {}

  @Get()
  list(
    @Query() query: ScheduleBlocksQueryDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.listBlocks(auth, request, query.staffId);
  }

  @Post()
  @RequirePermissions('appointment.manage')
  create(
    @Body() dto: CreateScheduleBlockDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.createBlock(auth, request, dto);
  }

  @Patch(':id')
  @RequirePermissions('appointment.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduleBlockDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.updateBlock(auth, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('appointment.manage')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.service.deleteBlock(auth, id);
  }
}

/** Bekleme listesi — şube kapsamlı; yazma appointment.manage ister. */
@ApiTags('waitlist')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('waitlist')
export class WaitlistController {
  constructor(@Inject(SchedulingService) private readonly service: SchedulingService) {}

  @Get()
  list(
    @Query() query: WaitlistStatusQueryDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.listWaitlist(auth, request, query.status);
  }

  @Post()
  @RequirePermissions('appointment.manage')
  create(
    @Body() dto: CreateWaitlistDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.createWaitlist(auth, request, dto);
  }

  @Patch(':id')
  @RequirePermissions('appointment.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWaitlistDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.updateWaitlist(auth, id, dto);
  }

  @Post(':id/book')
  @RequirePermissions('appointment.manage')
  book(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BookWaitlistDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.bookWaitlist(auth, request, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions('appointment.manage')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.service.cancelWaitlist(auth, id);
  }
}
