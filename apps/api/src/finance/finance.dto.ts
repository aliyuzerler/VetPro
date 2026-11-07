import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
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

export const PAYMENT_METHOD_VALUES = ['cash', 'card', 'transfer', 'other'] as const;
export const EXPENSE_CATEGORIES = [
  'medication',
  'equipment',
  'rent',
  'salary',
  'utility',
  'marketing',
  'maintenance',
  'other',
] as const;

// ── Tahsilat ────────────────────────────────────────────────────────────────

export class PaymentAllocationDto {
  @IsUUID()
  chargeId!: string;

  /** Decimal(12,2) — string olarak taşınır (kuruş kayması yok) */
  @IsString()
  @Length(1, 20)
  amount!: string;
}

export class CreatePaymentDto {
  @IsUUID()
  ownerId!: string;

  @IsIn(PAYMENT_METHOD_VALUES)
  method!: (typeof PAYMENT_METHOD_VALUES)[number];

  @IsString()
  @Length(1, 20)
  amount!: string;

  /** Mobil retry anahtarı — aynı anahtar REPLAY döner */
  @IsOptional()
  @IsString()
  @Length(8, 120)
  idempotencyKey?: string;

  /** Verilirse açık kasa oturumu olmalı (nakit) */
  @IsOptional()
  @IsUUID()
  cashSessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;

  /** Verilmezse otomatik FIFO dağıtım; verilirse toplam tutarı aşamaz */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations?: PaymentAllocationDto[];
}

export class CreateRefundDto {
  @IsIn(PAYMENT_METHOD_VALUES)
  method!: (typeof PAYMENT_METHOD_VALUES)[number];

  @IsString()
  @Length(1, 20)
  amount!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(280)
  reason!: string;

  @IsOptional()
  @IsUUID()
  cashSessionId?: string;
}

export class ListPaymentsQueryDto {
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsIn(PAYMENT_METHOD_VALUES)
  method?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  skip?: number = 0;
}

// ── Ücretler ve cari ────────────────────────────────────────────────────────

export class ListChargesQueryDto {
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsIn(['open', 'partial', 'paid', 'void'])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  skip?: number = 0;
}

export class ListBalancesQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  skip?: number = 0;
}

// ── Kasa ────────────────────────────────────────────────────────────────────

export class CreateRegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @IsUUID()
  branchId!: string;
}

export class OpenSessionDto {
  @IsUUID()
  registerId!: string;

  @IsString()
  @Length(1, 20)
  openingFloat!: string;
}

export class CloseSessionDto {
  @IsString()
  @Length(1, 20)
  countedTotal!: string;

  /** Fark ≠ 0 ise zorunlu (servis + DB CHECK) */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  differenceNote?: string;
}

export class CreateCashMovementDto {
  @IsIn(['manual_in', 'manual_out'])
  sourceType!: 'manual_in' | 'manual_out';

  @IsString()
  @Length(1, 20)
  amount!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(280)
  reason!: string;
}

export class ListSessionsQueryDto {
  @IsOptional()
  @IsUUID()
  registerId?: string;

  @IsOptional()
  @IsIn(['open', 'closed'])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

// ── Gider ve tedarikçi borcu ────────────────────────────────────────────────

export class CreateExpenseDto {
  @IsIn(EXPENSE_CATEGORIES)
  category!: (typeof EXPENSE_CATEGORIES)[number];

  @IsIn(PAYMENT_METHOD_VALUES)
  method!: (typeof PAYMENT_METHOD_VALUES)[number];

  @IsString()
  @Length(1, 20)
  amount!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(280)
  description!: string;

  @IsDateString()
  spentAt!: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  /** Nakit gider için açık oturum; kart/havalede opsiyonel */
  @IsOptional()
  @IsUUID()
  cashSessionId?: string;
}

export class ListExpensesQueryDto {
  @IsOptional()
  @IsIn(EXPENSE_CATEGORIES)
  category?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class CreatePayableDto {
  @IsUUID()
  supplierId!: string;

  @IsString()
  @Length(1, 20)
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  documentNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class PayPayableDto {
  @IsString()
  @Length(1, 20)
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}

export class ListPayablesQueryDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsIn(['open', 'settled', 'void'])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
