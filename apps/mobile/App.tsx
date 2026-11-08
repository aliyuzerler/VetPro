import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { BottomNav, type BottomNavTab } from './src/components/BottomNav';
import { StatusChip } from './src/components/StatusChip';
import { EmptyState } from './src/components/StateViews';
import { TodayAgendaScreen } from './src/screens/TodayAgendaScreen';
import { AppointmentDetailScreen } from './src/screens/AppointmentDetailScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { BranchSelectScreen } from './src/screens/BranchSelectScreen';
import {
  PatientSearchScreen,
  PatientSummaryScreen,
} from './src/screens/PatientScreens';
import { EncounterDraftScreen } from './src/screens/EncounterDraftScreen';
import { MediaScreen } from './src/screens/MediaScreen';
import { SyncCenterScreen } from './src/screens/SyncCenterScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import {
  VaccineRemindersScreen,
  TasksScreen,
  StockLookupScreen,
} from './src/screens/ClinicScreens';
import {
  createMobileApi,
  type AuthMeResponse,
  type MobileApi,
  type MobileApiSession,
  type MobileAppointment,
  type MobilePatientSummary,
} from './src/lib/api';
import {
  openSecureSessionStore,
  type MobileSession,
  type SecureSessionStore,
} from './src/lib/auth/session';
import { openExpoStorage } from './src/lib/db/sqliteStorage';
import { createInMemoryStorage } from './src/lib/db/inMemoryStorage';
import type { StoragePorts, DraftRow } from './src/lib/db/ports';
import { SyncEngine, type SyncEngine as EngineType } from './src/lib/sync/engine';
import { COLORS, RADIUS, SPACING, STATUS, TOUCH_TARGET_MIN, TYPO } from './src/theme/tokens';

/**
 * VetCore mobil — Faz 13: gerçek kimlik akışı, şube seçimi, çevrimdışı
 * muayene taslakları (outbox + SQLite), fotoğraf metadata kuyruğu, aşı
 * hatırlatmaları, görevler, stok hızlı sorgu, uygulama içi bildirimler ve
 * senkron merkezi. design/SCREEN_MAP.md > Mobile hedefleyen tüm ekranlar
 * gerçek API sözleşmesiyle (Bearer + X-Branch-Id) çalışır; sahte veri yoktur.
 *
 * Finalize/finans/stok kesinleşmesi sunucu onaylıdır: çevrimdışı state bunu
 * asla "kesinleşti" göstermez (kabul kriteri).
 */

type Screen =
  | { kind: 'root' }
  | { kind: 'detail'; appointment: MobileAppointment }
  | { kind: 'patient'; patient: MobilePatientSummary }
  | { kind: 'draft'; patient: MobilePatientSummary; appointmentId: string | null }
  | { kind: 'draftResume'; draft: DraftRow }
  | { kind: 'media' }
  | { kind: 'sync' }
  | { kind: 'reminders' }
  | { kind: 'stock' }
  | { kind: 'notifications' };

/** Açılışta storage: cihazda SQLite; Node/önizlemede bellek uygulaması. */
async function openStorage(): Promise<StoragePorts> {
  try {
    return await openExpoStorage();
  } catch {
    return createInMemoryStorage();
  }
}

