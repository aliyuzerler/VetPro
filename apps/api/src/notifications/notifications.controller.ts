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
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import { NotificationsService } from './notifications.service';
import {
  CreateNotificationTemplateDto,
  DeliveryReportQueryDto,
  EnqueueNotificationDto,
  ListNotificationsQueryDto,
  RunNotificationQueueDto,
  UpdateNotificationTemplateDto,
} from './notifications.dto';

/**
 * Bildirim uçları — Faz 12. Tüm uçlar notification.manage ister. Onay kuralı
 * (consent) servis katmanında kuyruğa girişte zorlanır; kuyruk işleme tiki
 * (run-queue) üretimde worker uygulamasından çağrılır (REDIS_URL pasif modda
 * API tiki esas kalır).
 */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  @Get('templates')
  @RequirePermissions('notification.manage')
  listTemplates(
    @CurrentAuth() auth: AuthContext,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.notifications.listTemplates(auth, includeInactive === 'true');
  }

  @Post('templates')
  @RequirePermissions('notification.manage')
  createTemplate(
    @Body() dto: CreateNotificationTemplateDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.notifications.createTemplate(auth, dto, request);
  }

  @Patch('templates/:id')
  @RequirePermissions('notification.manage')
  updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNotificationTemplateDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.notifications.updateTemplate(auth, id, dto, request);
  }

  /** Sahibin kanal bazlı iletişim onay durumu — kilit nedenlerini UI gösterir. */
  @Get('consents/:ownerId')
  @RequirePermissions('notification.manage')
  getConsentStatus(
    @Param('ownerId', ParseUUIDPipe) ownerId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.notifications.getConsentStatus(auth, ownerId);
  }

  @Post('enqueue')
  @RequirePermissions('notification.manage')
  enqueue(
    @Body() dto: EnqueueNotificationDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.notifications.enqueue(auth, dto, request);
  }

  @Post('run-queue')
  @RequirePermissions('notification.manage')
  runQueue(
    @Body() dto: RunNotificationQueueDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.notifications.runQueue(auth, dto, request);
  }

  @Get('delivery-report')
  @RequirePermissions('notification.manage')
  deliveryReport(
    @Query() query: DeliveryReportQueryDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.notifications.deliveryReport(auth, query, request);
  }

  @Get()
  @RequirePermissions('notification.manage')
  listNotifications(
    @Query() query: ListNotificationsQueryDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.notifications.listNotifications(auth, query, request);
  }

  @Get(':id')
  @RequirePermissions('notification.manage')
  getNotification(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.notifications.getNotification(auth, id, request);
  }

  @Post(':id/retry')
  @RequirePermissions('notification.manage')
  retryNotification(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.notifications.retryOne(auth, id, request);
  }
}
