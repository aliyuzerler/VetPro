import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSurgeryCaseDto {
  @IsUUID() patientId!: string;
  @IsUUID() ownerId!: string;
  @IsUUID() veterinarianId!: string;
  @IsString() @MinLength(3) @MaxLength(160) procedure!: string;
  @IsDateString() plannedStart!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(720) plannedDurationMin?: number;
  @IsOptional() @IsUUID() encounterId?: string;
  @IsOptional() @IsUUID() roomId?: string;
  @IsOptional() @IsString() @MaxLength(300) diagnosis?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateSurgeryCaseDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(160) procedure?: string;
  @IsOptional() @IsDateString() plannedStart?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(720) plannedDurationMin?: number;
  @IsOptional() @IsUUID() veterinarianId?: string;
  @IsOptional() @IsUUID() roomId?: string;
  @IsOptional() @IsString() @MaxLength(300) diagnosis?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ListSurgeriesQueryDto {
  @IsOptional() @IsIn(['planned', 'prepped', 'in_surgery', 'recovery', 'completed', 'cancelled'])
  status?: string;
  @IsOptional() @IsUUID() patientId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number = 50;
}

export class UpsertAnesthesiaDto {
  @IsOptional() @IsIn(['I', 'II', 'III', 'IV', 'V']) asaClass?: string;
  @IsOptional() @IsString() @MaxLength(500) premedication?: string;
  @IsOptional() @IsString() @MaxLength(120) inductionAgent?: string;
  @IsOptional() @IsString() @MaxLength(120) maintenanceAgent?: string;
  @IsOptional() @IsString() @MaxLength(500) monitoringNotes?: string;
  @IsOptional() @IsUUID() anesthetistId?: string;
  @IsOptional() @IsDateString() startedAt?: string;
  @IsOptional() @IsDateString() endedAt?: string;
}

export class ToggleChecklistItemDto {
  @IsInt() @Min(0) @Max(50) index!: number;
  @IsBoolean() done!: boolean;
}

export class CancelSurgeryDto {
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}
