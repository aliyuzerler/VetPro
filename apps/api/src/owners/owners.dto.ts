import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const CONTACT_KINDS = ['phone', 'email'] as const;
export const CONSENT_KINDS = ['kvkk', 'sms', 'email', 'whatsapp', 'marketing'] as const;

export class OwnerContactDto {
  @ApiProperty({ enum: CONTACT_KINDS, example: 'phone' })
  @IsIn(CONTACT_KINDS)
  kind!: (typeof CONTACT_KINDS)[number];

  @ApiProperty({ example: '+90 532 111 22 33' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  value!: string;

  @ApiProperty({ required: false, example: 'Cep' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  label?: string | null;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateOwnerDto {
  @ApiProperty({ example: 'Zeynep' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  firstName!: string;

  @ApiProperty({ example: 'Aksoy' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  lastName!: string;

  @ApiProperty({ required: false, example: '12345678901' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(11)
  identityNo?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @ApiProperty({ type: [OwnerContactDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OwnerContactDto)
  contacts!: OwnerContactDto[];

  /// Rıza haritası: { kvkk: true, sms: false, ... }. Eksik anahtar = false.
  @ApiProperty({ required: false, example: { kvkk: true, sms: true } })
  @IsOptional()
  @IsObject()
  consents?: Record<string, boolean>;
}

export class UpdateOwnerDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  firstName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  lastName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(11)
  identityNo?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @ApiProperty({ required: false, type: [OwnerContactDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OwnerContactDto)
  contacts?: OwnerContactDto[];

  @ApiProperty({ required: false, example: { sms: false } })
  @IsOptional()
  @IsObject()
  consents?: Record<string, boolean>;
}

export class ArchiveOwnerDto {
  @ApiProperty({ example: 'Mükerrer kayıt — Zeynep Aksoy birleştirildi' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class MergeOwnerDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  intoOwnerId!: string;

  @ApiProperty({ example: 'Aynı kişi, çift kayıt' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}
