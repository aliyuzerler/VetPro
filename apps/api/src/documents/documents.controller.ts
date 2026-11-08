import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
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
import { DocumentsService } from './documents.service';
import { CreatePrintDocumentDto, ListPrintDocumentsQueryDto } from './documents.dto';

/**
 * Belge uçları — Faz 12. Tüm uçlar document.manage ister. PDF indirme
 * StreamableFile ile akar; dış/imzalı URL verilmez (ADR-018 deseni).
 */
@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(BranchScopeGuard)
@BranchScoped()
@Controller('documents')
export class DocumentsController {
  constructor(@Inject(DocumentsService) private readonly documents: DocumentsService) {}

  @Post('print')
  @RequirePermissions('document.manage')
  createPrintDocument(
    @Body() dto: CreatePrintDocumentDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.documents.createPrintDocument(auth, dto, request);
  }

  @Get()
  @RequirePermissions('document.manage')
  listDocuments(
    @Query() query: ListPrintDocumentsQueryDto,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.documents.listDocuments(auth, query, request);
  }

  @Get(':id')
  @RequirePermissions('document.manage')
  getDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ) {
    return this.documents.getDocument(auth, id, request);
  }

  /** Yetkili PDF indirme — akış + Content-Disposition; URL token taşımaz. */
  @Get(':id/pdf')
  @RequirePermissions('document.manage')
  @Header('Cache-Control', 'private, no-store')
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.documents.readPdf(auth, id, request);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(result.fileName)}"`,
    );
    res.setHeader('Content-Type', result.mimeType);
    return new StreamableFile(result.stream);
  }
}
