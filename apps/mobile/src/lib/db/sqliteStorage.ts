/**
 * Faz 13 — cihaz depolaması (expo-sqlite).
 *
 * Uygulama açılışında çağrılır (App.tsx > openStorage). Native SQLite yoksa
 * (Node/önizleme/test) import veya açılış hatası fırlatır; çağıran taraf
 * createInMemoryStorage'a düşer. Şema birebir StoragePorts sözleşmesidir:
 * çevrimdışı taslak, fotoğraf metadata kuyruğu, outbox (restart recovery),
 * sunucu önbelleği, çakışma defteri ve meta anahtarları kalıcıdır.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  CachedRow,
  ConflictRow,
  ConflictStore,
  DraftRow,
  DraftStore,
  OutboxPatch,
  OutboxResult,
  OutboxRow,
  OutboxStatus,
  OutboxStore,
  PhotoRow,
  PhotoStore,
  StoragePorts,
} from './ports';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS drafts (
  local_id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT,
  server_version TEXT,
  patient_id TEXT NOT NULL,
  patient_name TEXT,
  appointment_id TEXT,
  chief_complaint TEXT,
  subjective TEXT,
  objective TEXT,
  assessment TEXT,
  plan TEXT,
  notes TEXT,
  vitals TEXT,
  sync_state TEXT NOT NULL,
  last_operation_id TEXT,
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS photos (
  local_id TEXT PRIMARY KEY NOT NULL,
  patient_id TEXT,
  encounter_id TEXT,
  uri TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  caption TEXT,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  remote_file_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS outbox (
  client_operation_id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  expected_version TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  next_attempt_at INTEGER,
  last_error TEXT,
  result_json TEXT,
  local_created_at TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cache_rows (
  entity TEXT NOT NULL,
  id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (entity, id)
);
CREATE TABLE IF NOT EXISTS conflicts (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  local_payload TEXT NOT NULL,
  local_version TEXT NOT NULL,
  server_snapshot TEXT NOT NULL,
  server_version TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

function toDraft(row: Record<string, unknown>): DraftRow {
  return {
    localId: String(row['local_id']),
    serverId: (row['server_id'] as string | null) ?? null,
    serverVersion: (row['server_version'] as string | null) ?? null,
    patientId: String(row['patient_id']),
    patientName: (row['patient_name'] as string | null) ?? null,
    appointmentId: (row['appointment_id'] as string | null) ?? null,
    chiefComplaint: (row['chief_complaint'] as string | null) ?? null,
    subjective: (row['subjective'] as string | null) ?? null,
    objective: (row['objective'] as string | null) ?? null,
    assessment: (row['assessment'] as string | null) ?? null,
    plan: (row['plan'] as string | null) ?? null,
    notes: (row['notes'] as string | null) ?? null,
    vitals: (row['vitals'] as string | null) ?? null,
    syncState: String(row['sync_state']) as DraftRow['syncState'],
    lastOperationId: (row['last_operation_id'] as string | null) ?? null,
    updatedAt: Number(row['updated_at']),
    createdAt: Number(row['created_at']),
  };
}

function toPhoto(row: Record<string, unknown>): PhotoRow {
  return {
    localId: String(row['local_id']),
    patientId: (row['patient_id'] as string | null) ?? null,
    encounterId: (row['encounter_id'] as string | null) ?? null,
    uri: String(row['uri']),
    fileName: String(row['file_name']),
    mimeType: String(row['mime_type']),
    sizeBytes: Number(row['size_bytes']),
    caption: (row['caption'] as string | null) ?? null,
    status: String(row['status']) as PhotoRow['status'],
    attempts: Number(row['attempts']),
    remoteFileId: (row['remote_file_id'] as string | null) ?? null,
    createdAt: Number(row['created_at']),
  };
}

function toOutbox(row: Record<string, unknown>): OutboxRow {
  return {
    clientOperationId: String(row['client_operation_id']),
    kind: String(row['kind']),
    entity: String(row['entity']),
    entityId: (row['entity_id'] as string | null) ?? null,
    expectedVersion: String(row['expected_version']),
    payload: JSON.parse(String(row['payload'])) as Record<string, unknown>,
    status: String(row['status']) as OutboxRow['status'],
    attempts: Number(row['attempts']),
    nextAttemptAt: row['next_attempt_at'] === null || row['next_attempt_at'] === undefined
      ? null
      : Number(row['next_attempt_at']),
    lastError: (row['last_error'] as string | null) ?? null,
    resultJson: row['result_json'] === null || row['result_json'] === undefined
      ? null
      : (JSON.parse(String(row['result_json'])) as OutboxResult),
    localCreatedAt: String(row['local_created_at']),
    createdAt: Number(row['created_at']),
  };
}

function toConflict(row: Record<string, unknown>): ConflictRow {
  return {
    id: String(row['id']),
    kind: String(row['kind']),
    entity: String(row['entity']),
    entityId: (row['entity_id'] as string | null) ?? null,
    localPayload: JSON.parse(String(row['local_payload'])) as Record<string, unknown>,
    localVersion: String(row['local_version']),
    serverSnapshot: JSON.parse(String(row['server_snapshot'])) as Record<string, unknown>,
    serverVersion: String(row['server_version']),
    status: String(row['status']) as ConflictRow['status'],
    createdAt: Number(row['created_at']),
    resolvedAt: row['resolved_at'] === null || row['resolved_at'] === undefined
      ? null
      : Number(row['resolved_at']),
  };
}

class SqliteDraftStore implements DraftStore {
  constructor(private readonly db: SQLiteDatabase) {}

  async upsert(row: DraftRow): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO drafts (local_id, server_id, server_version, patient_id, patient_name, appointment_id,
        chief_complaint, subjective, objective, assessment, plan, notes, vitals, sync_state,
        last_operation_id, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(local_id) DO UPDATE SET
        server_id=excluded.server_id, server_version=excluded.server_version, patient_id=excluded.patient_id,
        patient_name=excluded.patient_name, appointment_id=excluded.appointment_id,
        chief_complaint=excluded.chief_complaint, subjective=excluded.subjective, objective=excluded.objective,
        assessment=excluded.assessment, plan=excluded.plan, notes=excluded.notes, vitals=excluded.vitals,
        sync_state=excluded.sync_state, last_operation_id=excluded.last_operation_id, updated_at=excluded.updated_at`,
      [
        row.localId,
        row.serverId,
        row.serverVersion,
        row.patientId,
        row.patientName,
        row.appointmentId,
        row.chiefComplaint,
        row.subjective,
        row.objective,
        row.assessment,
        row.plan,
        row.notes,
        row.vitals,
        row.syncState,
        row.lastOperationId,
        row.updatedAt,
        row.createdAt,
      ],
    );
  }

  async list(): Promise<DraftRow[]> {
    const rows = await this.db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM drafts ORDER BY updated_at DESC, created_at DESC',
    );
    return rows.map(toDraft);
  }

  async get(localId: string): Promise<DraftRow | null> {
    const row = await this.db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM drafts WHERE local_id = ?',
      [localId],
    );
    return row ? toDraft(row) : null;
  }

  async findByOperation(clientOperationId: string): Promise<DraftRow | null> {
    const row = await this.db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM drafts WHERE last_operation_id = ?',
      [clientOperationId],
    );
    return row ? toDraft(row) : null;
  }
}

class SqlitePhotoStore implements PhotoStore {
  constructor(private readonly db: SQLiteDatabase) {}

  async add(row: PhotoRow): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO photos (local_id, patient_id, encounter_id, uri, file_name, mime_type, size_bytes,
        caption, status, attempts, remote_file_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(local_id) DO UPDATE SET
        patient_id=excluded.patient_id, encounter_id=excluded.encounter_id, uri=excluded.uri,
        file_name=excluded.file_name, mime_type=excluded.mime_type, size_bytes=excluded.size_bytes,
        caption=excluded.caption, status=excluded.status, attempts=excluded.attempts,
        remote_file_id=excluded.remote_file_id`,
      [
        row.localId,
        row.patientId,
        row.encounterId,
        row.uri,
        row.fileName,
        row.mimeType,
        row.sizeBytes,
        row.caption,
        row.status,
        row.attempts,
        row.remoteFileId,
        row.createdAt,
      ],
    );
  }

  async listAll(): Promise<PhotoRow[]> {
    const rows = await this.db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM photos ORDER BY created_at DESC',
    );
    return rows.map(toPhoto);
  }

  async listPending(): Promise<PhotoRow[]> {
    const rows = await this.db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM photos WHERE status = 'pending' ORDER BY created_at ASC",
    );
    return rows.map(toPhoto);
  }

  async get(localId: string): Promise<PhotoRow | null> {
    const row = await this.db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM photos WHERE local_id = ?',
      [localId],
    );
    return row ? toPhoto(row) : null;
  }

  async markStatus(localId: string, status: PhotoRow['status'], remoteFileId?: string): Promise<void> {
    if (remoteFileId !== undefined) {
      await this.db.runAsync('UPDATE photos SET status = ?, remote_file_id = ? WHERE local_id = ?', [
        status,
        remoteFileId,
        localId,
      ]);
    } else {
      await this.db.runAsync('UPDATE photos SET status = ? WHERE local_id = ?', [status, localId]);
    }
  }
}

class SqliteOutboxStore implements OutboxStore {
  constructor(private readonly db: SQLiteDatabase) {}

  async enqueue(row: OutboxRow): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO outbox (client_operation_id, kind, entity, entity_id, expected_version, payload,
        status, attempts, next_attempt_at, last_error, result_json, local_created_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(client_operation_id) DO UPDATE SET
        kind=excluded.kind, entity=excluded.entity, entity_id=excluded.entity_id,
        expected_version=excluded.expected_version, payload=excluded.payload, status=excluded.status,
        attempts=excluded.attempts, next_attempt_at=excluded.next_attempt_at,
        last_error=excluded.last_error, result_json=excluded.result_json`,
      [
        row.clientOperationId,
        row.kind,
        row.entity,
        row.entityId,
        row.expectedVersion,
        JSON.stringify(row.payload),
        row.status,
        row.attempts,
        row.nextAttemptAt,
        row.lastError,
        row.resultJson ? JSON.stringify(row.resultJson) : null,
        row.localCreatedAt,
        row.createdAt,
      ],
    );
  }

  async get(clientOperationId: string): Promise<OutboxRow | null> {
    const row = await this.db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM outbox WHERE client_operation_id = ?',
      [clientOperationId],
    );
    return row ? toOutbox(row) : null;
  }

  async count(status?: OutboxStatus): Promise<number> {
    if (status) {
      const row = await this.db.getFirstAsync<{ total: number }>(
        'SELECT COUNT(*) AS total FROM outbox WHERE status = ?',
        [status],
      );
      return Number(row?.total ?? 0);
    }
    const row = await this.db.getFirstAsync<{ total: number }>('SELECT COUNT(*) AS total FROM outbox');
    return Number(row?.total ?? 0);
  }

  /** Atomik claim: seçim + in_flight işaretlemesi tek exclusive transaction'da. */
  async claimDue(now: number, limit: number): Promise<OutboxRow[]> {
    let claimed: OutboxRow[] = [];
    await this.db.withExclusiveTransactionAsync(async (txn) => {
      const rows = await txn.getAllAsync<Record<string, unknown>>(
        `SELECT * FROM outbox
         WHERE status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
         ORDER BY created_at ASC LIMIT ?`,
        [now, limit],
      );
      for (const row of rows) {
        await txn.runAsync(
          "UPDATE outbox SET status = 'in_flight' WHERE client_operation_id = ?",
          [String(row['client_operation_id'])],
        );
      }
      claimed = rows.map((row) =>
        toOutbox({ ...row, status: 'in_flight' }),
      );
    });
    return claimed;
  }

  async markStatus(clientOperationId: string, status: OutboxStatus, patch?: OutboxPatch): Promise<void> {
    const sets: string[] = ['status = ?'];
    const params: (string | number | null)[] = [status];
    if (patch?.attempts !== undefined) {
      sets.push('attempts = ?');
      params.push(patch.attempts);
    }
    if (patch?.nextAttemptAt !== undefined) {
      sets.push('next_attempt_at = ?');
      params.push(patch.nextAttemptAt);
    }
    if (patch?.lastError !== undefined) {
      sets.push('last_error = ?');
      params.push(patch.lastError);
    }
    if (patch?.resultJson !== undefined) {
      sets.push('result_json = ?');
      params.push(patch.resultJson ? JSON.stringify(patch.resultJson) : null);
    }
    params.push(clientOperationId);
    await this.db.runAsync(`UPDATE outbox SET ${sets.join(', ')} WHERE client_operation_id = ?`, params);
  }

  async requeueInFlight(): Promise<number> {
    const result = await this.db.runAsync(
      "UPDATE outbox SET status = 'queued', next_attempt_at = NULL WHERE status = 'in_flight'",
    );
    return result.changes;
  }
}

