/**
 * Faz 13 — mobil depolama portları (hexagonal).
 *
 * Uygulama katmanı (App.tsx, ekranlar, SyncEngine) yalnız bu arayüzleri görür;
 * cihazda SQLite (expo-sqlite), Node/önizleme/testte bellek uygulaması kullanılır.
 * Amaç: çevrimdışı taslaklar, fotoğraf metadata kuyruğu, outbox, sunucu önbelleği
 * ve çakışma kayıtları uygulama kapansa bile cihazda kalıcıdır (restart recovery).
 */

/** Muayene taslağının yerel yaşam döngüsü. */
export type DraftSyncState = 'local_only' | 'draft' | 'queued' | 'synced' | 'conflict' | 'error';

/** Fotoğraf yükleme kuyruğu durumu — sunucu onayı olmadan "done" olamaz. */
export type PhotoStatus = 'pending' | 'uploading' | 'done' | 'failed';

/** Outbox işlem durumu: claim edilen satır in_flight'a geçer (restart recovery queued'a döndürür). */
export type OutboxStatus = 'queued' | 'in_flight' | 'accepted' | 'conflict' | 'rejected';

/** Çakışma çözüm durumu — iki versiyon open iken yan yana korunur. */
export type ConflictStatus = 'open' | 'resolved_keep_local' | 'resolved_keep_server';

/** Çevrimdışı muayene taslağı (SOAP + vital JSON'u metin olarak saklanır). */
export type DraftRow = {
  localId: string;
  serverId: string | null;
  serverVersion: string | null;
  patientId: string;
  patientName: string | null;
  appointmentId: string | null;
  chiefComplaint: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  notes: string | null;
  /** JSON metni — vital bulgular (ör. {"tempC":"39.1"}). */
  vitals: string | null;
  syncState: DraftSyncState;
  /** Bu taslağı üreten son outbox işlemi — accepted sonucuyla kesin eşleme. */
  lastOperationId: string | null;
  updatedAt: number;
  createdAt: number;
};

/** Fotoğraf metadata kaydı — dosyanın kendisi değil, yükleme kuyruğu satırı. */
export type PhotoRow = {
  localId: string;
  patientId: string | null;
  encounterId: string | null;
  uri: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  status: PhotoStatus;
  attempts: number;
  remoteFileId: string | null;
  createdAt: number;
};

/** Sunucu kabul sonucu (accepted/duplicate) — outbox.resultJson'a yazılır. */
export type OutboxResult = {
  serverId: string;
  version: string;
  snapshot: Record<string, unknown>;
};

/** Push kuyruğu satırı — sunucudaki SyncOperation defterinin istemci aynası. */
export type OutboxRow = {
  clientOperationId: string;
  kind: string;
  entity: string;
  entityId: string | null;
  expectedVersion: string;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: number | null;
  lastError: string | null;
  resultJson: OutboxResult | null;
  localCreatedAt: string;
  createdAt: number;
};

/** markStatus ile duruma eşlik eden alanlar (belirtilmeyenler korunur). */
export type OutboxPatch = {
  attempts?: number;
  nextAttemptAt?: number | null;
  lastError?: string | null;
  resultJson?: OutboxResult | null;
};

/** Pull önbelleği satırı — sunucu anlık görüntüsü (push accepted snapshot ile aynı şekil). */
export type CachedRow = {
  entity: string;
  id: string;
  updatedAt: string;
  payload: Record<string, unknown>;
};

/** Çakışma kaydı — yerel payload ile sunucu snapshot'ı birlikte saklanır. */
export type ConflictRow = {
  id: string;
  kind: string;
  entity: string;
  entityId: string | null;
  localPayload: Record<string, unknown>;
  localVersion: string;
  serverSnapshot: Record<string, unknown>;
  serverVersion: string;
  status: ConflictStatus;
  createdAt: number;
  resolvedAt: number | null;
};

export type DraftStore = {
  upsert(row: DraftRow): Promise<void>;
  list(): Promise<DraftRow[]>;
  get(localId: string): Promise<DraftRow | null>;
  findByOperation(clientOperationId: string): Promise<DraftRow | null>;
};

export type PhotoStore = {
  add(row: PhotoRow): Promise<void>;
  listAll(): Promise<PhotoRow[]>;
  listPending(): Promise<PhotoRow[]>;
  get(localId: string): Promise<PhotoRow | null>;
  /** Durum değişimi; remoteFileId yalnız tanımlıysa üzerine yazılır. */
  markStatus(localId: string, status: PhotoStatus, remoteFileId?: string): Promise<void>;
};

export type OutboxStore = {
  enqueue(row: OutboxRow): Promise<void>;
  get(clientOperationId: string): Promise<OutboxRow | null>;
  count(status?: OutboxStatus): Promise<number>;
  /** Vadesi gelen queued satırları in_flight'a geçip döndürür (sınırlı toplu). */
  claimDue(now: number, limit: number): Promise<OutboxRow[]>;
  markStatus(clientOperationId: string, status: OutboxStatus, patch?: OutboxPatch): Promise<void>;
  /** Restart recovery: in_flight → queued; dönen değer kurtarılan satır sayısı. */
  requeueInFlight(): Promise<number>;
};

export type CacheStore = {
  upsert(rows: CachedRow[]): Promise<void>;
  get(entity: string, id: string): Promise<CachedRow | null>;
  list(entity: string, predicate?: (payload: Record<string, unknown>) => boolean): Promise<CachedRow[]>;
  count(entity: string): Promise<number>;
};

export type ConflictStore = {
  record(row: ConflictRow): Promise<void>;
  listOpen(): Promise<ConflictRow[]>;
  listAll(): Promise<ConflictRow[]>;
  countOpen(): Promise<number>;
  resolve(id: string, status: Exclude<ConflictStatus, 'open'>): Promise<void>;
};

export type MetaStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
};

/** Depolama yüzeyi — tüm tüketiciler bu portlar üstünden çalışır. */
export type StoragePorts = {
  drafts: DraftStore;
  photos: PhotoStore;
  outbox: OutboxStore;
  cache: CacheStore;
  conflicts: ConflictStore;
  meta: MetaStore;
};
