import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import { IntegrationsService } from './integrations.service';
import { CreateIntegrationConnectionDto, UpdateIntegrationConnectionDto } from './integrations.dto';

/**
 * Entegrasyon uçları — Faz 12. Bağlantı yönetimi settings.manage ister;
 * list ve sandbox kontrolü settings.manage sahiplerine açıktır. Yanıtlarda
 * provider secret asla taşınmaz (config yazım anında taranır).
 */
@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('integrations')
export class IntegrationsController {
  constructor(@Inject(IntegrationsService) private readonly integrations: IntegrationsService) {}

  @Get()
  @RequirePermissions('settings.manage')
  list(@CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.integrations.list(auth, request);
  }

  @Post()
  @RequirePermissions('settings.manage')
  create(
    @Body() dto: CreateIntegrationConnectionDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.integrations.create(auth, dto, request);
  }

  @Patch(':id')
  @RequirePermissions('settings.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIntegrationConnectionDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.integrations.update(auth, id, dto, request);
  }

  @Post(':id/sandbox-check')
  @RequirePermissions('settings.manage')
  runSandboxCheck(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.integrations.runSandboxCheck(auth, id, request);
  }
}
