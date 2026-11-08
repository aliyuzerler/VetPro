/**
 * Faz 13 — mobil oturum deposu. Access/refresh token'lar expo-secure-store'da
 * (cihaz Keychain/Keystore) tutulur; testlerde bellek uygulaması enjekte edilir.
 * Session revoke: sunucu oturumu iptal ettiğinde (logout ya da reuse-detection)
 * yerel kayıt temizlenir ve uygulama login akışına döner.
 */
export type MobileSession = {
  accessToken: string;
  refreshToken: string;
  staffId: string;
  email: string;
  staffName: string;
  clinicId: string;
  clinicName: string;
  activeBranchId: string | null;
  /** allBranches rolü — BranchSelect ekranı şube listesini serbest gösterir. */
  allBranches: boolean;
  branchIds: string[];
  /** Şube ad/kod bilgisi — BranchSelect ekranı oturumdan görüntüler. */
  branches: { id: string; name: string; code: string; isDefault: boolean }[];
};

export interface SecureSessionStore {
  load(): Promise<MobileSession | null>;
  save(session: MobileSession): Promise<void>;
  clear(): Promise<void>;
}

/** Test/önizleme için bellek uygulaması. */
export class InMemorySessionStore implements SecureSessionStore {
  private session: MobileSession | null = null;
  async load(): Promise<MobileSession | null> {
    return this.session;
  }
  async save(session: MobileSession): Promise<void> {
    this.session = session;
  }
  async clear(): Promise<void> {
    this.session = null;
  }
}

const SECURE_KEY = 'vetcore.session.v1';

/** Cihaz uygulaması — expo-secure-store dinamik import (Node'da yüklenmez). */
export async function openSecureSessionStore(): Promise<SecureSessionStore> {
  const secureStore = await import('expo-secure-store');
  const store = secureStore as unknown as {
    getItemAsync: (key: string) => Promise<string | null>;
    setItemAsync: (key: string, value: string) => Promise<void>;
    deleteItemAsync: (key: string) => Promise<void>;
  };
  return {
    async load(): Promise<MobileSession | null> {
      const raw = await store.getItemAsync(SECURE_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as MobileSession;
      } catch {
        return null;
      }
    },
    async save(session: MobileSession): Promise<void> {
      await store.setItemAsync(SECURE_KEY, JSON.stringify(session));
    },
    async clear(): Promise<void> {
      await store.deleteItemAsync(SECURE_KEY);
    },
  };
}
