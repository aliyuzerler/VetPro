import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationProviderRegistry } from './providers/notification-providers';

/** Bildirimler — Faz 12 (şablon, onay kuralı, kuyruk, retry/dead-letter, rapor). */
@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationProviderRegistry],
  exports: [NotificationsService],
})
export class NotificationsModule {}
