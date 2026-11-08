import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
  ValidateIf,
} from 'class-validator';

/**
 * Rapor sorgu DTO'su — Faz 14. Şube ve tarih filtreleri tüm raporlarda ortak;
 * yalnız 'gelir' raporu period parametresi alır (günlük/aylık).
 */
export class ReportQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'dateFrom geçerli bir tarih olmalı (YYYY-MM-DD)' })
  dateFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: 'dateTo geçerli bir tarih olmalı (YYYY-MM-DD)' })
  dateTo?: string;

  @IsOptional()
  @IsIn(['daily', 'monthly'])
  period?: 'daily' | 'monthly';

  @ValidateIf((o: ReportQueryDto) => o.period !== undefined)
  reportKey?: string;
}

export class ExportReportQueryDto extends ReportQueryDto {
  @IsIn(['csv', 'xlsx', 'pdf'])
  format!: 'csv' | 'xlsx' | 'pdf';
}

/** Tarih aralığını [başlangıç 00:00, bitiş+1gün) UTC aralığına çevirir. */
export function resolveDateRange(
  dateFrom?: string,
  dateTo?: string,
): { start: Date; end: Date } {
  const start = dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`) : new Date('1970-01-01T00:00:00.000Z');
  const endExclusive = dateTo
    ? new Date(new Date(`${dateTo}T00:00:00.000Z`).getTime() + 86_400_000)
    : new Date(Date.now() + 86_400_000);
  return { start, end: endExclusive };
}
