import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext, AuthRequest } from '../common/auth/auth-context';
import { ImportsService } from './imports.service';
import { IMPORT_KINDS, type ImportKind } from './imports.domain';

export class ImportKindQueryDto {
  @IsIn(IMPORT_KINDS)
  kind!: ImportKind;

  @IsOptional()
  @Type(() => String)
  @IsUUID()
  branchId?: string;
}

export class ResolveRowDto {
  @IsIn(['create', 'skip'])
  resolution!: 'create' | 'skip';
}

/**
 * İçe aktarma uçları — Faz 14. Tüm yazımlar import.manage izniyle; şablon
 * indirme de izinli (veri modelini açığa atmaz ama tutarlı akış için).
 */
@ApiTags('imports')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('imports')
export class ImportsController {
  constructor(@Inject(ImportsService) private readonly imports: ImportsService) {}

  /** Şablon indir — UTF-8 BOM'lu CSV, başlık + örnek satır. */
  @Get('template')
  @RequirePermissions('import.manage')
  @Header('Cache-Control', 'private, no-store')
  downloadTemplate(
    @Query('kind') kind: ImportKind,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = this.imports.template(kind);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(result.fileName)}"`,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return new StreamableFile(result.csv);
  }

  @Get()
  @RequirePermissions('import.manage')
  listJobs(@CurrentAuth() auth: AuthContext, @Query('limit') limit?: string) {
    return this.imports.listJobs(auth, limit ? Number(limit) : 50);
  }

  @Get(':id')
  @RequirePermissions('import.manage')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.imports.detail(auth, id);
  }

  /** CSV yükle — multipart (file); doğrulama + preview üretir. */
  @Post('upload')
  @RequirePermissions('import.manage')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: { type: 'string', enum: IMPORT_KINDS },
        branchId: { type: 'string', format: 'uuid' },
      },
      required: ['file', 'kind'],
    },
  })
  upload(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Body() body: { kind?: ImportKind; branchId?: string },
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    if (!file) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'CSV dosyası yüklenmelidir' });
    }
    if (!body.kind || !IMPORT_KINDS.includes(body.kind)) {
      throw new BadRequestException({ code: 'IMPORT_KIND_REQUIRED', message: 'kind alanı zorunludur' });
    }
    return this.imports.upload(
      auth,
      request,
      body.kind,
      body.branchId,
      file.originalname,
      file.buffer,
    );
  }

  /** Duplicate satır için açık karar — create|skip. */
  @Patch(':id/rows/:rowId')
  @RequirePermissions('import.manage')
  resolveRow(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Body() dto: ResolveRowDto,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.imports.resolveRow(auth, id, rowId, dto.resolution);
  }

  /** Commit — hata satırı/çözümsüz duplicate varsa reddedilir. */
  @Post(':id/commit')
  @RequirePermissions('import.manage')
  commit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.imports.commit(auth, request, id);
  }
}
