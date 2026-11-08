import { Type } from 'class-transformer';
import { IsIn, IsObject, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';
import { INTEGRATION_KINDS, INTEGRATION_STATUSES } from './integrations.domain';

export class CreateIntegrationConnectionDto {
  @IsIn(INTEGRATION_KINDS as unknown as string[])
  kind!: string;

  @IsString()
  @MaxLength(80)
  providerName!: string;

  @IsOptional()
  @IsObject()
  /** Secret anahtar adları (password/secret/token/apiKey...) yazım anında reddedilir. */
  config?: Record<string, unknown>;
}

export class UpdateIntegrationConnectionDto {
  @IsOptional()
  @IsIn(INTEGRATION_STATUSES as unknown as string[])
  status?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class SandboxCheckDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(10)
  limit?: number;
}
