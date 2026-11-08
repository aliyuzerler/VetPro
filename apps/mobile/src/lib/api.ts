/**
 * Faz 05→13 — mobil API istemcisi (dependency-free fetch).
 * Web ile aynı sürümlenmiş sözleşmeyi (Bearer + X-Branch-Id) kullanır (ADR-004).
 *
 * Faz 13: kimlik akışı (login/refresh/logout), şube seçimi, hasta arama,
 * aşı hatırlatmaları, stok hızlı sorgu, uygulama içi bildirimler ve senkron
 * uçları (push/pull) eklenir. 401'de tek seferlik sessiz refresh denenir
 * (ADR-015 paraleli); oturum iptal edildiyse onSessionRevoked ile login'e döner.
 * Token kaynağı enjekte edilir; oturum yoksa ekranlar dürüst "giriş gerekli"
 * durumu gösterir — sahte veri bulunmaz (agents.md kuralı).
 */

export const CLINIC_TIMEZONE_OFFSET_MIN = 180; // Europe/Istanbul — 2016'dan beri sabit UTC+03

/** Varsayılan API kökü — cihazda __DEV__ dışında ENV ile geçilir. */
export const API_BASE_URL = 'http://localhost:4000/api/v1';

export type AppointmentStatus =
  | 'scheduled'
  | 'arrived'
  | 'waiting'
  | 'in_consultation'
  | 'completed'
  | 'no_show'
  | 'cancelled';

export type MobileAppointment = {
  id: string;
  status: AppointmentStatus;
  scheduledStart: string;
  scheduledEnd: string;
  notes: string | null;
  overrideReason: string | null;
  checkedInAt: string | null;
  waitingAt: string | null;
  inConsultationAt: string | null;
  completedAt: string | null;
  cancelledReason: string | null;
  patient: { id: string; name: string; code: string; alerts: { kind: string; label: string; severity: string }[] };
  owner: { id: string; firstName: string; lastName: string };
  type: { id: string; name: string; colorKey: string; durationMin: number };
  staff: { id: string; firstName: string; lastName: string; title: string | null };
  room: { id: string; name: string } | null;
  branch: { id: string; name: string; code: string };
};

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Klinik yerel takvim günü — 'YYYY-MM-DD' */
export function todayISO(now: Date = new Date()): string {
  const local = new Date(now.getTime() + CLINIC_TIMEZONE_OFFSET_MIN * 60_000);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

/** Yerel gün başlangıcı UTC instant — API aralık parametresi */
function dayStartISO(dateISO: string): string {
  const [y = 1970, m = 1, d = 1] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0) - CLINIC_TIMEZONE_OFFSET_MIN * 60_000).toISOString();
}

