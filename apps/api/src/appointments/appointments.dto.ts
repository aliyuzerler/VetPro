import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Randevu renk anahtarları — design tokens ile eşleşir. */
export const APPOINTMENT_COLOR_KEYS = ['brand', 'green', 'amber', 'red', 'violet', 'cyan'] as const;

export class CreateAppointmentDto {
  @IsUUID()
  patientId!: string;

  @IsUUID()
  appointmentTypeId!: string;

  @IsUUID()
  staffId!: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  /** Randevu başlangıcı — offset'li ISO 8601 (UTC'ye çevrilerek saklanır). */
  @IsISO8601()
  startAt!: string;

  /** Bitiş; verilmezse randevu türünün varsayılan süresi kullanılır. */
  @IsOptional()
  @IsISO8601()
  endAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** Çalışma saati dışı override — appointment.override izni + zorunlu gerekçe. */
  @IsOptional()
  @IsBoolean()
  allowOutsideHours?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  overrideReason?: string;
}

export class UpdateAppointmentDto {
  @IsOptional()
  @IsUUID()
  appointmentTypeId?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsISO8601()
  startAt?: string;

  @IsOptional()
  @IsISO8601()
  endAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  allowOutsideHours?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  overrideReason?: string;
}

export class AppointmentStatusDto {
  @IsIn(['arrived', 'waiting', 'in_consultation', 'completed', 'no_show'])
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class CancelAppointmentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class ListAppointmentsQueryDto {
  /** Takvim aralığı — ISO 8601 instants (web gün/hafta/ay görünümü hesaplar). */
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  includeClosed?: string;
}

export class FlowboardQueryDto {
  /** Klinik yerel takvim günü: YYYY-MM-DD; yoksa bugün kullanılır. */
  @IsOptional()
  @IsString()
  date?: string;
}

export class CreateAppointmentTypeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  durationMin!: number;

  @IsOptional()
  @IsIn(APPOINTMENT_COLOR_KEYS)
  colorKey?: string;
}

export class UpdateAppointmentTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  durationMin?: number;

  @IsOptional()
  @IsIn(APPOINTMENT_COLOR_KEYS)
  colorKey?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateScheduleBlockDto {
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsIn(['working', 'blocked'])
  kind!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1439)
  startMin!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  endMin!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class UpdateScheduleBlockDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1439)
  startMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  endMin?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateWaitlistDto {
  @IsUUID()
  patientId!: string;

  @IsOptional()
  @IsUUID()
  appointmentTypeId?: string;

  @IsOptional()
  @IsUUID()
  preferredStaffId?: string;

  /** Tercih edilen gün — klinik yerel takvim günü (YYYY-MM-DD). */
  @IsOptional()
  @IsString()
  preferredDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1439)
  preferredStartMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  preferredEndMin?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class UpdateWaitlistDto {
  @IsOptional()
  @IsUUID()
  appointmentTypeId?: string;

  @IsOptional()
  @IsUUID()
  preferredStaffId?: string;

  @IsOptional()
  @IsString()
  preferredDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1439)
  preferredStartMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  preferredEndMin?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class BookWaitlistDto {
  @IsISO8601()
  startAt!: string;

  @IsOptional()
  @IsISO8601()
  endAt?: string;

  /** Yoksa bekleme kaydının tercih ettiği hekim/tür kullanılır. */
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsUUID()
  appointmentTypeId?: string;

  @IsOptional()
  @IsBoolean()
  allowOutsideHours?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  overrideReason?: string;
}
