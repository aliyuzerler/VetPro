'use client';

/**
 * Kimlikli API istemcisi. Access token localStorage'da tutulur (bilinen kısıt:
 * XSS yüzeyi — Faz 15'te httpOnly cookie + CSRF stratejisine taşınacak).
 * 401 yanıtında tek seferlik sessiz refresh denenir; refresh de 401 dönerse
 * oturum düşer ve 'vetcore:session-expired' olayı yayınlanır.
 */

const ACCESS_KEY = 'vetcore.accessToken';
const REFRESH_KEY = 'vetcore.refreshToken';

export const TOKEN_STORAGE = { ACCESS_KEY, REFRESH_KEY };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  window.localStorage.setItem(ACCESS_KEY, accessToken);
  window.localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens(): void {
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

/** Rota koruması için basit kontrol: token var mı? */
export function hasStoredSession(): boolean {
  return Boolean(getAccessToken() && getRefreshToken());
}

type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

function notifySessionExpired(): void {
  for (const listener of sessionExpiredListeners) listener();
}

/** Refresh token ile yeni çift alır; başarısızsa null döner. */
export async function refreshSession(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      clearTokens();
      return false;
    }
    const body = (await res.json()) as { accessToken: string; refreshToken: string };
    window.localStorage.setItem(ACCESS_KEY, body.accessToken);
    window.localStorage.setItem(REFRESH_KEY, body.refreshToken);
    return true;
  } catch {
    return false;
  }
}

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  branchId?: string | null;
  /** 401'de otomatik refresh denemesini kapatır (refresh çağrısının kendisi için). */
  skipRefresh?: boolean;
};

/** Kimlikli JSON istek — token + aktif şube başlığı taşır, 401'de bir kez yeniler. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, branchId, skipRefresh } = options;
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (branchId) headers['X-Branch-Id'] = branchId;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res = await fetch(`/api/v1${path}`, {
    method,
    headers,
    cache: 'no-store',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401 && !skipRefresh && getRefreshToken()) {
    const refreshed = await refreshSession();
    if (refreshed) {
      const retryHeaders: Record<string, string> = { ...headers };
      retryHeaders.Authorization = `Bearer ${getAccessToken()}`;
      res = await fetch(`/api/v1${path}`, {
        method,
        headers: retryHeaders,
        cache: 'no-store',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } else {
      notifySessionExpired();
      throw new ApiError(401, 'Oturum süresi doldu');
    }
  }

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message: unknown }).message)
        : `İstek başarısız (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}
