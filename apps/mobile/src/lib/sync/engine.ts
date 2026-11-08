/**
 * Faz 13 — mobil senkronizasyon motoru.
 *
 * Sorumluluklar (kabul kriterleriyle eşleşen):
 *  - Outbox: çevrimdışı işlemler client_operation_id ile kuyruğa girer; uygulama
 *    kapansa bile kuyruk SQLite'ta kalır (restart recovery: in_flight → queued).
 *  - Push: sınırlı toplu gönderim; accepted → sunucu ID/sürümüyle cache + taslak
 *    güncellenir; duplicate → replay sonucu uygulanır (çift kayıt oluşmaz);
 *    conflict → yerel ve sunucu versiyonu birlikte çakışma tablosuna yazılır
 *    (sessiz overwrite yok); rejected → kararlı hata koduyla kayıt altında.
 *  - Retry/backoff: 30 sn → 2 dk → 8 dk, 5 denemede durur (kullanıcı görünür).
 *  - Pull: opak imleçle delta; varlıklar cache'e upsert edilir, imleç meta'da.
 *  - Finalize guard: finalize/finance/stock türleri istemcide de reddedilir —
 *    sunucu onayı olmadan posted görünmez; bu işlemler yalnız çevrimiçi uçlarla.
 */
import { randomUUID } from 'node:crypto';
import type { StoragePorts } from '../db/ports';
import type { MobileApi } from '../api';

/** Sunucu beyaz listesinin aynası — finalize/finance/stock bilinçli YOK. */
export const ALLOWED_SYNC_KINDS = [
  'encounter.create_draft',
  'encounter.update_draft',
  'appointment.check_in',
  'appointment.status',
  'appointment.cancel',
] as const;

export type AllowedSyncKind = (typeof ALLOWED_SYNC_KINDS)[number];

export const SYNC_ENGINE_ERROR_CODES = {
  KIND_NOT_ALLOWED: 'SYNC_KIND_NOT_ALLOWED',
  OFFLINE: 'SYNC_OFFLINE',
} as const;

export const BACKOFF_STEPS_MS = [30_000, 120_000, 480_000] as const;
export const MAX_ATTEMPTS = 5;
const PUSH_BATCH_SIZE = 25;

export type SyncPushSummary = {
  attempted: number;
  accepted: number;
  duplicate: number;
  conflict: number;
  rejected: number;
  /** Ağ hatası — işlemler kuyrukta kaldı, backoff planlandı. */
  networkError: boolean;
};

export type SyncPullSummary = {
  pulled: number;
  nextCursor: string | null;
  hasMore: boolean;
  networkError: boolean;
};

export type SyncRunSummary = { push: SyncPushSummary; pull: SyncPullSummary };

export type EnqueueInput = {
  kind: AllowedSyncKind;
  entity: 'encounter' | 'appointment';
  entityId?: string;
  expectedVersion?: string;
  payload: Record<string, unknown>;
};

export class SyncKindNotAllowedError extends Error {
  readonly code = SYNC_ENGINE_ERROR_CODES.KIND_NOT_ALLOWED;
  constructor(kind: string) {
    super(
      `${kind} push'ta desteklenmez — finalize/finans/stok işlemleri yalnız çevrimiçi uçlarla sunucu onaylı yapılır`,
    );
    this.name = 'SyncKindNotAllowedError';
  }
}

export class SyncEngine {
  constructor(
    private readonly stores: StoragePorts,
    private readonly api: Pick<MobileApi, 'syncPush' | 'syncPull'>,
    private readonly opts: {
      now?: () => number;
      isOnline?: () => boolean;
      /** Pull edilen varlıkların cache'e yazılması (testlerde devre dışı bırakılabilir). */
      applyPullToCache?: boolean;
    } = {},
  ) {}

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  private isOnline(): boolean {
    return this.opts.isOnline?.() ?? true;
  }

  // ------------------------------------------------------------ restart recovery

  /** Uygulama açılışı: yarıda kalmış işlemler yeniden kuyruğa alınır. */
  async recoverOnStartup(): Promise<number> {
    return this.stores.outbox.requeueInFlight();
  }

  // ------------------------------------------------------------------- enqueue

