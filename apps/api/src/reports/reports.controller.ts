import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import { ReportsService } from './reports.service';
import { ExportReportQueryDto, ReportQueryDto } from './reports.dto';

/**
 * Rapor uçları — Faz 14. İzin modeli (kabul kriteri):
 * - görüntüleme: reports.view
 * - dışa aktarma (dosya üretimi): reports.export — izin yoksa guard 403
 *   döndürür ve dosya hiç üretilmez; üretim REPORT_EXPORT denetimi yazar.
 * İndirme akışı: export → kayıt → /exports/:id ile stream (URL token taşımaz).
 */
@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('reports')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get()
  @RequirePermissions('reports.view')
  catalog() {
    return { items: this.reports.catalog() };
  }

  @Get('exports')
  @RequirePermissions('reports.view')
  listExports(@CurrentAuth() auth: AuthContext, @Query('limit') limit?: string) {
    return this.reports.listExports(auth, limit ? Number(limit) : 50);
  }

  @Get(':key')
  @RequirePermissions('reports.view')
  runReport(
    @Param('key') key: string,
    @Query() query: ReportQueryDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.reports.runReport(auth, key, query);
  }

  /** Dışa aktarma — reports.export zorunlu; dosya üretimi + denetim + kayıt. */
  @Get(':key/export')
  @RequirePermissions('reports.export')
  @Header('Cache-Control', 'private, no-store')
  async exportReport(
    @Param('key') key: string,
    @Query() query: ExportReportQueryDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.reports.exportReport(auth, request, key, query.format, query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(result.fileName)}"`,
    );
    res.setHeader('Content-Type', result.mimeType);
    return new StreamableFile(result.buffer);
  }

  /** Yetkili indirme — stream; cache yok. */
  @Get('exports/:id/download')
  @RequirePermissions('reports.view')
  @Header('Cache-Control', 'private, no-store')
  async downloadExport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.reports.readExport(auth, id);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(result.fileName)}"`,
    );
    res.setHeader('Content-Type', result.mimeType);
    return result.stream;
  }
}
