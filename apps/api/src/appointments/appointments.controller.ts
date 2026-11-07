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
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { AppointmentsService } from './appointments.service';
import {
  AppointmentStatusDto,
  CancelAppointmentDto,
  CreateAppointmentDto,
  FlowboardQueryDto,
  ListAppointmentsQueryDto,
  UpdateAppointmentDto,
} from './appointments.dto';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';

export class WaitlistStatusQueryDto {
  @IsOptional()
  @IsIn(['waiting', 'scheduled', 'cancelled'])
  status?: string;
}

export class ScheduleBlocksQueryDto {
  @IsOptional()
  @IsUUID()
  staffId?: string;
}

/**
 * Randevu uçları — ŞUBE KAPSAMLI (BranchScopeGuard). Yazma uçları appointment.manage,
 * çalışma saati dışı override ise appointment.override izni ister.
 */
@ApiTags('appointments')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('appointments')
export class AppointmentsController {
  constructor(@Inject(AppointmentsService) private readonly service: AppointmentsService) {}

  @Get()
  list(@Query() query: ListAppointmentsQueryDto, @CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.service.list(auth, request, {
      from: query.from,
      to: query.to,
      staffId: query.staffId,
      roomId: query.roomId,
      patientId: query.patientId,
      includeClosed: query.includeClosed,
    });
  }

  @Post()
  @RequirePermissions('appointment.manage')
  create(
    @Body() dto: CreateAppointmentDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.create(auth, request, dto);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.service.detail(auth, id);
  }

  @Patch(':id')
  @RequirePermissions('appointment.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.update(auth, id, dto);
  }

  @Post(':id/check-in')
  @RequirePermissions('appointment.manage')
  checkIn(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.service.checkIn(auth, id);
  }

  @Post(':id/status')
  @RequirePermissions('appointment.manage')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AppointmentStatusDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.changeStatus(auth, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions('appointment.manage')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelAppointmentDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.cancel(auth, id, dto);
  }
}

/** Akış panosu — hasta kuyruğu şeritleri (arrived / waiting / in_consultation). */
@ApiTags('flowboard')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('flowboard')
export class FlowboardController {
  constructor(@Inject(AppointmentsService) private readonly service: AppointmentsService) {}

  @Get()
  flowboard(
    @Query() query: FlowboardQueryDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.flowboard(auth, request, query.date);
  }
}