  /** Çevrimdışı işlem kuyruğa alınır; finalize/finance/stock burada reddedilir. */
  async enqueue(input: EnqueueInput): Promise<string> {
    if (!(ALLOWED_SYNC_KINDS as readonly string[]).includes(input.kind)) {
      throw new SyncKindNotAllowedError(input.kind);
    }
    const clientOperationId = randomUUID();
    await this.stores.outbox.enqueue({
      clientOperationId,
      kind: input.kind,
      entity: input.entity,
      entityId: input.entityId ?? null,
      expectedVersion: input.expectedVersion ?? '0',
      payload: input.payload,
      status: 'queued',
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      resultJson: null,
      localCreatedAt: new Date(this.now()).toISOString(),
      createdAt: this.now(),
    });
    return clientOperationId;
  }

  // ----------------------------------------------------------------- push faze

  async pushNow(): Promise<SyncPushSummary> {
    const summary: SyncPushSummary = {
      attempted: 0,
      accepted: 0,
      duplicate: 0,
      conflict: 0,
      rejected: 0,
      networkError: false,
    };
    if (!this.isOnline()) {
      summary.networkError = true;
      return summary;
    }

    // Çakışması çözülmüş (yerel tut) işlemler yeniden kuyruğa alınır —
    // kullanıcı "yerelim kalsın" dediğinde versiyon sunucu snapshot'ından alınır.
    await this.requeueResolvedLocal();

    const due = await this.stores.outbox.claimDue(this.now(), PUSH_BATCH_SIZE);
    if (!due.length) return summary;
    summary.attempted = due.length;

    try {
      const response = await this.api.syncPush(
        due.map((op) => ({
          clientOperationId: op.clientOperationId,
          kind: op.kind,
          entity: op.entity as 'encounter' | 'appointment',
          ...(op.entityId ? { entityId: op.entityId } : {}),
          expectedVersion: op.expectedVersion,
          payload: op.payload,
        })),
      );

      for (const result of response.results) {
        const op = due.find((d) => d.clientOperationId === result.clientOperationId);
        if (!op) continue;
        if (result.status === 'accepted' || result.status === 'duplicate') {
          summary[result.status] += 1;
          await this.stores.outbox.markStatus(result.clientOperationId, 'accepted', {
            resultJson: result.result ?? null,
            lastError: null,
          });
          await this.applyAccepted(op, result);
        } else if (result.status === 'conflict') {
          summary.conflict += 1;
          await this.stores.outbox.markStatus(result.clientOperationId, 'conflict', {
            lastError: result.code ?? 'SYNC_VERSION_CONFLICT',
          });
          await this.stores.conflicts.record({
            id: result.clientOperationId,
            kind: op.kind,
            entity: op.entity,
            entityId: op.entityId,
            localPayload: op.payload,
            localVersion: op.expectedVersion,
            serverSnapshot: result.result?.snapshot ?? {},
            serverVersion: result.result?.version ?? '0',
            status: 'open',
            createdAt: this.now(),
            resolvedAt: null,
          });
          await this.markDraftConflict(result.clientOperationId, op);
        } else {
          summary.rejected += 1;
          await this.stores.outbox.markStatus(result.clientOperationId, 'rejected', {
            lastError: `${result.code ?? 'SYNC_REJECTED'}: ${result.message ?? ''}`.trim(),
          });
        }
      }
    } catch {
      // Ağ hatası: in_flight işlemleri geri kuyruğa al ve backoff planla.
      summary.networkError = true;
      for (const op of due) {
        const current = await this.stores.outbox.get(op.clientOperationId);
        const attempts = (current?.attempts ?? 0) + 1;
        const exhausted = attempts >= MAX_ATTEMPTS;
        await this.stores.outbox.markStatus(
          op.clientOperationId,
          exhausted ? 'rejected' : 'queued',
          {
            attempts,
            nextAttemptAt: exhausted ? null : this.now() + backoffFor(attempts),
            lastError: 'Ağ hatası — yeniden denenecek',
          },
        );
      }
    }
    return summary;
  }

