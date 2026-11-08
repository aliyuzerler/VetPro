import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS } from './notifications.domain';

/** Bildirim şablonu oluşturma — kanal, kategori ve {{degisken}} gövde. */
export class CreateNotificationTemplateDto {
  @IsString()
  @MaxLength(80)
  code!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsIn(NOTIFICATION_CHANNELS as unknown as string[])
  channel!: string;

  @IsIn(NOTIFICATION_CATEGORIES as unknown as string[])
  category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string | null;

  @IsString()
  @MaxLength(4000)
  body!: string;
}

export class UpdateNotificationTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(NOTIFICATION_CATEGORIES as unknown as string[])
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Kuyruğa bildirim alma — şablonlu veya serbest metin; onay kuralı servis katmanında. */
export class EnqueueNotificationDto {
  @IsIn(NOTIFICATION_CHANNELS as unknown as string[])
  channel!: string;

  @IsUUID()
  ownerId!: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsIn(NOTIFICATION_CATEGORIES as unknown as string[])
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  /** Şablon değişkenleri ({{ownerName}} → değer). Değerler string'e çevrilir. */
  @IsOptional()
  @IsObject()
  vars?: Record<string, unknown>;

  /** Kuyruk tekilleştirme anahtarı — aynı anahtar REPLAY döner (duplicate yok). */
  @IsUUID()
  idempotencyKey!: string;
}

/** Kuyruk işleme tiki — queued kayıtları sağlayıcıya gönderir. */
export class RunNotificationQueueDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit?: number;
}

export class ListNotificationsQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  take?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  skip?: number;
}

export class DeliveryReportQueryDto {
  /** Rapor penceresi (gün) — varsayılan 30. */
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(365)
  sinceDays?: number;
}
