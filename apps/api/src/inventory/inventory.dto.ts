import { Type } from 'class-transformer';
import {
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
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const PRODUCT_TRACKING_TYPES = ['lot', 'none'] as const;
export const MOVEMENT_KINDS = [
  'goods_receipt',
  'consumption',
  'adjustment',
  'transfer_out',
  'transfer_in',
  'supplier_return',
] as const;
export const TRANSFER_STATUSES = ['draft', 'dispatched', 'received', 'cancelled'] as const;

// ── Ürün kataloğu ───────────────────────────────────────────────────────────

export class ListProductsQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;
}

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  barcode?: string;

  @IsIn(PRODUCT_TRACKING_TYPES)
  trackingType!: string;

  @IsUUID()
  baseUnitId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultSalePrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  barcode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultSalePrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;
}

export class CreateUnitDto {
  @IsString()
  @Length(1, 20)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;
}

export class CreateConversionDto {
  @IsUUID()
  fromUnitId!: string;

  @IsUUID()
  toUnitId!: string;

  /** 1 fromUnit = factor × toUnit */
  @IsNumber()
  @Min(0.000001)
  factor!: number;
}

// ── Tedarikçi ───────────────────────────────────────────────────────────────

export class ListSuppliersQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  search?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;
}

export class CreateSupplierDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(5, 20)
  taxNumber?: string;

  @IsOptional()
  @IsString()
  @Length(5, 20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(5, 20)
  taxNumber?: string;

  @IsOptional()
  @IsString()
  @Length(5, 20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

// ── Stok işlemleri ──────────────────────────────────────────────────────────

export class ReceiptLineDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  lotCode?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsNumber()
  @Min(0.001)
  @Max(1_000_000)
  qty!: number;
}

export class CreateReceiptDto {
  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  lines!: ReceiptLineDto[];
}

export class ConsumptionLineDto {
  @IsUUID()
  productId!: string;

  /** Verilmezse FEFO otomatik tahsis yapılır */
  @IsOptional()
  @IsUUID()
  lotId?: string;

  @IsNumber()
  @Min(0.001)
  @Max(1_000_000)
  qty!: number;
}

export class CreateConsumptionDto {
  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConsumptionLineDto)
  lines!: ConsumptionLineDto[];
}

export class CreateSupplierReturnDto {
  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  supplierId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConsumptionLineDto)
  lines!: ConsumptionLineDto[];
}

export class CreateAdjustmentDto {
  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  lotId?: string;

  /** İşaretli fark: + giriş, − çıkış */
  @IsNumber()
  @Min(-1_000_000)
  @Max(1_000_000)
  qtyDelta!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class ListMovementsQueryDto {
  @IsOptional()
  @IsIn(MOVEMENT_KINDS)
  kind?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}

export class ListBalancesQueryDto {
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  lowStock?: boolean;
}

// ── Transfer ────────────────────────────────────────────────────────────────

export class TransferLineDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  lotId?: string;

  @IsNumber()
  @Min(0.001)
  @Max(1_000_000)
  qty!: number;
}

export class CreateTransferDto {
  @IsUUID()
  fromWarehouseId!: string;

  @IsUUID()
  toWarehouseId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines!: TransferLineDto[];
}

export class ListTransfersQueryDto {
  @IsOptional()
  @IsIn(TRANSFER_STATUSES)
  status?: string;
}

// ── Sayım ───────────────────────────────────────────────────────────────────

export class CreateCountDto {
  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class UpdateCountLinesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CountLineUpdateDto)
  lines!: CountLineUpdateDto[];
}

export class CountLineUpdateDto {
  @IsUUID()
  lineId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  countedQty?: number | null;
}

export class CompleteCountDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class UpdateLotStatusDto {
  @IsIn(['active', 'quarantined'])
  status!: 'active' | 'quarantined';
}

// ── Sıcaklık ────────────────────────────────────────────────────────────────

export class CreateTemperatureLogDto {
  @IsUUID()
  warehouseId!: string;

  @IsNumber()
  @Min(-80)
  @Max(120)
  celsius!: number;

  @IsDateString()
  measuredAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class ListTemperatureQueryDto {
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}
