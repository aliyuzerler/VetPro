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

export class CreateKennelDto {
  @IsString() @MinLength(2) @MaxLength(20) code!: string;
  @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @IsOptional() @IsIn(['small', 'medium', 'large']) size?: string;
  @IsOptional() @IsString() @MaxLength(200) notes?: string;
}

export class UpdateKennelDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @IsOptional() @IsIn(['small', 'medium', 'large']) size?: string;
  @IsOptional() @IsString() @MaxLength(200) notes?: string;
  @IsOptional() active?: boolean;
}

export class AdmitStayDto {
  @IsUUID() patientId!: string;
  @IsUUID() ownerId!: string;
  @IsUUID() kennelId!: string;
  @IsUUID() veterinarianId!: string;
  @IsString() @MinLength(3) @MaxLength(500) admissionReason!: string;
  @IsOptional() @IsUUID() encounterId?: string;
  @IsOptional() @IsDateString() expectedDischargeAt?: string;
  @IsOptional() @IsDateString() admittedAt?: string;
}

export class TransferStayDto {
  @IsUUID() kennelId!: string;
}

export class DischargeStayDto {
  @IsString() @MinLength(3) @MaxLength(1000) summary!: string;
}

export class ListStaysQueryDto {
  @IsOptional() @IsIn(['active', 'admitted', 'transferred', 'discharged']) window?: string;
  @IsOptional() @IsUUID() patientId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number = 50;
}

export class CreateObservationDto {
  @IsOptional() @IsIn(['vital', 'note']) kind?: string;
  @IsOptional() @IsNumber() tempC?: number;
  @IsOptional() @IsNumber() weightKg?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(400) heartRate?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(200) respRate?: number;
  @IsOptional() @IsString() @MaxLength(120) appetite?: string;
  @IsOptional() @IsString() @MaxLength(120) behavior?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsDateString() observedAt?: string;
}

export class AdministerMedicationDto {
  /** Stok düşümlü ürün sarfı (Faz 08 ortak transaction servisi kullanılır). */
  @IsUUID() productId!: string;
  @IsUUID() warehouseId!: string;
  @IsNumber() @Min(0.001) @Max(100_000) qty!: number;
  @IsOptional() @IsUUID() lotId?: string;
  @IsOptional() @IsString() @MaxLength(80) dose?: string;
  @IsOptional() @IsIn(['oral', 'iv', 'im', 'sc', 'topikal', 'diğer']) route?: string;
  @IsOptional() @IsDateString() administeredAt?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsUUID() idempotencyKey?: string;
}
