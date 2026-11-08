/**
 * Faz 13 — bellek-içi depolama (testler + Node/önizleme ortamı için).
 *
 * SQLite uygulamasıyla birebir aynı StoragePorts sözleşmesini uygular:
 * claimDue in_flight'a geçiren sınırlı toplu çekim, markStatus yamalı güncelleme,
 * restart recovery (in_flight → queued), çakışmada iki versiyonun yan yana
 * korunması. Map ekleme sırasını koruduğu için claim sırası insertion order'dır.
 */
import type {
  CachedRow,
  ConflictRow,
  ConflictStore,
  DraftRow,
  DraftStore,
  OutboxPatch,
  OutboxRow,
  OutboxStatus,
  OutboxStore,
  PhotoRow,
  PhotoStore,
  StoragePorts,
} from './ports';

/** Satırın dışa kopyası — tüketici satırı değiştirerek depoyu bozamaz. */
function clone<T>(row: T): T {
  return structuredClone(row);
}

class InMemoryDraftStore implements DraftStore {
  #rows = new Map<string, DraftRow>();

  async upsert(row: DraftRow): Promise<void> {
    this.#rows.set(row.localId, clone(row));
  }

  async list(): Promise<DraftRow[]> {
    return [...this.#rows.values()].map(clone);
  }

  async get(localId: string): Promise<DraftRow | null> {
    const row = this.#rows.get(localId);
    return row ? clone(row) : null;
  }

  async findByOperation(clientOperationId: string): Promise<DraftRow | null> {
    for (const row of this.#rows.values()) {
      if (row.lastOperationId === clientOperationId) return clone(row);
    }
    return null;
  }
}

class InMemoryPhotoStore implements PhotoStore {
  #rows = new Map<string, PhotoRow>();

  async add(row: PhotoRow): Promise<void> {
    this.#rows.set(row.localId, clone(row));
  }

  async listAll(): Promise<PhotoRow[]> {
    return [...this.#rows.values()].map(clone);
  }

  async listPending(): Promise<PhotoRow[]> {
    return [...this.#rows.values()].filter((r) => r.status === 'pending').map(clone);
  }

  async get(localId: string): Promise<PhotoRow | null> {
    const row = this.#rows.get(localId);
    return row ? clone(row) : null;
  }

  async markStatus(localId: string, status: PhotoRow['status'], remoteFileId?: string): Promise<void> {
    const row = this.#rows.get(localId);
    if (!row) return;
    this.#rows.set(localId, clone({ ...row, status, ...(remoteFileId !== undefined ? { remoteFileId } : {}) }));
  }
}

class InMemoryOutboxStore implements OutboxStore {
  #rows = new Map<string, OutboxRow>();

  async enqueue(row: OutboxRow): Promise<void> {
    this.#rows.set(row.clientOperationId, clone(row));
  }

  async get(clientOperationId: string): Promise<OutboxRow | null> {
    const row = this.#rows.get(clientOperationId);
    return row ? clone(row) : null;
  }

  async count(status?: OutboxStatus): Promise<number> {
    if (!status) return this.#rows.size;
    return [...this.#rows.values()].filter((r) => r.status === status).length;
  }

  async claimDue(now: number, limit: number): Promise<OutboxRow[]> {
    const claimed: OutboxRow[] = [];
    for (const row of this.#rows.values()) {
      if (claimed.length >= limit) break;
      if (row.status !== 'queued') continue;
      if (row.nextAttemptAt !== null && row.nextAttemptAt > now) continue;
      const inFlight: OutboxRow = { ...row, status: 'in_flight' };
      this.#rows.set(row.clientOperationId, clone(inFlight));
      claimed.push(inFlight);
    }
    return claimed;
  }

  async markStatus(clientOperationId: string, status: OutboxStatus, patch?: OutboxPatch): Promise<void> {
    const row = this.#rows.get(clientOperationId);
    if (!row) return;
    this.#rows.set(clientOperationId, clone({ ...row, status, ...patch }));
  }

  async requeueInFlight(): Promise<number> {
    let recovered = 0;
    for (const row of this.#rows.values()) {
      if (row.status !== 'in_flight') continue;
      this.#rows.set(row.clientOperationId, clone({ ...row, status: 'queued', nextAttemptAt: null }));
      recovered += 1;
    }
    return recovered;
  }
}

class InMemoryCacheStore {
  #entities = new Map<string, Map<string, CachedRow>>();

  async upsert(rows: CachedRow[]): Promise<void> {
    for (const row of rows) {
      let entity = this.#entities.get(row.entity);
      if (!entity) {
        entity = new Map<string, CachedRow>();
        this.#entities.set(row.entity, entity);
      }
      entity.set(row.id, clone(row));
    }
  }

  async get(entity: string, id: string): Promise<CachedRow | null> {
    const row = this.#entities.get(entity)?.get(id);
    return row ? clone(row) : null;
  }

  async list(entity: string, predicate?: (payload: Record<string, unknown>) => boolean): Promise<CachedRow[]> {
    const rows = [...(this.#entities.get(entity)?.values() ?? [])];
    return rows.filter((r) => !predicate || predicate(r.payload)).map(clone);
  }

  async count(entity: string): Promise<number> {
    return this.#entities.get(entity)?.size ?? 0;
  }
}

class InMemoryConflictStore implements ConflictStore {
  #rows = new Map<string, ConflictRow>();

  async record(row: ConflictRow): Promise<void> {
    this.#rows.set(row.id, clone(row));
  }

  async listOpen(): Promise<ConflictRow[]> {
    return [...this.#rows.values()].filter((r) => r.status === 'open').map(clone);
  }

  async listAll(): Promise<ConflictRow[]> {
    return [...this.#rows.values()].map(clone);
  }

  async countOpen(): Promise<number> {
    return [...this.#rows.values()].filter((r) => r.status === 'open').length;
  }

  async resolve(id: string, status: Exclude<ConflictRow['status'], 'open'>): Promise<void> {
    const row = this.#rows.get(id);
    if (!row) return;
    this.#rows.set(id, clone({ ...row, status, resolvedAt: Date.now() }));
  }
}

class InMemoryMetaStore {
  #values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.#values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.#values.set(key, value);
  }
}

/** Test/önizleme için bellek-içi StoragePorts — her çağrı boş depo döndürür. */
export function createInMemoryStorage(): StoragePorts {
  return {
    drafts: new InMemoryDraftStore(),
    photos: new InMemoryPhotoStore(),
    outbox: new InMemoryOutboxStore(),
    cache: new InMemoryCacheStore(),
    conflicts: new InMemoryConflictStore(),
    meta: new InMemoryMetaStore(),
  };
}
