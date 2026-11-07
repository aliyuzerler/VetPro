'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, clearTokens, getRefreshToken, onSessionExpired, refreshSession, setTokens, TOKEN_STORAGE } from '@/lib/api-client';

export type MePayload = {
  staff: { id: string; email: string; firstName: string; lastName: string; fullName: string; title: string | null };
  roles: { key: string; name: string }[];
  permissions: string[];
  allBranches: boolean;
  branches: { id: string; name: string; code: string; isDefault: boolean }[];
  activeBranch: { id: string; name: string; code: string } | null;
};

type AuthStatus = 'loading' | 'anon' | 'auth';

type AuthContextValue = {
  status: AuthStatus;
  session: MePayload | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchBranch: (branchId: string) => Promise<void>;
  hasPermission: (key: string) => boolean;
  /** Tablo/filtrelerde aktif şube; şube kapsamlı isteklerde X-Branch-Id olarak kullanılır. */
  activeBranchId: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Kimlik sağlayıcı: açılışta mevcut oturumu doğrular (me), 401'de sessiz refresh
 * dener; oturum yoksa anon duruma geçer. (app) kabuğu AuthGate ile korunur.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<MePayload | null>(null);
  const bootstrapped = useRef(false);

  const loadMe = useCallback(async (): Promise<MePayload | null> => {
    try {
      const me = await api<MePayload>('/auth/me');
      setSession(me);
      setStatus('auth');
      return me;
    } catch {
      setSession(null);
      setStatus('anon');
      return null;
    }
  }, []);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    const bootstrap = async () => {
      if (!getRefreshToken() && !window.localStorage.getItem(TOKEN_STORAGE.ACCESS_KEY)) {
        setStatus('anon');
        return;
      }
      await loadMe();
    };
    void bootstrap();
  }, [loadMe]);

  useEffect(() => {
    return onSessionExpired(() => {
      clearTokens();
      setSession(null);
      setStatus('anon');
    });
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const payload = await api<{
        accessToken: string;
        refreshToken: string;
      } & MePayload>('/auth/login', { method: 'POST', body: { email, password }, skipRefresh: true });
      setTokens(payload.accessToken, payload.refreshToken);
      setSession({
        staff: payload.staff,
        roles: payload.roles,
        permissions: payload.permissions,
        allBranches: payload.allBranches,
        branches: payload.branches,
        activeBranch: payload.activeBranch,
      });
      setStatus('auth');
    },
    [],
  );

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) {
        await api('/auth/logout', { method: 'POST', body: { refreshToken }, skipRefresh: true });
      }
    } catch {
      // Çıkışta hata önemsiz — yerel oturum her durumda temizlenir
    }
    clearTokens();
    setSession(null);
    setStatus('anon');
  }, []);

  const switchBranch = useCallback(async (branchId: string) => {
    const activeBranch = await api<MePayload['activeBranch']>('/auth/active-branch', {
      method: 'PATCH',
      body: { branchId },
    });
    setSession((current) => (current ? { ...current, activeBranch } : current));
  }, []);

  const hasPermission = useCallback(
    (key: string) => session?.permissions.includes(key) ?? false,
    [session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      login,
      logout,
      switchBranch,
      hasPermission,
      activeBranchId: session?.activeBranch?.id ?? null,
    }),
    [status, session, login, logout, switchBranch, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth, AuthProvider içinde kullanılmalıdır');
  return value;
}

export { refreshSession };