export function timeShort(instant: string): string {
  const local = new Date(new Date(instant).getTime() + CLINIC_TIMEZONE_OFFSET_MIN * 60_000);
  return `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

export type MobileApiSession = {
  accessToken: string;
  branchId?: string;
  /** Sessiz refresh için — yoksa 401 doğrudan onSessionRevoked'a gider. */
  refreshToken?: string;
};

export type MobileApiHooks = {
  /** Refresh başarılı — yeni tokenlar oturum deposuna yazılmalı. */
  onSessionRefreshed?: (tokens: { accessToken: string; refreshToken?: string }) => void;
  /** Oturum iptal/revoke — uygulama login akışına dönmeli. */
  onSessionRevoked?: () => void;
};

export class MobileApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'MobileApiError';
  }
}

export type AuthMeResponse = {
  staff: { id: string; email: string; firstName: string; lastName: string; fullName: string; title: string | null };
  roles: { key: string; name: string }[];
  permissions: string[];
  allBranches: boolean;
  branches: { id: string; name: string; code: string; isDefault: boolean }[];
  activeBranch: { id: string; name: string; code: string } | null;
};

export type MobilePatientSummary = {
  id: string;
  name: string;
  code: string;
  species?: { name: string } | null;
  breed?: { name: string } | null;
  owner?: { id: string; firstName: string; lastName: string } | null;
  alerts?: { kind: string; label: string; severity: string }[];
};

export type MobileReminder = {
  id: string;
  dueAt: string;
  status: string;
  kind: string | null;
  patient: { id: string; name: string } | null;
  owner: { id: string; firstName: string; lastName: string } | null;
  vaccineName?: string | null;
};

export type MobileProduct = {
  id: string;
  name: string;
  code: string;
  categoryName?: string | null;
  stockOnHand?: number | null;
};

export type MobileNotificationRow = {
  id: string;
  kind: string;
  channel: string;
  status: string;
  title: string | null;
  body: string | null;
  createdAt: string;
};

export type SyncPushOp = {
  clientOperationId: string;
  kind: string;
  entity: 'encounter' | 'appointment';
  entityId?: string;
  expectedVersion?: string;
  payload: Record<string, unknown>;
};

export type SyncPushResult = {
  clientOperationId: string;
  status: 'accepted' | 'duplicate' | 'conflict' | 'rejected';
  code?: string;
  message?: string;
  result?: { serverId: string; version: string; snapshot: Record<string, unknown> };
};

export type SyncPushResponse = { results: SyncPushResult[]; serverTime: string };
export type SyncPullResponse = {
  items: { entity: string; data: Record<string, unknown> }[];
  nextCursor: string;
  hasMore: boolean;
  serverTime: string;
};

export function createMobileApi(
  getSession: () => MobileApiSession | null,
  hooks: MobileApiHooks = {},
) {
  async function rawRequest<T>(
    path: string,
    options: { method?: string; body?: unknown; session?: MobileApiSession | null } = {},
  ): Promise<T> {
    const session = options.session ?? getSession();
    if (!session) throw new MobileApiError(401, 'Oturum açılmadı');
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    };
    if (session.branchId) headers['X-Branch-Id'] = session.branchId;
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      throw new MobileApiError(
        res.status,
        body?.message ? String(body.message) : `İstek başarısız (${res.status})`,
        body?.code ? String(body.code) : undefined,
      );
    }
    return data as T;
  }

  async function request<T>(
    path: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    try {
      return await rawRequest<T>(path, options);
    } catch (error) {
      if (error instanceof MobileApiError && error.status === 401) {
        const session = getSession();
        if (session?.refreshToken) {
          try {
            const refreshed = await rawRequest<{ accessToken: string; refreshToken: string }>(
              '/auth/refresh',
              { method: 'POST', body: { refreshToken: session.refreshToken }, session },
            );
            hooks.onSessionRefreshed?.({
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken,
            });
            return await rawRequest<T>(path, {
              ...options,
              session: { ...session, accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken },
            });
          } catch {
            hooks.onSessionRevoked?.();
            throw new MobileApiError(401, 'Oturum süresi doldu; yeniden giriş yapın');
          }
        }
        hooks.onSessionRevoked?.();
      }
      throw error;
    }
  }

  /** Kimlik doğrulamalı olmayan istek (login). */
  async function publicRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: { 'Content-Type': 'application/json' },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      throw new MobileApiError(
        res.status,
        body?.message ? String(body.message) : `İstek başarısız (${res.status})`,
        body?.code ? String(body.code) : undefined,
      );
    }
    return data as T;
  }

  return {
    /** Bugünün randevuları — klinik yerel gün aralığı, UTC instant parametrelerle. */
    async todayAppointments(dateISO: string = todayISO()): Promise<MobileAppointment[]> {
      const from = dayStartISO(dateISO);
      const to = new Date(Date.parse(from) + 24 * 60 * 60_000).toISOString();
      return request<MobileAppointment[]>(
        `/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&includeClosed=true`,
      );
    },
    async checkIn(id: string): Promise<void> {
      await request(`/appointments/${id}/check-in`, { method: 'POST' });
    },
    async changeStatus(
      id: string,
      status: 'waiting' | 'in_consultation' | 'completed' | 'no_show',
    ): Promise<void> {
      await request(`/appointments/${id}/status`, { method: 'POST', body: { status } });
    },
    async cancel(id: string, reason: string): Promise<void> {
      await request(`/appointments/${id}/cancel`, { method: 'POST', body: { reason } });
    },

    // ------------------------------------------------------- kimlik (Faz 13)

    async login(email: string, password: string): Promise<{ accessToken: string; refreshToken: string }> {
      return publicRequest('/auth/login', { method: 'POST', body: { email, password } });
    },
    async me(session: Pick<MobileApiSession, 'accessToken' | 'branchId'>): Promise<AuthMeResponse> {
      return rawRequest('/auth/me', { session: { accessToken: session.accessToken, branchId: session.branchId } });
    },
    async logout(refreshToken: string): Promise<void> {
      await publicRequest('/auth/logout', { method: 'POST', body: { refreshToken } });
    },
    async setActiveBranch(branchId: string): Promise<void> {
      await request('/auth/active-branch', { method: 'PATCH', body: { branchId } });
    },

    // ---------------------------------------------------- klinik veri (Faz 13)

    async patientSearch(search: string): Promise<MobilePatientSummary[]> {
      const res = await request<unknown>(
        `/patients?search=${encodeURIComponent(search)}&take=25`,
      );
      if (Array.isArray(res)) return res as MobilePatientSummary[];
      if (res && typeof res === 'object' && Array.isArray((res as { items?: unknown }).items)) {
        return (res as { items: MobilePatientSummary[] }).items;
      }
      return [];
    },
    async patientSummary(patientId: string): Promise<Record<string, unknown>> {
      return request(`/patients/${patientId}`);
    },
    async vaccineReminders(window: 'overdue' | 'upcoming' = 'upcoming'): Promise<{ items?: MobileReminder[] } | MobileReminder[]> {
      return request(`/vaccines/reminders?window=${window}&horizonDays=30`);
    },
    async productLookup(search: string): Promise<MobileProduct[]> {
      const res = await request<unknown>(`/inventory/products?search=${encodeURIComponent(search)}&take=25`);
      if (Array.isArray(res)) return res as MobileProduct[];
      if (res && typeof res === 'object' && Array.isArray((res as { items?: unknown }).items)) {
        return (res as { items: MobileProduct[] }).items;
      }
      return [];
    },
    async notificationsList(): Promise<MobileNotificationRow[]> {
      const res = await request<unknown>('/notifications?take=50');
      if (Array.isArray(res)) return res as MobileNotificationRow[];
      if (res && typeof res === 'object' && Array.isArray((res as { items?: unknown }).items)) {
        return (res as { items: MobileNotificationRow[] }).items;
      }
      return [];
    },

    // --------------------------------------------------- senkronizasyon (Faz 13)

    async syncPush(operations: SyncPushOp[]): Promise<SyncPushResponse> {
      return request('/sync/push', { method: 'POST', body: { operations } });
    },
    async syncPull(cursor?: string, limit = 100): Promise<SyncPullResponse> {
      const suffix = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
      return request(`/sync/pull?limit=${limit}${suffix}`);
    },
    async syncKinds(): Promise<{ kinds: string[] }> {
      return request('/sync/kinds');
    },
  };
}

export type MobileApi = ReturnType<typeof createMobileApi>;
