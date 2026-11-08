import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ActivateLicenseDto {
  @ApiProperty({ example: 'VETCORE-eyJ2IjoxfQ-…' })
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  licenseKey!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
