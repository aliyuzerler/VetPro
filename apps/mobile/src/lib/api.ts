/**
 * Faz 05 — mobil API istemcisi (dependency-free fetch).
 * Web ile aynı sürümlenmiş sözleşmeyi (Bearer + X-Branch-Id) kullanır (ADR-004).
 * Token kaynağı enjekte edilir: mobil kimlik akışı Faz 13'te SecureStore ile
 * bağlanacak; oturum yoksa ekranlar dürüst "giriş gerekli" durumu gösterir —
 * sahte veri bulunmaz (agents.md kuralı).
 */

export const CLINIC_TIMEZONE_OFFSET_MIN = 180; // Europe/Istanbul — 2016'dan beri sabit UTC+03

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

export function createMobileApi(getSession: () => MobileApiSession | null) {
  async function request<T>(
    path: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const session = getSession();
    if (!session) throw new MobileApiError(401, 'Oturum açılmadı');
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    };
    if (session.branchId) headers['X-Branch-Id'] = session.branchId;
    const res = await fetch(`http://localhost:4000/api/v1${path}`, {
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
  };
}

export type MobileApi = ReturnType<typeof createMobileApi>;
