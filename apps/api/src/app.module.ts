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
import { SpeciesModule } from './species/species.module';
import { OwnersModule } from './owners/owners.module';
import { PatientsModule } from './patients/patients.module';
import { FilesModule } from './files/files.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { ServicesModule } from './services/services.module';
import { EncountersModule } from './encounters/encounters.module';

/**
 * Faz 03: kimlik, personel, rol/izin, şube kapsamı, oturum ve denetim modülleri.
 * Faz 04: tür/ırk kataloğu, hasta sahibi, hasta (şube kapsamlı) ve özel dosya modülleri.
 * Faz 05: randevu, çalışma saati, bekleme listesi ve akış panosu modülleri.
 * Faz 06: hizmet kataloğu ve muayene (SOAP/vital/tanı/ek/addendum/hizmet kaydı) modülleri.
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
    SpeciesModule,
    OwnersModule,
    PatientsModule,
    FilesModule,
    AppointmentsModule,
    ServicesModule,
    EncountersModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