class SqliteCacheStore implements CacheStoreApi {
  constructor(private readonly db: SQLiteDatabase) {}

  async upsert(rows: CachedRow[]): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      for (const row of rows) {
        await this.db.runAsync(
          `INSERT INTO cache_rows (entity, id, updated_at, payload) VALUES (?, ?, ?, ?)
           ON CONFLICT(entity, id) DO UPDATE SET updated_at=excluded.updated_at, payload=excluded.payload`,
          [row.entity, row.id, row.updatedAt, JSON.stringify(row.payload)],
        );
      }
    });
  }

  async get(entity: string, id: string): Promise<CachedRow | null> {
    const row = await this.db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM cache_rows WHERE entity = ? AND id = ?',
      [entity, id],
    );
    return row
      ? {
          entity: String(row['entity']),
          id: String(row['id']),
          updatedAt: String(row['updated_at']),
          payload: JSON.parse(String(row['payload'])) as Record<string, unknown>,
        }
      : null;
  }

  async list(entity: string, predicate?: (payload: Record<string, unknown>) => boolean): Promise<CachedRow[]> {
    const rows = await this.db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM cache_rows WHERE entity = ? ORDER BY updated_at DESC',
      [entity],
    );
    return rows
      .map((row) => ({
        entity: String(row['entity']),
        id: String(row['id']),
        updatedAt: String(row['updated_at']),
        payload: JSON.parse(String(row['payload'])) as Record<string, unknown>,
      }))
      .filter((r) => !predicate || predicate(r.payload));
  }

  async count(entity: string): Promise<number> {
    const row = await this.db.getFirstAsync<{ total: number }>(
      'SELECT COUNT(*) AS total FROM cache_rows WHERE entity = ?',
      [entity],
    );
    return Number(row?.total ?? 0);
  }
}

