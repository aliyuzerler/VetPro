import { SetMetadata, createParamDecorator, type ExecutionContext, type CustomDecorator } from '@nestjs/common';
import type { AuthContext, AuthRequest } from './auth-context';

export const IS_PUBLIC_KEY = 'vetcore:isPublic';
/** Kimlik doğrulaması gerektirmeyen uç (login, refresh, health). */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'vetcore:permissions';
/** Uç için gereken izinler — PermissionsGuard hepsinin sağlanmasını ister. */
export const RequirePermissions = (...permissions: string[]): CustomDecorator<string> =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const BRANCH_SCOPED_KEY = 'vetcore:branchScoped';
/** Şube kapsamlı uç — BranchScopeGuard isteğe şube kimliği çözer/doğrular. */
export const BranchScoped = (): CustomDecorator<string> => SetMetadata(BRANCH_SCOPED_KEY, true);

/** Param dekoratörü: `@CurrentAuth() auth: AuthContext` */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<AuthRequest & { auth?: AuthContext }>();
    if (!request.auth) {
      throw new Error('Kimlik bağlamı bulunamadı — JwtAuthGuard devre dışı mı?');
    }
    return request.auth;
  },
);
