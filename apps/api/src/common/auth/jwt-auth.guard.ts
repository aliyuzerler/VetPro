import { Inject, Injectable, type CanActivate, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from './token.service';
import { IS_PUBLIC_KEY } from './decorators';
import type { AuthContext, AuthRequest } from './auth-context';

/**
 * Global kimlik doğrulama guard'ı. @Public() işaretli uçlar hariç tüm isteklerde:
 * 1) Bearer token doğrulanır (HS256 JWT),
 * 2) Personel, roller, izinler, şubeler veritabanından TAZE yüklenir,
 * 3) Oturum iptal/süre kontrolü yapılır (refresh rotasyonu anında geçerli olur).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthRequest & { headers: Record<string, string | string[] | undefined> }>();
    const headerValue = request.headers.authorization;
    const header = typeof headerValue === 'string' ? headerValue : undefined;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Kimlik doğrulaması gerekli');
    }
    const token = header.slice('Bearer '.length).trim();
    const payload = await this.tokens.verifyAccessToken(token);
    if (!payload) {
      throw new UnauthorizedException('Oturum geçersiz veya süresi doldu');
    }

    const [staff, session] = await Promise.all([
      this.prisma.staff.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          clinicId: true,
          active: true,
          staffRoles: { select: { role: { select: { allBranches: true, rolePermissions: { select: { permissionKey: true } } } } } },
          staffBranches: { select: { branchId: true } },
        },
      }),
      this.prisma.session.findUnique({
        where: { id: payload.sid },
        select: { id: true, staffId: true, branchId: true, revokedAt: true, expiresAt: true },
      }),
    ]);

    if (!staff || !staff.active || staff.clinicId !== payload.cid) {
      throw new UnauthorizedException('Oturum geçersiz veya süresi doldu');
    }
    if (!session || session.staffId !== staff.id || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Oturum kapatıldı; yeniden giriş yapın');
    }

    const roleViews = staff.staffRoles.map((staffRole) => staffRole.role);
    const permissions = [...new Set(roleViews.flatMap((role) => role.rolePermissions.map((rp) => rp.permissionKey)))];
    const auth: AuthContext = {
      staffId: staff.id,
      clinicId: staff.clinicId,
      sessionId: session.id,
      activeBranchId: session.branchId,
      allBranches: roleViews.some((role) => role.allBranches),
      branchIds: staff.staffBranches.map((sb) => sb.branchId),
      permissions,
    };
    request.auth = auth;
    return true;
  }
}
