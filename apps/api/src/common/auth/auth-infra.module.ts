import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EnvModule } from '../../config/env.module';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';

/**
 * Kimlik altyapısı: parola karma, access token, global guard'lar.
 * JwtAuthGuard → PermissionsGuard sırasıyla zincirlenir (önce kimlik, sonra izin).
 */
@Global()
@Module({
  imports: [EnvModule],
  providers: [
    PasswordService,
    TokenService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [PasswordService, TokenService],
})
export class AuthInfraModule {}
