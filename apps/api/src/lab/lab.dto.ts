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

export class CreateLabTestDto {
  @IsString() @MinLength(2) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsIn(['kan', 'idrar', 'dışkı', 'swab', 'doku', 'diğer']) sampleType!: string;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @IsUUID() speciesId?: string;
  @IsOptional() @IsNumber() refLow?: number;
  @IsOptional() @IsNumber() refHigh?: number;
  @IsOptional() @IsNumber() criticalLow?: number;
  @IsOptional() @IsNumber() criticalHigh?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(720) turnaroundHours?: number;
  @IsOptional() @IsNumber() @Min(0) price?: number;
}

export class UpdateLabTestDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsIn(['kan', 'idrar', 'dışkı', 'swab', 'doku', 'diğer']) sampleType?: string;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @IsUUID() speciesId?: string;
  @IsOptional() @IsNumber() refLow?: number;
  @IsOptional() @IsNumber() refHigh?: number;
  @IsOptional() @IsNumber() criticalLow?: number;
  @IsOptional() @IsNumber() criticalHigh?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(720) turnaroundHours?: number;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() active?: boolean;
}

export class CreateLabOrderDto {
  @IsUUID() patientId!: string;
  @IsUUID() testId!: string;
  /** Sonuç uyarısının gideceği yetkili klinisyen (veteriner). */
  @IsUUID() veterinarianId!: string;
  @IsOptional() @IsUUID() encounterId?: string;
  @IsOptional() @IsIn(['routine', 'urgent']) priority?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ListLabOrdersQueryDto {
  @IsOptional() @IsIn(['ordered', 'sample_collected', 'in_progress', 'completed', 'cancelled'])
  status?: string;
  @IsOptional() @IsUUID() patientId?: string;
  @IsOptional() @IsUUID() encounterId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number = 50;
}

export class CollectSampleDto {
  @IsOptional() @IsIn(['kan', 'idrar', 'dışkı', 'swab', 'doku', 'diğer']) sampleType?: string;
  @IsOptional() @IsDateString() collectedAt?: string;
}

export class RejectSampleDto {
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

export class CreateLabResultDto {
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() @MaxLength(120) valueText?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CancelLabOrderDto {
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

export class ListCriticalResultsQueryDto {
  @IsOptional() @IsIn(['open', 'acknowledged', 'all']) window?: string = 'open';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number = 50;
}