export default function App() {
  const [tab, setTab] = useState<BottomNavTab>('bugun');
  const [screen, setScreen] = useState<Screen>({ kind: 'root' });
  const [reloadSignal, setReloadSignal] = useState(0);
  const [storage, setStorage] = useState<StoragePorts | null>(null);
  const [session, setSession] = useState<MobileSession | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingBadge, setPendingBadge] = useState(0);
  const sessionStoreRef = useRef<SecureSessionStore | null>(null);
  const insets = useSafeAreaInsets();

  // Depolama + oturum açılışı + çevrimdışı recovery (restart kabulü).
  useEffect(() => {
    void (async () => {
      const stores = await openStorage();
      setStorage(stores);
      const store = await openSecureSessionStore();
      sessionStoreRef.current = store;
      const loaded = await store.load();
      setSession(loaded);
      setSessionReady(true);
      const recovered = await stores.outbox.requeueInFlight();
      if (recovered > 0 && loaded) {
        // Yarıda kalmış işlemler yeniden kuyrukta — sessiz kalma, kullanıcı görsün.
        setPendingBadge(recovered);
      }
      const counts = await stores.outbox.count('queued');
      setPendingBadge(counts);
    })();
  }, []);

  // Bağlantı durumu — NetInfo (Expo Go uyumlu).
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
    return unsubscribe;
  }, []);

  const sessionView = useMemo<MobileApiSession | null>(
    () =>
      session
        ? {
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            ...(session.activeBranchId ? { branchId: session.activeBranchId } : {}),
          }
        : null,
    [session],
  );

  const api = useMemo<MobileApi>(
    () =>
      createMobileApi(
        () => sessionView,
        {
          onSessionRefreshed: (tokens) => {
            if (!session || !sessionStoreRef.current) return;
            const updated: MobileSession = {
              ...session,
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken ?? session.refreshToken,
            };
            setSession(updated);
            void sessionStoreRef.current.save(updated);
          },
          onSessionRevoked: () => {
            setSession(null);
            void sessionStoreRef.current?.clear();
          },
        },
      ),
    // reloadSignal: eylem sonrası ajanda tazelemesi (state ile tetiklenir)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionView, session, reloadSignal],
  );

  const engine = useMemo<EngineType | null>(
    () => (storage && api ? new SyncEngine(storage, api, { isOnline: () => isOnline }) : null),
    [storage, api, isOnline],
  );

  /** Aksiyonlardan sonra: kuyruk sayısını tazele + periyodik senkron. */
  const refreshBadges = useCallback(async (): Promise<void> => {
    if (!storage) return;
    setPendingBadge(await storage.outbox.count('queued'));
  }, [storage]);

  useEffect(() => {
    if (!engine || !session) return;
    void refreshBadges();
  }, [engine, session, refreshBadges]);

  // Bağlantı geri geldiğinde otomatik senkron (reconnect kabulü).
  useEffect(() => {
    if (!engine || !session || !isOnline) return;
    void (async () => {
      const run = await engine.syncNow();
      if (run.push.attempted > 0 || run.pull.pulled > 0) {
        await refreshBadges();
        setReloadSignal((s) => s + 1);
      }
    })();
  }, [engine, session, isOnline, refreshBadges]);

  async function handleAuthenticated(
    tokens: { accessToken: string; refreshToken: string },
    me: AuthMeResponse,
  ): Promise<void> {
    const store = sessionStoreRef.current;
    if (!store) return;
    const newSession: MobileSession = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      staffId: me.staff.id,
      email: me.staff.email,
      staffName: me.staff.fullName,
      clinicId: '', // /auth/me kliniği token üstünden çözer; UI'da gerekmez
      clinicName: 'VetCore',
      activeBranchId: me.branches.length === 1 ? me.branches[0]!.id : null,
      allBranches: me.allBranches,
      branchIds: me.branches.map((b) => b.id),
      branches: me.branches,
    };
    setSession(newSession);
    await store.save(newSession);
    if (newSession.activeBranchId) setTab('bugun');
  }

  async function handleBranchSelect(branch: { id: string; name: string; code: string }): Promise<void> {
    if (!session || !sessionStoreRef.current) return;
    const updated: MobileSession = { ...session, activeBranchId: branch.id };
    setSession(updated);
    await sessionStoreRef.current.save(updated);
    try {
      await api.setActiveBranch(branch.id);
    } catch {
      // Sunucuda aktif şube güncellenemediyse yerel seçim geçerli kalır.
    }
    setScreen({ kind: 'root' });
    setTab('bugun');
  }

  async function handleLogout(): Promise<void> {
    if (!session || !sessionStoreRef.current) return;
    try {
      await api.logout(session.refreshToken);
    } catch {
      // Sunucu erişilemezse yerel oturum yine kapatılır (güvenli varsayım).
    }
    await sessionStoreRef.current.clear();
    setSession(null);
    setScreen({ kind: 'root' });
    setTab('bugun');
  }

  // ----------------------------------------------------------------- auth akışı

  if (!sessionReady || storage === null || engine === null) {
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
        <View style={styles.bootWrap}>
          <Text style={styles.bootText}>VetCore mobil açılıyor…</Text>
        </View>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
        <View style={[styles.authWrap, { paddingTop: Math.max(insets.top, SPACING.md) }]}>
          <LoginScreen api={api} onAuthenticated={(t, me) => void handleAuthenticated(t, me)} />
        </View>
        <View style={{ paddingBottom: Math.max(insets.bottom, SPACING.sm) }} />
      </View>
    );
  }

  if (!session.activeBranchId) {
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
        <View style={[styles.authWrap, { paddingTop: Math.max(insets.top, SPACING.xxl) }]}>
          <BranchSelectScreen me={meFromSession(session)} onSelect={(b) => void handleBranchSelect(b)} />
        </View>
      </View>
    );
  }

  const branchLabel = 'Aktif şube seçili';

  // ----------------------------------------------------------------- ana kabuk

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, SPACING.md) }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.wordmark}>VetCore</Text>
            <Text style={styles.headerSubtitle}>{session.staffName}</Text>
          </View>
          <View style={styles.headerBadges}>
            {!isOnline && <StatusChip tone="warning" label="Çevrimdışı" />}
            {pendingBadge > 0 && <StatusChip tone="info" label={`${pendingBadge} kuyrukta`} />}
            {isOnline && pendingBadge === 0 && <StatusChip tone="success" label="Senkron" />}
          </View>
        </View>
        <Text style={styles.headerNote}>{branchLabel}</Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {screen.kind === 'root' && tab === 'bugun' && (
          <TodayAgendaScreen
            key={`agenda-${reloadSignal}`}
            api={api}
            hasSession
            onOpenAppointment={(appointment) => setScreen({ kind: 'detail', appointment })}
          />
        )}
        {screen.kind === 'root' && tab === 'hastalar' && (
          <PatientSearchScreen
            api={api}
            storage={storage}
            isOnline={isOnline}
            onOpenPatient={(patient) => setScreen({ kind: 'patient', patient })}
          />
        )}
        {screen.kind === 'root' && tab === 'randevular' && (
          <View style={styles.screenInner}>
            <Text style={styles.sectionTitle}>Randevu işlemleri</Text>
            <EmptyState
              title="Detay için Bugün sekmesi"
              description="Check-in ve durum eylemleri randevu detayındadır; Bugün sekmesinden randevuyu açın."
            />
          </View>
        )}
        {screen.kind === 'root' && tab === 'gorevler' && (
          <TasksScreen
            api={api}
            storage={storage}
            isOnline={isOnline}
            onOpenDraft={(draft) => setScreen({ kind: 'draftResume', draft })}
          />
        )}
        {screen.kind === 'root' && tab === 'daha-fazla' && (
          <MoreScreen
            session={session}
            onOpen={(kind) => setScreen(kind)}
            onLogout={() => void handleLogout()}
          />
        )}

        {screen.kind === 'detail' && (
          <AppointmentDetailScreen
            api={api}
            appointment={screen.appointment}
            onBack={() => setScreen({ kind: 'root' })}
            onChanged={() => {
              setScreen({ kind: 'root' });
              setReloadSignal((s) => s + 1);
            }}
          />
        )}
        {screen.kind === 'patient' && (
          <PatientSummaryScreen
            patient={screen.patient}
            onBack={() => setScreen({ kind: 'root' })}
            onOpenDraft={() =>
              setScreen({ kind: 'draft', patient: screen.patient, appointmentId: null })
            }
          />
        )}
        {screen.kind === 'draft' && (
          <EncounterDraftScreen
            storage={storage}
            engine={engine}
            patient={screen.patient}
            appointmentId={screen.appointmentId}
            onBack={() => setScreen({ kind: 'root' })}
            onSynced={() => {
              void refreshBadges();
              setReloadSignal((s) => s + 1);
            }}
          />
        )}
        {screen.kind === 'draftResume' && (
          <EncounterDraftScreen
            storage={storage}
            engine={engine}
            patient={{
              id: screen.draft.patientId,
              name: screen.draft.patientName ?? 'Hasta',
              code: '—',
              alerts: [],
            }}
            appointmentId={screen.draft.appointmentId}
            onBack={() => setScreen({ kind: 'root' })}
            onSynced={() => {
              void refreshBadges();
              setReloadSignal((s) => s + 1);
            }}
          />
        )}
        {screen.kind === 'media' && (
          <MediaScreen
            api={api}
            storage={storage}
            isOnline={isOnline}
            patientId={null}
            onChanged={() => void refreshBadges()}
          />
        )}
        {screen.kind === 'sync' && (
          <SyncCenterScreen
            storage={storage}
            engine={engine}
            isOnline={isOnline}
            onChanged={() => {
              void refreshBadges();
              setReloadSignal((s) => s + 1);
            }}
          />
        )}
        {screen.kind === 'reminders' && <VaccineRemindersScreen api={api} isOnline={isOnline} />}
        {screen.kind === 'stock' && <StockLookupScreen api={api} isOnline={isOnline} />}
        {screen.kind === 'notifications' && <NotificationsScreen api={api} isOnline={isOnline} />}
      </ScrollView>

      {(screen.kind === 'root' || screen.kind === 'detail') && (
        <BottomNav
          active={tab}
          onChange={(next) => {
            setScreen({ kind: 'root' });
            setTab(next);
          }}
        />
      )}
    </View>
  );
}

