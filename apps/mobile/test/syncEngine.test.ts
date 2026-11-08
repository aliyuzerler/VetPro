/**
 * Faz 13 — mobil senkronizasyon motoru birim testleri.
 * Test promptu kabul kriterlerinin mobil tarafı (in-memory storage + sahte API
 * ile gerçek SyncEngine mantığı):
 *  1. Çevrimdışı taslak + fotoğraf metadata'sı kaybolmaz.
 *  2. Uygulama kapanıp açılınca queued taslak kalır (restart recovery).
 *  3. Reconnect sonrası accepted işlem sunucu ID/version ile sync edilir.
 *  4. Aynı outbox item yeniden gönderilince duplicate — çift uygulanmaz.
 *  5. Çakışmada iki versiyon korunur; sessiz overwrite yok.
 *  6. Finalize/finance/stock istemcide de reddedilir — offline posted görünmez.
 *  7. Ağ hatasında retry/backoff; MAX_ATTEMPTS'te durur.
 *  8. Pull delta cache'e yazılır ve imleç saklanır.
 *  9-11. API istemcisi 401'de sessiz refresh; revoke'ta oturum temizlenir.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createInMemoryStorage } from '../src/lib/db/inMemoryStorage';
import type { StoragePorts } from '../src/lib/db/ports';
import {
  SyncEngine,
  SyncKindNotAllowedError,
  backoffFor,
  MAX_ATTEMPTS,
} from '../src/lib/sync/engine';
import { createMobileApi, MobileApiError } from '../src/lib/api';
import {
  InMemorySessionStore,
  type MobileSession,
} from '../src/lib/auth/session';

type PushResponse = {
  results: {
    clientOperationId: string;
    status: 'accepted' | 'duplicate' | 'conflict' | 'rejected';
    code?: string;
    message?: string;
    result?: { serverId: string; version: string; snapshot: Record<string, unknown> };
  }[];
  serverTime: string;
};

/** Sahte senkron API — push çağrılarını kaydeder, scripted yanıt döner. */
function fakeApi(handler: (ops: unknown[]) => PushResponse) {
  const calls: unknown[][] = [];
  return {
    calls,
    syncPush: async (ops: unknown[]): Promise<PushResponse> => {
      calls.push(ops);
      return handler(ops);
    },
    syncPull: async () => ({
      items: [],
      nextCursor: 'cursor-1',
      hasMore: false,
      serverTime: new Date().toISOString(),
    }),
  };
}

function firstOpId(ops: unknown[]): string {
  return (ops as { clientOperationId: string }[])[0]!.clientOperationId;
}

function makeSession(overrides?: Partial<MobileSession>): MobileSession {
  return {
    accessToken: 'token-a',
    refreshToken: 'refresh-a',
    staffId: 's1',
    email: 'vet@klinik.example',
    staffName: 'Ayşe Demir',
    clinicId: 'c1',
    clinicName: 'VetCore',
    activeBranchId: 'b1',
    allBranches: false,
    branchIds: ['b1'],
    branches: [{ id: 'b1', name: 'Merkez', code: 'MRKZ', isDefault: true }],
    ...overrides,
  };
}

let storage: StoragePorts;
let engine: SyncEngine;

