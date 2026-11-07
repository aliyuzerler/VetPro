import { BadRequestException, ForbiddenException, Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BRANCH_SCOPED_KEY } from './decorators';
import type { AuthRequest } from './auth-context';

/**
 * Şube kapsamı guard'ı — @BranchScoped() işaretli uçlarda çalışır.
 * Şube kimliği sırasıyla: query.branchId → X-Branch-Id başlığı → body.branchId.
 * Kural: allBranches rolü her şubeye erişir; aksi halde StaffBranch listesi belirleyicidir.
 * Çözümlenen şube `request.branchId` alanına konur; doğrudan şube B kaydına erişim 403 verir.
 */
@Injectable()
export class BranchScopeGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const scoped = this.reflector.getAllAndOverride<boolean>(BRANCH_SCOPED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!scoped) return true;

    const request = context
      .switchToHttp()
      .getRequest<AuthRequest & { headers: Record<string, string | string[] | undefined>; query?: Record<string, unknown>; body?: Record<string, unknown> }>();
    const auth = request.auth;
    if (!auth) throw new ForbiddenException('Kimlik bağlamı yok');

    const fromQuery = typeof request.query?.branchId === 'string' ? request.query.branchId : undefined;
    const headerValue = request.headers['x-branch-id'];
    const fromHeader = typeof headerValue === 'string' ? headerValue : undefined;
    const fromBody = typeof request.body?.branchId === 'string' ? request.body.branchId : undefined;
    const requested = fromQuery ?? fromHeader ?? fromBody;

    if (auth.allBranches) {
      // Tüm şubeler yetkisi varsa istenen şube serbest (klinik doğrulaması serviste).
      request.branchId = requested ?? auth.activeBranchId ?? undefined;
      return true;
    }

    if (requested) {
      if (!auth.branchIds.includes(requested)) {
        throw new ForbiddenException('Bu şube için yetkiniz yok');
      }
      request.branchId = requested;
      return true;
    }

    // Şube belirtilmemiş: tek şubeli personelde otomatik, aksi halde oturum şubesi.
    if (auth.branchIds.length === 1) {
      request.branchId = auth.branchIds[0];
      return true;
    }
    if (auth.activeBranchId && auth.branchIds.includes(auth.activeBranchId)) {
      request.branchId = auth.activeBranchId;
      return true;
    }
    throw new BadRequestException('Şube belirtilmeli (branchId veya X-Branch-Id)');
  }
}
