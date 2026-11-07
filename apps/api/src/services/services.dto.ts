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
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const SERVICE_CATEGORIES = [
  'muayene',
  'cerrahi',
  'laboratuvar',
  'aşılama',
  'görüntüleme',
  'diş',
  'bakım',
  'diğer',
] as const;

export const ALLOCATION_POLICIES = ['fifo', 'nearest_expiry', 'manual'] as const;

export class ListServicesQueryDto {
  @IsOptional()
  @IsIn(SERVICE_CATEGORIES)
  category?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  search?: string;
}

export class CreateServiceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsIn(SERVICE_CATEGORIES)
  category!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMin!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(SERVICE_CATEGORIES)
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMin?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;
}

export class CreateServicePriceDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxCode?: string;

  @IsDateString()
  validFrom!: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;
}

export class CreateConsumptionRuleDto {
  /** Faz 08 — kural artık ürüne bağlanır; ürünü olmayan kural plana alınmaz. */
  @IsOptional()
  @IsUUID()
  productId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3, allowNaN: false })
  @Min(0.001)
  @Max(10_000)
  defaultQty!: number;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  unit?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsIn(ALLOCATION_POLICIES)
  allocationPolicy?: string;
}
