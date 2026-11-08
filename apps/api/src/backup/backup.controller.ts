import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { Response } from 'express';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import { BackupService } from './backup.service';

export class BackupConfigDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  retentionDays!: number;
}

export class BackupRunBodyDto {
  @IsOptional()
  @Type(() => String)
  kind?: 'manual' | 'scheduled';
}

/**
 * Yedekleme uçları — Faz 14. Tüm uçlar backup.manage izni ister (katalogda
 * yalnız Klinik Yöneticisi şablonunda var → owner-only UI). İndirme akışla
 * değil buffer ile döner (demo ölçeği); dosya modu 0600, URL token taşımaz.
 */
@ApiTags('backup')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('backup')
export class BackupController {
  constructor(@Inject(BackupService) private readonly backup: BackupService) {}

  @Post('run')
  @RequirePermissions('backup.manage')
  runBackup(
    @Body() dto: BackupRunBodyDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.backup.runBackup(auth, request, dto.kind ?? 'manual');
  }

  @Get('runs')
  @RequirePermissions('backup.manage')
  listRuns(@CurrentAuth() auth: AuthContext, @Query('limit') limit?: string) {
    return this.backup.listRuns(auth, limit ? Number(limit) : 50);
  }

  @Get('config')
  @RequirePermissions('backup.manage')
  getConfig(@CurrentAuth() auth: AuthContext) {
    return this.backup.getConfig(auth);
  }

  @Patch('config')
  @RequirePermissions('backup.manage')
  updateConfig(
    @Body() dto: BackupConfigDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.backup.updateConfig(auth, request, dto.retentionDays);
  }

  @Post('retention')
  @RequirePermissions('backup.manage')
  applyRetention(@CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.backup.applyRetention(auth, request);
  }

  @Get('runs/:id/manifest')
  @RequirePermissions('backup.manage')
  readManifest(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.backup.readManifest(auth, id);
  }

  /** Şifreli arşiv indirme — backup.manage + kendi kliniği; cache yok. */
  @Get('runs/:id/download')
  @RequirePermissions('backup.manage')
  @Header('Cache-Control', 'private, no-store')
  async downloadArchive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { archive } = await this.backup.readArchive(auth, id);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="vetcore-backup-${id.slice(0, 8)}.vcenc"`,
    );
    return new StreamableFile(archive);
  }

  /** Restore — env gate: yalnız staging'de (docs/RESTORE_RUNBOOK.md). */
  @Post('runs/:id/restore')
  @RequirePermissions('backup.manage')
  restoreRun(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext, @Req() request: AuthRequest) {
    return this.backup.restoreRun(auth, request, id);
  }
}