beforeEach(() => {
  storage = createInMemoryStorage();
  engine = new SyncEngine(storage, fakeApi(() => ({ results: [], serverTime: '' })), {
    isOnline: () => true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Faz 13 — çevrimdışı kalıcılık', () => {
  it("1. çevrimdışı taslak ve fotoğraf metadata'sı kaybolmaz", async () => {
    const now = Date.now();
    await storage.drafts.upsert({
      localId: 'd1',
      serverId: null,
      serverVersion: null,
      patientId: 'p1',
      patientName: 'Karabaş',
      appointmentId: null,
      chiefComplaint: 'Kusma',
      subjective: null,
      objective: null,
      assessment: null,
      plan: null,
      notes: null,
      vitals: '{"tempC":"39.1"}',
      syncState: 'queued',
      lastOperationId: null,
      updatedAt: now,
      createdAt: now,
    });
    await storage.photos.add({
      localId: 'f1',
      patientId: 'p1',
      encounterId: null,
      uri: 'file:///tmp/foto.jpg',
      fileName: 'lezyon.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      caption: 'sol arka bacak',
      status: 'pending',
      attempts: 0,
      remoteFileId: null,
      createdAt: now,
    });

    // "Yeniden açılış" — aynı storage üzerine yeni motor (gerçek restart simülasyonu).
    const engine2 = new SyncEngine(storage, fakeApi(() => ({ results: [], serverTime: '' })));
    await engine2.recoverOnStartup();

    const drafts = await storage.drafts.list();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.chiefComplaint).toBe('Kusma');
    expect(drafts[0]!.vitals).toContain('39.1');
    const photos = await storage.photos.listPending();
    expect(photos).toHaveLength(1);
    expect(photos[0]!.caption).toBe('sol arka bacak');
  });

  it('2. uygulama kapanıp açılınca queued taslak kalmaya devam eder', async () => {
    const offline = new SyncEngine(storage, fakeApi(() => ({ results: [], serverTime: '' })), {
      isOnline: () => false,
    });
    const opId = await offline.enqueue({
      kind: 'encounter.create_draft',
      entity: 'encounter',
      payload: { patientId: 'p1', chiefComplaint: 'Restart testi' },
    });
    await storage.drafts.upsert({
      localId: 'd1',
      serverId: null,
      serverVersion: null,
      patientId: 'p1',
      patientName: 'Karabaş',
      appointmentId: null,
      chiefComplaint: 'Restart testi',
      subjective: null,
      objective: null,
      assessment: null,
      plan: null,
      notes: null,
      vitals: null,
      syncState: 'queued',
      lastOperationId: opId,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    });

    // Restart: recovery idempotent — queued taslak + işlem korunur.
    const engine2 = new SyncEngine(storage, fakeApi(() => ({ results: [], serverTime: '' })));
    await engine2.recoverOnStartup();
    expect(await storage.outbox.count('queued')).toBe(1);
    expect((await storage.drafts.list())[0]!.patientId).toBe('p1');
    expect((await storage.drafts.list())[0]!.chiefComplaint).toBe('Restart testi');
  });
});

describe('Faz 13 — senkronizasyon', () => {
  it('3. reconnect sonrası accepted işlem sunucu ID/version ile sync edilir', async () => {
    const offline = new SyncEngine(storage, fakeApi(() => ({ results: [], serverTime: '' })), {
      isOnline: () => false,
    });
    const opId = await offline.enqueue({
      kind: 'encounter.create_draft',
      entity: 'encounter',
      payload: { patientId: 'p1', chiefComplaint: 'Reconnect testi' },
    });
    await storage.drafts.upsert({
      localId: 'd1',
      serverId: null,
      serverVersion: null,
      patientId: 'p1',
      patientName: 'Karabaş',
      appointmentId: null,
      chiefComplaint: 'Reconnect testi',
      subjective: null,
      objective: null,
      assessment: null,
      plan: null,
      notes: null,
      vitals: null,
      syncState: 'queued',
      lastOperationId: opId,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    });

    // Bağlantı geri geldi: sunucu kabul etti (serverId + version + snapshot).
    const api = fakeApi((ops) => ({
      results: [
        {
          clientOperationId: firstOpId(ops),
          status: 'accepted',
          result: {
            serverId: 'srv-enc-1',
            version: '1',
            snapshot: {
              id: 'srv-enc-1',
              status: 'draft',
              chiefComplaint: 'Reconnect testi',
              version: 1,
              updatedAt: new Date().toISOString(),
            },
          },
        },
      ],
      serverTime: new Date().toISOString(),
    }));
    const online = new SyncEngine(storage, api);
    const summary = await online.pushNow();

    expect(summary.accepted).toBe(1);
    const draft = await storage.drafts.get('d1');
    expect(draft!.serverId).toBe('srv-enc-1');
    expect(draft!.serverVersion).toBe('1');
    expect(draft!.syncState).toBe('synced');
    // Sunucu snapshot'ı cache'e yazıldı (pull ile aynı şekil).
    const cached = await storage.cache.get('encounter', 'srv-enc-1');
    expect(cached).toBeTruthy();
    expect(cached!.payload['chiefComplaint']).toBe('Reconnect testi');
    expect((await storage.outbox.get(opId))!.status).toBe('accepted');
  });

  it('4. aynı outbox item yeniden gönderilince duplicate — içerik çift uygulanmaz', async () => {
    const opId = await engine.enqueue({
      kind: 'encounter.create_draft',
      entity: 'encounter',
      payload: { patientId: 'p1', chiefComplaint: 'REPLAY' },
    });
    await storage.drafts.upsert({
      localId: 'd1',
      serverId: null,
      serverVersion: null,
      patientId: 'p1',
      patientName: null,
      appointmentId: null,
      chiefComplaint: 'REPLAY',
      subjective: null,
      objective: null,
      assessment: null,
      plan: null,
      notes: null,
      vitals: null,
      syncState: 'queued',
      lastOperationId: opId,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    });

    // Sunucu işlemi uyguladı AMA yanıt kayboldu (ağ kopması): ilk tur ağ hatası
    // döner ve işlem yeniden kuyruğa alınır; ikinci turda sunucu REPLAY döner.
    let call = 0;
    const api = fakeApi((ops) => {
      call += 1;
      if (call === 1) {
        throw new Error('yanıt kayboldu — ağ kopması');
      }
      return {
        results: [
          {
            clientOperationId: firstOpId(ops),
            status: 'duplicate',
            result: {
              serverId: 'srv-enc-1',
              version: '1',
              snapshot: { id: 'srv-enc-1', chiefComplaint: 'REPLAY', version: 1 },
            },
          },
        ],
        serverTime: '',
      };
    });
    const e1 = new SyncEngine(storage, api);
    const firstRun = await e1.pushNow();
    expect(firstRun.networkError).toBe(true);
    expect(call).toBe(1);

    // Backoff beklenmeden tekrar deneme için planlanan zamanı geriye çek.
    await storage.outbox.markStatus(opId, 'queued', { nextAttemptAt: Date.now() - 1000 });
    const e2 = new SyncEngine(storage, api);
    const secondRun = await e2.pushNow();
    expect(secondRun.duplicate).toBe(1);

    expect(call).toBe(2);
    // Sunucu iki kez çağrıldı ama kaynak kayıt tek: cache'te tek encounter,
    // taslak tek ve synced — çift içerik oluşmadı.
    expect(await storage.cache.count('encounter')).toBe(1);
    const drafts = await storage.drafts.list();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.syncState).toBe('synced');
    expect(drafts[0]!.serverId).toBe('srv-enc-1');
  });

  it('5. çakışmada iki versiyon korunur; sessiz overwrite yok', async () => {
    const opId = await engine.enqueue({
      kind: 'encounter.update_draft',
      entity: 'encounter',
      entityId: 'srv-enc-9',
      expectedVersion: '1',
      payload: { plan: 'Cihazdaki plan' },
    });
    await storage.drafts.upsert({
      localId: 'd1',
      serverId: 'srv-enc-9',
      serverVersion: '1',
      patientId: 'p1',
      patientName: null,
      appointmentId: null,
      chiefComplaint: null,
      subjective: null,
      objective: null,
      assessment: null,
      plan: 'Cihazdaki plan',
      notes: null,
      vitals: null,
      syncState: 'queued',
      lastOperationId: opId,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    });

    const api = fakeApi((ops) => ({
      results: [
        {
          clientOperationId: firstOpId(ops),
          status: 'conflict',
          code: 'SYNC_VERSION_CONFLICT',
          result: {
            serverId: 'srv-enc-9',
            version: '3',
            snapshot: { id: 'srv-enc-9', version: 3, plan: "Web'den güncellenmiş plan" },
          },
        },
      ],
      serverTime: '',
    }));
    const e = new SyncEngine(storage, api);
    const summary = await e.pushNow();

    expect(summary.conflict).toBe(1);
    const conflicts = await storage.conflicts.listOpen();
    expect(conflicts).toHaveLength(1);
    // İki versiyon yan yana: yerel payload + sunucu snapshot'ı.
    expect(conflicts[0]!.localPayload['plan']).toBe('Cihazdaki plan');
    expect(conflicts[0]!.serverSnapshot['plan']).toBe("Web'den güncellenmiş plan");
    expect(conflicts[0]!.serverVersion).toBe('3');
    // Taslak sessizce sunucu verisiyle EZİLMEDİ — çakışma durumuna geçti.
    const draft = await storage.drafts.get('d1');
    expect(draft!.plan).toBe('Cihazdaki plan');
    expect(draft!.syncState).toBe('conflict');
    expect((await storage.outbox.get(opId))!.status).toBe('conflict');

    // "Yereli koru" çözümü: sunucu sürümü (v3) temel alınarak yeni işlem kuyruğa girer.
    await storage.conflicts.resolve(conflicts[0]!.id, 'resolved_keep_local');
    await storage.outbox.markStatus(opId, 'queued');
    const e2 = new SyncEngine(
      storage,
      fakeApi((ops) => ({
        results: [
          {
            clientOperationId: firstOpId(ops),
            status: 'accepted',
            result: { serverId: 'srv-enc-9', version: '4', snapshot: { id: 'srv-enc-9', version: 4 } },
          },
        ],
        serverTime: '',
      })),
    );
    const summary2 = await e2.pushNow();
    expect(summary2.accepted).toBe(1);
    const draftAfter = await storage.drafts.get('d1');
    expect(draftAfter!.syncState).toBe('synced');
    expect(draftAfter!.serverVersion).toBe('4');
    // Çakışma kaydı kapandı.
    expect(await storage.conflicts.countOpen()).toBe(0);
  });

  it("6. finalize/finance/stock istemcide de reddedilir — outbox'a girmez", async () => {
    for (const kind of ['service.finalize', 'finance.payment', 'stock.consume', 'encounter.sign']) {
      await expect(
        engine.enqueue({ kind: kind as never, entity: 'encounter', payload: {} }),
      ).rejects.toBeInstanceOf(SyncKindNotAllowedError);
    }
    expect(await storage.outbox.count()).toBe(0);
  });

  it("7. ağ hatasında retry/backoff; MAX_ATTEMPTS'te durur", async () => {
    expect(backoffFor(1)).toBe(30_000);
    expect(backoffFor(2)).toBe(120_000);
    expect(backoffFor(3)).toBe(480_000);

    const opId = await engine.enqueue({
      kind: 'appointment.check_in',
      entity: 'appointment',
      entityId: 'apt-1',
      expectedVersion: '100',
      payload: {},
    });
    const api = fakeApi(() => {
      throw new Error('network down');
    });
    const e = new SyncEngine(storage, api);

    // 1. tur: attempts=1, 30 sn sonra tekrar.
    let summary = await e.pushNow();
    expect(summary.networkError).toBe(true);
    let row = await storage.outbox.get(opId);
    expect(row!.status).toBe('queued');
    expect(row!.attempts).toBe(1);
    expect(row!.nextAttemptAt).toBeGreaterThan(Date.now());

    // nextAttemptAt'ı geçmişe çekip MAX_ATTEMPTS'e kadar döngüle.
    for (let i = 2; i <= MAX_ATTEMPTS; i += 1) {
      await storage.outbox.markStatus(opId, 'queued', { nextAttemptAt: Date.now() - 1000 });
      summary = await e.pushNow();
      expect(summary.networkError).toBe(true);
    }
    row = await storage.outbox.get(opId);
    expect(row!.status).toBe('rejected');
    expect(row!.attempts).toBe(MAX_ATTEMPTS);
    expect(row!.lastError).toContain('Ağ hatası');
  });

  it("8. pull delta cache'e yazılır ve imleç saklanır", async () => {
    const api = {
      syncPush: async () => ({ results: [], serverTime: '' }),
      syncPull: async () => ({
        items: [
          {
            entity: 'appointment',
            data: {
              id: 'apt-1',
              status: 'arrived',
              updatedAt: new Date().toISOString(),
              patient: { name: 'Karabaş' },
            },
          },
        ],
        nextCursor: 'cur-2',
        hasMore: false,
        serverTime: '',
      }),
    };
    const e = new SyncEngine(storage, api);
    const summary = await e.pullNow();
    expect(summary.pulled).toBe(1);
    expect(await storage.cache.count('appointment')).toBe(1);
    expect(await storage.meta.get('pullCursor')).toBe('cur-2');
    expect(await storage.meta.get('lastSyncAt')).toBeTruthy();
  });
});

