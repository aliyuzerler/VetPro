/**
 * Faz 13 — mobil senkronizasyon sözleşmesi (docs/API_CONTRACTS.md > Mobile sync):
 * POST /sync/push  → sınırlı toplu işlem; her işlem client_operation_id taşır.
 * GET  /sync/pull  → imleç tabanlı delta; izin kapsamlı varlıklar + yeni imleç.
 * Her işlem sonucu: 'accepted' | 'duplicate' | 'conflict' | 'rejected' +
 * kararlı hata kodu. finalize/finance/stock türleri beyaz listede YOKTUR:
 * çevrimdışı işlem sunucu onayı olmadan asla posted görünmez (kabul kriteri).
 */
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Push'ta izin verilen işlem türleri — finalize/finance/stock bilinçli dışarıda. */
export const SYNC_KINDS = [
  'encounter.create_draft',
  'encounter.update_draft',
  'appointment.check_in',
  'appointment.status',
  'appointment.cancel',
] as const;

export type SyncKind = (typeof SYNC_KINDS)[number];

export class SyncOperationDto {
  /** İstemci üretimi UUIDv4 — REPLAY anahtarı (klinik içinde tekil). */
  @IsUUID()
  clientOperationId!: string;

  /** Beyaz liste servis düzeyinde zorlanır — bilinmeyen kind tüm topluyu
   *  400'e düşürmez, tekil işlem 'rejected' döner (sözleşme: her işlem
   *  accepted/duplicate/conflict/rejected taşır). */
  @IsString()
  @MaxLength(60)
  kind!: string;

  /** Varlık türü kind'tan türetilir; uyumsuzluk serviste reddedilir. */
  @IsString()
  @MaxLength(30)
  entity!: string;

  /** create_draft için yok; güncelleme türlerinde zorunlu hedef varlık. */
  @IsOptional()
  @IsUUID()
  entityId?: string;

  /**
   * İstemcinin gördüğü sürüm, metin olarak kodlanır:
   * encounter → kaydın int version değeri ("3");
   * appointment → updatedAt epoch milisaniyesi ("1731050000123");
   * create_draft → "0". Sunucu sürümü farklıysa CONFLICT + sunucu anlık
   * görüntüsü döner — sessiz overwrite yok (kabul kriteri).
   */
  @IsString()
  @MaxLength(40)
  @IsOptional()
  expectedVersion: string = '0';

  /** Türe göre doğrulanıp beyaz listeyle uygulanır; bilinmeyen alanlar atılır. */
  @IsObject()
  payload!: Record<string, unknown>;
}

export class SyncPushDto {
  /** Sınırlı toplu işlem — tek istekte en çok 50 işlem (sözleşme: bounded). */
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations!: SyncOperationDto[];
}

export class SyncPullQueryDto {
  /** Opak imleç (base64url JSON) — ilk çağrıda yok; yanıtta nextCursor gelir. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 100;
}
