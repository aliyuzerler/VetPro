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
import { InventoryModule } from './inventory/inventory.module';
import { FinanceModule } from './finance/finance.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { VaccinesModule } from './vaccines/vaccines.module';
import { LabModule } from './lab/lab.module';
import { SurgeriesModule } from './surgeries/surgeries.module';
import { HospitalModule } from './hospital/hospital.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DocumentsModule } from './documents/documents.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { SyncModule } from './sync/sync.module';
import { ReportsModule } from './reports/reports.module';
import { ImportsModule } from './imports/imports.module';
import { BackupModule } from './backup/backup.module';

/**
 * Faz 03: kimlik, personel, rol/izin, şube kapsamı, oturum ve denetim modülleri.
 * Faz 04: tür/ırk kataloğu, hasta sahibi, hasta (şube kapsamlı) ve özel dosya modülleri.
 * Faz 05: randevu, çalışma saati, bekleme listesi ve akış panosu modülleri.
 * Faz 06: hizmet kataloğu ve muayene (SOAP/vital/tanı/ek/addendum/hizmet kaydı) modülleri.
 * Faz 07: ürün/tedarikçi/parti kataloğu ve stok defteri (mal kabul, tüketim, transfer, sayım).
 * Faz 08: hizmet → stok → ücret atomik iş akışı (kesinleştirme, ters kayıt, idempotency).
 * Faz 09: kasa, tahsilat, cari hesap ve giderler (tahsilat dağıtımı, iade, kasa oturumu).
 * Faz 10: reçete (imza/doz onayı/dağıtım/uygulama) ve aşı (protokol/kayıt/takvim/hatırlatma) modülleri.
 * Faz 11: lab, cerrahi ve yatış modülleri (sipariş yaşam döngüsü, kennel, gözlem).
 * Faz 12: bildirimler (şablon/kuyruk/retry), PDF belgeler ve entegrasyon adaptörleri.
 * Faz 13: mobil senkronizasyon (push/pull — outbox defteri, delta imleci, çakışma).
 * Faz 14: raporlar (CSV/XLSX/PDF dışa aktarma), içe aktarma (şablon/önizleme/
 * duplicate çözümü/commit) ve yedekleme (şifreli arşiv + manifest/checksum).
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
    InventoryModule,
    FinanceModule,
    PrescriptionsModule,
    VaccinesModule,
    LabModule,
    SurgeriesModule,
    HospitalModule,
    NotificationsModule,
    DocumentsModule,
    IntegrationsModule,
    SyncModule,
    ReportsModule,
    ImportsModule,
    BackupModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