describe('Faz 13 — oturum akışı (login/refresh/revoke)', () => {
  it("9. 401'de sessiz refresh denenir ve istek yenilenir", async () => {
    const store = new InMemorySessionStore();
    await store.save(makeSession());
    let refreshed: { accessToken: string; refreshToken?: string } | null = null;
    let revoked = false;
    // Oturum okuyucu senkron kopya; refresh sonrası App günceller (aynı desen).
    let currentSession: { accessToken: string; refreshToken?: string; branchId?: string } | null = {
      accessToken: 'bayat-token',
      refreshToken: 'refresh-a',
    };

    const api = createMobileApi(
      () => currentSession,
      {
        onSessionRefreshed: (tokens) => {
          refreshed = tokens;
          currentSession = { ...currentSession!, ...tokens };
        },
        onSessionRevoked: () => {
          revoked = true;
        },
      },
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const auth = String(
        (init?.headers as Record<string, string> | undefined)?.['Authorization'] ?? '',
      );
      if (url.includes('/appointments') && !auth.includes('yeni-token')) {
        return new Response(JSON.stringify({ message: 'Oturum geçersiz' }), { status: 401 });
      }
      if (url.endsWith('/auth/refresh')) {
        const body = JSON.parse(String(init?.body)) as { refreshToken: string };
        expect(body.refreshToken).toBe('refresh-a');
        return new Response(
          JSON.stringify({ accessToken: 'yeni-token', refreshToken: 'yeni-refresh' }),
          { status: 200 },
        );
      }
      if (url.includes('/appointments')) {
        return new Response(JSON.stringify([{ id: 'a1' }]), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const rows = await api.todayAppointments();
    expect(rows).toHaveLength(1);
    expect(refreshed).toEqual({ accessToken: 'yeni-token', refreshToken: 'yeni-refresh' });
    expect(revoked).toBe(false);
    expect(currentSession!.accessToken).toBe('yeni-token');
    void store;
  });

  it('10. refresh başarısızsa (revoke) oturum temizlenir ve 401 fırlatılır', async () => {
    const store = new InMemorySessionStore();
    await store.save(makeSession());
    let revoked = false;
    let currentSession: { accessToken: string; refreshToken?: string } | null = {
      accessToken: 'bayat-token',
      refreshToken: 'iptal-edildi',
    };

    const api = createMobileApi(
      () => currentSession,
      {
        onSessionRevoked: () => {
          revoked = true;
        },
      },
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'Oturum bulunamadı' }), { status: 401 });
      }
      return new Response(JSON.stringify({ message: 'Oturum geçersiz' }), { status: 401 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.todayAppointments()).rejects.toBeInstanceOf(MobileApiError);
    expect(revoked).toBe(true);

    // Uygulama akışı: revoke sinyaliyle oturum temizlenir (App.tsx davranışı).
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it('11. oturum deposu kaydet/oku/temizle döngüsü', async () => {
    const store = new InMemorySessionStore();
    expect(await store.load()).toBeNull();
    const session = makeSession({ activeBranchId: null });
    await store.save(session);
    const loaded = await store.load();
    expect(loaded!.staffName).toBe('Ayşe Demir');
    expect(loaded!.branches[0]!.code).toBe('MRKZ');
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});
