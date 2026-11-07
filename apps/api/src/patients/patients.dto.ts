import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const PATIENT_GENDERS = ['female', 'male', 'unknown'] as const;
export const ALERT_KINDS = ['allergy', 'chronic', 'warning'] as const;
export const ALERT_SEVERITIES = ['low', 'medium', 'high'] as const;

export class PatientAlertDto {
  @ApiProperty({ enum: ALERT_KINDS, example: 'allergy' })
  @IsIn(ALERT_KINDS)
  kind!: (typeof ALERT_KINDS)[number];

  @ApiProperty({ example: 'Penisilin alerjisi' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  label!: string;

  @ApiProperty({ enum: ALERT_SEVERITIES, required: false, default: 'medium' })
  @IsOptional()
  @IsIn(ALERT_SEVERITIES)
  severity?: (typeof ALERT_SEVERITIES)[number];
}

export class CreatePatientDto {
  @ApiProperty({ example: 'Pamuk' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  speciesId!: string;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  breedId?: string | null;

  @ApiProperty({ enum: PATIENT_GENDERS, required: false, default: 'unknown' })
  @IsOptional()
  @IsIn(PATIENT_GENDERS)
  gender?: (typeof PATIENT_GENDERS)[number];

  @ApiProperty({ required: false, example: '2022-04-10' })
  @IsOptional()
  @IsDateString()
  birthDate?: string | null;

  @ApiProperty({ required: false, example: '985101000000001' })
  @IsOptional()
  @IsString()
  @MinLength(9)
  @MaxLength(20)
  microchip?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  neutered?: boolean;

  @ApiProperty({ required: false, example: 'Gri tekir' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  color?: string | null;

  @ApiProperty({
    required: false,
    format: 'uuid',
    description: 'Kayıt şubesi; varsayılan aktif şube',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ required: false, type: [PatientAlertDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PatientAlertDto)
  alerts?: PatientAlertDto[];

  @ApiProperty({ required: false, example: 4.2, description: 'İlk kilo gözlemi (kg)' })
  @IsOptional()
  @Type(() => Number)
  @Min(0.01)
  @Max(500)
  initialWeightKg?: number;
}

export class UpdatePatientDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  breedId?: string | null;

  @ApiProperty({ required: false, enum: PATIENT_GENDERS })
  @IsOptional()
  @IsIn(PATIENT_GENDERS)
  gender?: (typeof PATIENT_GENDERS)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  birthDate?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(9)
  @MaxLength(20)
  microchip?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  neutered?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  color?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  bloodType?: string | null;
}

export class ArchivePatientDto {
  @ApiProperty({ example: 'Kayıt hatası — mükerrer' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class MergePatientDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  intoPatientId!: string;

  @ApiProperty({ example: 'Çift kayıt' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class CreateAlertDto {
  @ApiProperty({ enum: ALERT_KINDS, example: 'allergy' })
  @IsIn(ALERT_KINDS)
  kind!: (typeof ALERT_KINDS)[number];

  @ApiProperty({ example: 'Vaksinasyon sonrası ödem' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  label!: string;

  @ApiProperty({ enum: ALERT_SEVERITIES, required: false, default: 'medium' })
  @IsOptional()
  @IsIn(ALERT_SEVERITIES)
  severity?: (typeof ALERT_SEVERITIES)[number];
}

export class UpdateAlertDto {
  @ApiProperty({ required: false, example: 'Alerji geçti' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  resolutionNote?: string;
}

export class CreateWeightDto {
  @ApiProperty({ example: 4.35 })
  @Type(() => Number)
  @Min(0.01)
  @Max(500)
  weightKg!: number;

  @ApiProperty({ required: false, example: '2026-10-20T09:00:00Z' })
  @IsOptional()
  @IsDateString()
  measuredAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
}