  /** Accepted/duplicate sonucunu yerel duruma uygula (cache + taslak eşitleme). */
  private async applyAccepted(
    op: { kind: string; entity: string; entityId: string | null },
    result: {
      clientOperationId: string;
      result?: { serverId: string; version: string; snapshot: Record<string, unknown> };
    },
  ): Promise<void> {
    const payload = result.result;
    if (!payload) return;
    // 1) Snapshot cache'e yazılır (pull ile aynı şekil).
    await this.stores.cache.upsert([
      {
        entity: op.entity,
        id: payload.serverId,
        updatedAt: String(payload.snapshot['updatedAt'] ?? new Date().toISOString()),
        payload: payload.snapshot,
      },
    ]);
    // 2) Taslak eşitleme: son işlem kimliğiyle kesin eşleşme (yanlış taslağa
    //    dokunulmaz). create_draft → server_id/version dolu; update_draft → sürüm ilerler.
    const draft = await this.stores.drafts.findByOperation(result.clientOperationId);
    if (!draft) return;
    if (op.kind === 'encounter.create_draft' && !draft.serverId) {
      await this.stores.drafts.upsert({
        ...draft,
        serverId: payload.serverId,
        serverVersion: payload.version,
        syncState: 'synced',
        updatedAt: this.now(),
      });
    } else if (op.kind === 'encounter.update_draft' && draft.serverId === op.entityId) {
      await this.stores.drafts.upsert({
        ...draft,
        serverVersion: payload.version,
        syncState: 'synced',
        updatedAt: this.now(),
      });
    }
  }

  private async markDraftConflict(
    clientOperationId: string,
    op: { entity: string; entityId: string | null },
  ): Promise<void> {
    if (op.entity !== 'encounter') return;
    const draft = await this.stores.drafts.findByOperation(clientOperationId);
    if (draft) {
      await this.stores.drafts.upsert({ ...draft, syncState: 'conflict', updatedAt: this.now() });
    }
  }

  /** "Yerelim kalsın" çözümü: sunucu sürümü temel alınarak yeni işlem kuyruğa girer. */
  private async requeueResolvedLocal(): Promise<void> {
    const conflicts = await this.stores.conflicts.listAll();
    for (const conflict of conflicts) {
      if (conflict.status !== 'resolved_keep_local') continue;
      const serverVersion = String(conflict.serverSnapshot['version'] ?? conflict.serverVersion);
      await this.enqueue({
        kind: conflict.kind as AllowedSyncKind,
        entity: conflict.entity as 'encounter' | 'appointment',
        ...(conflict.entityId ? { entityId: conflict.entityId } : {}),
        expectedVersion: serverVersion,
        payload: conflict.localPayload,
      });
      await this.stores.conflicts.resolve(conflict.id, 'resolved_keep_local');
    }
  }

  // ----------------------------------------------------------------- pull faze

  async pullNow(): Promise<SyncPullSummary> {
    const summary: SyncPullSummary = {
      pulled: 0,
      nextCursor: null,
      hasMore: false,
      networkError: false,
    };
    if (!this.isOnline()) {
      summary.networkError = true;
      return summary;
    }
    try {
      const cursor = await this.stores.meta.get('pullCursor');
      const response = await this.api.syncPull(cursor ?? undefined);
      summary.pulled = response.items.length;
      summary.nextCursor = response.nextCursor;
      summary.hasMore = response.hasMore;
      if (this.opts.applyPullToCache !== false && response.items.length) {
        await this.stores.cache.upsert(
          response.items.map((item) => ({
            entity: item.entity,
            id: String(item.data['id']),
            updatedAt: String(item.data['updatedAt'] ?? new Date().toISOString()),
            payload: item.data,
          })),
        );
      }
      await this.stores.meta.set('pullCursor', response.nextCursor);
      await this.stores.meta.set('lastSyncAt', new Date(this.now()).toISOString());
    } catch {
      summary.networkError = true;
    }
    return summary;
  }

  /** Tam tur: push + pull. Ekran yenilemeleri ve reconnect tetikleyicisi çağırır. */
  async syncNow(): Promise<SyncRunSummary> {
    const push = await this.pushNow();
    const pull = await this.pullNow();
    return { push, pull };
  }
}

/** 1. deneme sonrası 30 sn, 2. sonrası 2 dk, sonraki 8 dk. */
export function backoffFor(attempts: number): number {
  if (attempts <= 1) return BACKOFF_STEPS_MS[0]!;
  if (attempts === 2) return BACKOFF_STEPS_MS[1]!;
  return BACKOFF_STEPS_MS[2]!;
}
