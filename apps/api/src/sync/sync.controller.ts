/**
 * Faz 13 — senkronizasyon uçları (docs/API_CONTRACTS.md > Mobile sync).
 * ŞUBE KAPSAMLI (BranchScopeGuard): push/pull aktif şube (X-Branch-Id) veya
 * personelin erişimli şubeleriyle sınırlıdır. Yazma izinleri işlem türüne göre
 * servis düzeyinde zorlanır (encounter.manage / appointment.manage).
 */
import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import { SyncService } from './sync.service';
import { SyncPullQueryDto, SyncPushDto } from './dto/sync.dto';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('sync')
export class SyncController {
  constructor(private readonly service: SyncService) {}

  @Get('kinds')
  kinds() {
    return { kinds: this.service.listKinds() };
  }

  @Post('push')
  push(@Body() dto: SyncPushDto, @CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.service.push(auth, request, dto);
  }

  @Get('pull')
  pull(
    @Query() query: SyncPullQueryDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.service.pull(auth, request, query);
  }
}