/** Oturumdan BranchSelect için AuthMeResponse benzeri görünüm üretir. */
function meFromSession(session: MobileSession): AuthMeResponse {
  return {
    staff: {
      id: session.staffId,
      email: session.email,
      firstName: session.staffName.split(' ')[0] ?? '',
      lastName: session.staffName.split(' ').slice(1).join(' '),
      fullName: session.staffName,
      title: null,
    },
    roles: [],
    permissions: [],
    allBranches: session.allBranches,
    branches: session.branches.map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      isDefault: b.isDefault,
    })),
    activeBranch: null,
  };
}

function MoreScreen({
  session,
  onOpen,
  onLogout,
}: {
  session: MobileSession;
  onOpen: (kind: Screen) => void;
  onLogout: () => void;
}) {
  const items: { label: string; hint: string; target: Screen }[] = [
    { label: 'Senkron Merkezi', hint: 'Kuyruk, çakışmalar, reddedilenler', target: { kind: 'sync' } },
    { label: 'Fotoğraflar ve metadata', hint: 'Çevrimdışı yükleme kuyruğu', target: { kind: 'media' } },
    { label: 'Aşı Hatırlatmaları', hint: 'Önümüzdeki 30 gün', target: { kind: 'reminders' } },
    { label: 'Stok Hızlı Sorgu', hint: 'Ürün arama (salt görüntüleme)', target: { kind: 'stock' } },
    { label: 'Bildirimler', hint: 'Uygulama içi bildirim akışı', target: { kind: 'notifications' } },
  ];
  return (
    <View style={styles.screenInner}>
      <Text style={styles.sectionTitle}>Daha Fazla</Text>
      <View style={styles.moreCard}>
        {items.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => onOpen(item.target)}
            style={({ pressed }) => [styles.moreItem, pressed && styles.moreItemPressed]}
          >
            <Text style={styles.moreItemLabel}>{item.label}</Text>
            <Text style={styles.moreItemHint}>{item.hint}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.moreCard}>
        <Text style={styles.moreItemLabel}>{session.staffName}</Text>
        <Text style={styles.moreItemHint}>{session.email}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Çıkış yap"
          onPress={onLogout}
          style={styles.logoutButton}
        >
          <Text style={styles.logoutText}>Çıkış yap</Text>
        </Pressable>
      </View>
      <Text style={styles.version}>VetCore mobil · Faz 13 · Çevrimdışı senkronizasyon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.neutral50,
  },
  bootWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bootText: { color: COLORS.neutral600, fontSize: TYPO.body },
  authWrap: { flex: 1 },
  header: {
    backgroundColor: COLORS.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.neutral200,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    gap: SPACING.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBadges: { flexDirection: 'row', gap: SPACING.xs, alignItems: 'center' },
  wordmark: {
    fontSize: TYPO.h2,
    fontWeight: '700',
    color: COLORS.brand900,
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: TYPO.tiny,
    color: COLORS.brand700,
    marginTop: 2,
  },
  headerNote: {
    fontSize: TYPO.tiny,
    color: COLORS.neutral600,
    lineHeight: 16,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: SPACING.lg,
  },
  screenInner: {
    gap: SPACING.lg,
  },
  sectionTitle: {
    fontSize: TYPO.h2,
    fontWeight: '700',
    color: COLORS.neutral950,
  },
  moreCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.neutral200,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  moreItem: {
    minHeight: TOUCH_TARGET_MIN - 6,
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
  },
  moreItemPressed: { backgroundColor: COLORS.brand50 },
  moreItemLabel: {
    fontSize: TYPO.body,
    color: COLORS.neutral950,
    fontWeight: '600',
  },
  moreItemHint: {
    fontSize: TYPO.tiny,
    color: COLORS.neutral600,
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: STATUS.dangerBg,
    borderRadius: RADIUS.sm,
    minHeight: TOUCH_TARGET_MIN - 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xs,
  },
  logoutText: { color: STATUS.danger, fontWeight: '600' },
  version: {
    fontSize: TYPO.tiny,
    color: COLORS.neutral600,
    textAlign: 'center',
  },
});
