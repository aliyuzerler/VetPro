import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import { VaccinesService } from './vaccines.service';
import {
  CreateVaccineEventDto,
  CreateVaccineProtocolDto,
  CreateVaccineReminderDto,
  ListRemindersQueryDto,
  ListVaccineEventsQueryDto,
  SendVaccineReminderDto,
  UpdateVaccineProtocolDto,
} from './vaccines.dto';

/**
 * Aşı uçları — Faz 10: protokoller, aşı kaydı, takvim ve hatırlatmalar.
 * Tüm yazımlar vaccine.manage izni ister; rol şablonlarında veteriner ve
 * resepsiyon taşır (hatırlatma çağrıları resepsiyonda yaygın akıştır).
 */
@ApiTags('vaccines')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('vaccines')
export class VaccinesController {
  constructor(@Inject(VaccinesService) private readonly vaccines: VaccinesService) {}

  @Get('protocols')
  @RequirePermissions('vaccine.manage')
  listProtocols(@CurrentAuth() auth: AuthContext) {
    return this.vaccines.listProtocols(auth);
  }

  @Post('protocols')
  @RequirePermissions('vaccine.manage')
  createProtocol(
    @Body() dto: CreateVaccineProtocolDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.vaccines.createProtocol(auth, dto, request);
  }

  @Patch('protocols/:id')
  @RequirePermissions('vaccine.manage')
  updateProtocol(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVaccineProtocolDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.vaccines.updateProtocol(auth, id, dto, request);
  }

  @Get('events')
  @RequirePermissions('vaccine.manage')
  listEvents(@Query() query: ListVaccineEventsQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.vaccines.listEvents(auth, query);
  }

  @Post('events')
  @RequirePermissions('vaccine.manage')
  createEvent(
    @Body() dto: CreateVaccineEventDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.vaccines.createEvent(auth, dto, request);
  }

  @Get('schedule/:patientId')
  @RequirePermissions('vaccine.manage')
  schedule(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.vaccines.schedule(auth, patientId, request);
  }

  @Get('reminders')
  @RequirePermissions('vaccine.manage')
  listReminders(@Query() query: ListRemindersQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.vaccines.listReminders(auth, query);
  }

  @Post('reminders/:id/send')
  @RequirePermissions('vaccine.manage')
  sendReminder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendVaccineReminderDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.vaccines.sendReminder(auth, id, dto, request);
  }

  @Patch('reminders/:id/dismiss')
  @RequirePermissions('vaccine.manage')
  dismissReminder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.vaccines.dismissReminder(auth, id, request);
  }

  @Post('events/:id/reminders')
  @RequirePermissions('vaccine.manage')
  createReminderForEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVaccineReminderDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.vaccines.createReminderForEvent(auth, id, dto, request);
  }
}
