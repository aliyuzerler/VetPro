import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './decorators';
import type { AuthRequest } from './auth-context';

/**
 * İzin guard'ı — @RequirePermissions(...) ile işaretli uçlarda bağlamdaki izinlerin
 * tümünü ister. Uç işaretsizse yalnızca kimlik doğrulaması yeterli sayılır.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const auth = request.auth;
    if (!auth) {
      // JwtAuthGuard global kurulur; teorik olarak ulaşılmaz.
      throw new ForbiddenException('Kimlik bağlamı yok');
    }
    const missing = required.filter((permission) => !auth.permissions.includes(permission));
    if (missing.length > 0) {
      throw new ForbiddenException(`Gerekli izin eksik: ${missing.join(', ')}`);
    }
    return true;
  }
}
