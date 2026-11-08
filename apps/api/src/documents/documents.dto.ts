import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { DOCUMENT_KINDS } from './documents.domain';

/** Belge üretim isteği — tür + kaynak kayıt kimliği. */
export class CreatePrintDocumentDto {
  @IsIn(DOCUMENT_KINDS as unknown as string[])
  kind!: string;

  /** Kaynak kayıt: encounter | patient | prescription | owner | labOrder | hospitalStay. */
  @IsUUID()
  refId!: string;
}

export class ListPrintDocumentsQueryDto {
  @IsOptional()
  @IsIn(DOCUMENT_KINDS as unknown as string[])
  kind?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @Type(() => Number)
  @Type(() => Number)
  take?: number;

  @IsOptional()
  @Type(() => Number)
  skip?: number;
}
