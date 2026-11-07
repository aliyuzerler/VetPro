import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { EnvModule } from './config/env.module';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthInfraModule } from './common/auth/auth-infra.module';
import { AuthControllerModule } from './auth/auth.module';
import { AuditControllerModule } from './audit/audit.module';
import { ClinicControllerModule } from './clinic/clinic.module';
import { BranchesControllerModule } from './branches/branches.module';
import { RoomsControllerModule } from './rooms/rooms.module';
import { WarehousesControllerModule } from './warehouses/warehouses.module';
import { StaffControllerModule } from './staff/staff.module';
import { RolesControllerModule } from './roles/roles.module';

/**
 * Faz 03: kimlik, personel, rol/izin, şube kapsamı, oturum ve denetim modülleri.
 * Guard zinciri (global): JwtAuthGuard → PermissionsGuard; şube kapsamlı uçlarda
 * ayrıca BranchScopeGuard devreye girer.
 */
@Module({
  imports: [
    EnvModule,
    PrismaModule,
    HealthModule,
    AuthInfraModule,
    AuthControllerModule,
    AuditControllerModule,
    ClinicControllerModule,
    BranchesControllerModule,
    RoomsControllerModule,
    WarehousesControllerModule,
    StaffControllerModule,
    RolesControllerModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
