import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import { ENCOUNTER_STATUSES, VITAL_KIND_KEYS } from './encounters.domain';

export class ListEncountersQueryDto {
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsIn(ENCOUNTER_STATUSES)
  status?: string;

  @IsOptional()
  @IsUUID()
  veterinarianId?: string;
}

export class CreateEncounterDto {
  @IsUUID()
  patientId!: string;

  @IsUUID()
  veterinarianId!: string;

  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  chiefComplaint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  subjective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  assessment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  plan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateEncounterDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  chiefComplaint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  subjective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  assessment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  plan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  veterinarianId?: string;

  /** Yalnızca draft → in_progress geçişi kabul edilir; imza /sign ucuyla atılır. */
  @IsOptional()
  @IsIn(['in_progress'])
  status?: 'in_progress';
}

export class AddVitalDto {
  @IsIn(VITAL_KIND_KEYS)
  kind!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3, allowNaN: false })
  @Min(0)
  @Max(1_000_000)
  value!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit!: string;

  @IsDateString()
  measuredAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class ListVitalsQueryDto {
  @IsOptional()
  @IsIn(VITAL_KIND_KEYS)
  kind?: string;
}

export class AddDiagnosisDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsIn(['primary', 'secondary', 'differential'])
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateAttachmentDto {
  @IsUUID()
  assetId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class CreateAddendumDto {
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  body!: string;
}

export class ServiceRecordLineInput {
  @IsUUID()
  serviceId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3, allowNaN: false })
  @Min(0.001)
  @Max(10_000)
  qty!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  discount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  tax?: number;
}

export class CreateServiceRecordDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ServiceRecordLineInput)
  lines!: ServiceRecordLineInput[];
}

export class ReplaceServiceRecordLinesDto extends CreateServiceRecordDto {}

/**
 * Faz 08 — kesinleştirmede tüketilecek malzeme satırı. Kullanıcı preview
 * üzerinden gerçek miktarı, depoyu ve partiyi onaylar/düzenler; lot takipli
 * üründe lotId zorunludur (servis katmanında doğulanır).
 */
export class ConsumptionInputDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsUUID()
  lotId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3, allowNaN: false })
  @Min(0.001)
  @Max(1_000_000)
  qty!: number;
}

export class FinalizeServiceRecordDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ConsumptionInputDto)
  /** Boş/eksikse tüketim planı ServiceConsumptionRule'dan otomatik kurulur. */
  consumptions?: ConsumptionInputDto[];

  @IsOptional()
  @IsUUID()
  /** Mobil tekrar denemeleri: aynı anahtarla gelen tekrar duplicate yaratmaz. */
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReverseServiceRecordDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
