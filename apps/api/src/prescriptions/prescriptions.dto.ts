import { Type } from 'class-transformer';
import {
  IsBoolean,
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
import { PRESCRIPTION_FORMS, PRESCRIPTION_ROUTES } from './prescriptions.domain';

export class PrescriptionLineInputDto {
  @IsOptional() @IsUUID() productId?: string;
  @IsString() @MinLength(2) @MaxLength(120) drugName!: string;
  @IsIn(PRESCRIPTION_FORMS) form!: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000) doseAmount?: number;
  @IsOptional() @IsString() @MaxLength(20) doseUnit?: string;
  @IsIn(PRESCRIPTION_ROUTES) route!: string;
  @IsString() @MinLength(2) @MaxLength(120) frequency!: string;
  @IsOptional() @IsInt() @Min(1) @Max(365) durationDays?: number;
  @IsNumber() @Min(0.001) @Max(1_000_000) quantity!: number;
  @IsString() @MinLength(1) @MaxLength(20) quantityUnit!: string;
  @IsOptional() @IsString() @MaxLength(500) instructions?: string;

  /** Doz yardımcısı girdileri — varsa aritmetik öneri üretilir (onay gerekir). */
  @IsOptional() @IsNumber() @Min(0.001) @Max(500) doseCalcWeightKg?: number;
  @IsOptional() @IsNumber() @Min(0.001) @Max(10_000) doseCalcMgPerKg?: number;
  @IsOptional() @IsBoolean() doseApproved?: boolean;
}

export class CreatePrescriptionDto {
  @IsUUID() patientId!: string;
  @IsOptional() @IsUUID() encounterId?: string;
  /** Boşsa oturum personeli reçete yazarı olur. */
  @IsOptional() @IsUUID() veterinarianId?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsString() @MaxLength(80) officialRef?: string;
  @Type(() => PrescriptionLineInputDto)
  @IsOptional()
  lines?: PrescriptionLineInputDto[];
}

export class AddPrescriptionLineDto extends PrescriptionLineInputDto {}

export class ApproveDoseDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class SignPrescriptionDto {
  @IsOptional() @IsString() @MaxLength(80) officialRef?: string;
}

export class VoidPrescriptionDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class DispenseLineDto {
  @IsUUID() lineId!: string;
  @IsUUID() warehouseId!: string;
  @IsNumber() @Min(0.001) @Max(1_000_000) qty!: number;
  /** Verilmezse FEFO otomatik tahsis yapılır. */
  @IsOptional() @IsUUID() lotId?: string;
  /** Mobil tekrar denemelerinde tekilleştirme. */
  @IsOptional() @IsUUID() idempotencyKey?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class AdministerDto {
  @IsUUID() lineId!: string;
  @IsNumber() @Min(0.001) @Max(1_000_000) doseGiven!: number;
  @IsOptional() @IsString() @MaxLength(20) doseUnit?: string;
  @IsOptional() @IsIn(PRESCRIPTION_ROUTES) route?: string;
  @IsOptional() @IsString() @MaxLength(80) site?: string;
  @IsOptional() @IsDateString() administeredAt?: string;
  @IsOptional() @IsUUID() encounterId?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsUUID() idempotencyKey?: string;
}

export class DoseHelperDto {
  @IsNumber() @Min(0.01) @Max(500) weightKg!: number;
  @IsNumber() @Min(0.001) @Max(10_000) mgPerKg!: number;
  @IsOptional() @IsInt() @Min(1) @Max(24) frequencyPerDay?: number;
  @IsOptional() @IsInt() @Min(1) @Max(365) durationDays?: number;
}

export class ListPrescriptionsQueryDto {
  @IsOptional() @IsIn(['draft', 'signed', 'voided']) status?: string;
  @IsOptional() @IsUUID() patientId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number = 50;
}

export class ListAdministrationsQueryDto {
  @IsOptional() @IsUUID() patientId?: string;
  @IsOptional() @IsUUID() prescriptionLineId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number = 50;
}
