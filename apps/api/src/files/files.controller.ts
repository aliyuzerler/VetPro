import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { FilesService } from './files.service';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import { BranchScoped, CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext } from '../common/auth/auth-context';

export class UploadBodyDto {
  @Type(() => String)
  @IsUUID()
  patientId!: string;
}

export class ListFilesQueryDto {
  @IsUUID()
  patientId!: string;
}

/**
 * Hasta dosyaları — private storage (Faz 04 kabul kriteri):
 * - Metadata listesi: GET /file-assets?patientId=... (kimlik + şube kapsamı).
 * - Yükleme: POST /file-assets/upload multipart (file + patientId);
 *   patient.manage izni + şube kapsamı gerekir.
 * - İndirme: GET /file-assets/:id/download — her istekte kimlik + şube kapsamı
 *   doğrulanır; dosya akışla döner. Dışarıya kalıcı/genel URL asla verilmez.
 */
@ApiTags('file-assets')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('file-assets')
export class FilesController {
  constructor(@Inject(FilesService) private readonly filesService: FilesService) {}

  /** Hasta dosyaları metadata listesi — içerik dahil değildir. */
  @Get()
  list(@Query() query: ListFilesQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.filesService.listForPatient(auth, query.patientId);
  }

  @Post('upload')
  @RequirePermissions('patient.manage')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'patientId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        patientId: { type: 'string', format: 'uuid' },
      },
    },
  })
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAuth() auth: AuthContext,
    @Body() body: Record<string, unknown>,
  ) {
    if (!file) throw new BadRequestException('file alanı zorunlu');
    const patientId = typeof body.patientId === 'string' ? body.patientId : undefined;
    if (!patientId) throw new BadRequestException('patientId zorunlu');
    return this.filesService.upload(auth, patientId, {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });
  }

  /** Yetkili indirme — akış + Content-Disposition; URL token/imza taşımaz. */
  @Get(':id/download')
  @Header('Cache-Control', 'private, no-store')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.filesService.download(auth, id);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(result.fileName)}"`,
    );
    res.setHeader('Content-Type', result.mimeType);
    return new StreamableFile(result.stream);
  }
}