/** CacheStore adı ile çakışmayı önleyen yerel takma — sözleşme birebir aynıdır. */
type CacheStoreApi = {
  upsert(rows: CachedRow[]): Promise<void>;
  get(entity: string, id: string): Promise<CachedRow | null>;
  list(entity: string, predicate?: (payload: Record<string, unknown>) => boolean): Promise<CachedRow[]>;
  count(entity: string): Promise<number>;
};

class SqliteConflictStore implements ConflictStore {
  constructor(private readonly db: SQLiteDatabase) {}

  async record(row: ConflictRow): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO conflicts (id, kind, entity, entity_id, local_payload, local_version,
        server_snapshot, server_version, status, created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        kind=excluded.kind, entity=excluded.entity, entity_id=excluded.entity_id,
        local_payload=excluded.local_payload, local_version=excluded.local_version,
        server_snapshot=excluded.server_snapshot, server_version=excluded.server_version,
        status=excluded.status, resolved_at=excluded.resolved_at`,
      [
        row.id,
        row.kind,
        row.entity,
        row.entityId,
        JSON.stringify(row.localPayload),
        row.localVersion,
        JSON.stringify(row.serverSnapshot),
        row.serverVersion,
        row.status,
        row.createdAt,
        row.resolvedAt,
      ],
    );
  }

  async listOpen(): Promise<ConflictRow[]> {
    const rows = await this.db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM conflicts WHERE status = 'open' ORDER BY created_at DESC",
    );
    return rows.map(toConflict);
  }

  async listAll(): Promise<ConflictRow[]> {
    const rows = await this.db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM conflicts ORDER BY created_at DESC',
    );
    return rows.map(toConflict);
  }

  async countOpen(): Promise<number> {
    const row = await this.db.getFirstAsync<{ total: number }>(
      "SELECT COUNT(*) AS total FROM conflicts WHERE status = 'open'",
    );
    return Number(row?.total ?? 0);
  }

  async resolve(id: string, status: Exclude<ConflictRow['status'], 'open'>): Promise<void> {
    await this.db.runAsync('UPDATE conflicts SET status = ?, resolved_at = ? WHERE id = ?', [
      status,
      Date.now(),
      id,
    ]);
  }
}

class SqliteMetaStore {
  constructor(private readonly db: SQLiteDatabase) {}

  async get(key: string): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [
      key,
    ]);
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db.runAsync(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      [key, value],
    );
  }
}

/** Cihazda SQLite depolama açar; native modül yoksa hata fırlatır (çağıran bellek-içine düşer). */
export async function openExpoStorage(): Promise<StoragePorts> {
  const { openDatabaseAsync } = await import('expo-sqlite');
  const db = await openDatabaseAsync('vetcore.db');
  await db.execAsync(SCHEMA);
  return {
    drafts: new SqliteDraftStore(db),
    photos: new SqlitePhotoStore(db),
    outbox: new SqliteOutboxStore(db),
    cache: new SqliteCacheStore(db),
    conflicts: new SqliteConflictStore(db),
    meta: new SqliteMetaStore(db),
  };
}
