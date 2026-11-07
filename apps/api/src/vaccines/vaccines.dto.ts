import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { REMINDER_KINDS } from './vaccines.domain';

export class CreateVaccineProtocolDto {
  @IsUUID() productId!: string;
  @IsOptional() @IsUUID() speciesId?: string;
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsInt() @Min(0) @Max(3650) firstDoseAgeDays!: number;
  @IsInt() @Min(1) @Max(3650) boosterIntervalDays!: number;
  @IsInt() @Min(0) @Max(180) reminderLeadDays!: number;
  @IsOptional() @IsString() @MaxLength(40) doseLabel?: string;
  @IsOptional() @IsString() @MaxLength(40) route?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateVaccineProtocolDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsInt() @Min(0) @Max(3650) firstDoseAgeDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(3650) boosterIntervalDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(180) reminderLeadDays?: number;
  @IsOptional() @IsString() @MaxLength(40) doseLabel?: string;
  @IsOptional() @IsString() @MaxLength(40) route?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() active?: boolean;
}

export class CreateVaccineEventDto {
  @IsUUID() patientId!: string;
  @IsUUID() productId!: string;
  @IsUUID() warehouseId!: string;
  @IsUUID() lotId!: string;
  /** 1 doz varsayılan; ambalaj/şişe düşümü için değiştirilebilir. */
  @IsOptional() @IsNumber() @Min(0.001) @Max(1_000_000) qty?: number;
  @IsOptional() @IsUUID() protocolId?: string;
  @IsOptional() @IsUUID() encounterId?: string;
  @IsOptional() @IsDateString() administeredAt?: string;
  @IsOptional() @IsString() @MaxLength(40) doseLabel?: string;
  @IsOptional() @IsString() @MaxLength(40) route?: string;
  @IsOptional() @IsString() @MaxLength(80) site?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsUUID() idempotencyKey?: string;
}

export class ListVaccineEventsQueryDto {
  @IsOptional() @IsUUID() patientId?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number = 50;
}

export class CreateVaccineReminderDto {
  @IsOptional() @IsIn(REMINDER_KINDS) kind?: string;
  /** Vade verilmezse protokol vadesinden (lead düşülerek) türetilir. */
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class SendVaccineReminderDto {
  @IsOptional() @IsIn(['sms', 'email', 'phone']) channel?: string;
}

export class ListRemindersQueryDto {
  /** 'upcoming' | 'overdue' | hepsi — yaklaşan/geciken aşı listeleri. */
  @IsOptional() @IsIn(['upcoming', 'overdue', 'scheduled', 'sent', 'dismissed']) window?: string;
  @IsOptional() @IsUUID() patientId?: string;
  /** Yaklaşan pencere genişliği (gün) — varsayılan 30. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) horizonDays?: number = 30;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number = 100;
}
