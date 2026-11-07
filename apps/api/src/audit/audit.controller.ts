import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { ListAuditQueryDto } from '../master/master.dto';
import { CurrentAuth, RequirePermissions } from '../common/auth/decorators';
import type { AuthContext } from '../common/auth/auth-context';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-events')
export class AuditController {
  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  /** Denetim defteri — yalnızca audit.view izni olan personel görüntüleyebilir. */
  @Get()
  @RequirePermissions('audit.view')
  list(@Query() query: ListAuditQueryDto, @CurrentAuth() auth: AuthContext) {
    return this.auditService.list({
      clinicId: auth.clinicId,
      staffId: query.staffId,
      action: query.action,
      skip: query.skip ?? 0,
      take: Math.min(query.take ?? 50, 200),
    });
  }
}
