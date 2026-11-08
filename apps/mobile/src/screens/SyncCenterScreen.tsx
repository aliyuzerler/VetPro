import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { COLORS, RADIUS, SPACING, STATUS, TOUCH_TARGET_MIN, TYPO } from '../theme/tokens';
import { EmptyState } from '../components/StateViews';
import type { StoragePorts } from '../lib/db/ports';
import type { SyncEngine, SyncRunSummary } from '../lib/sync/engine';

/**
 * Faz 13 — senkron merkezi. Kuyruk durumu, son senkron zamanı, çakışmalar
 * (YEREL ve SUNUCU versiyonu yan yana — sessiz overwrite yok), reddedilen
 * işlemler ve elle tetikleme. Restart recovery buradan doğrulanabilir:
 * uygulama kapanıp açıldığında in_flight işlemler queued'a döner.
 */
export function SyncCenterScreen({
  storage,
  engine,
  isOnline,
  onChanged,
}: {
  storage: StoragePorts;
  engine: SyncEngine;
  isOnline: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [lastRun, setLastRun] = useState<SyncRunSummary | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [counts, setCounts] = useState({ queued: 0, conflict: 0, rejected: 0, accepted: 0 });
  const [conflicts, setConflicts] = useState<Awaited<ReturnType<StoragePorts['conflicts']['listAll']>>>([]);

  const refresh = useCallback(async (): Promise<void> => {
    const [queued, conflict, rejected, accepted, conflictRows, lastSync, pullCursor] = await Promise.all([
      storage.outbox.count('queued'),
      storage.outbox.count('conflict'),
      storage.outbox.count('rejected'),
      storage.outbox.count('accepted'),
      storage.conflicts.listAll(),
      storage.meta.get('lastSyncAt'),
      storage.meta.get('pullCursor'),
    ]);
    setCounts({ queued, conflict, rejected, accepted });
    setConflicts(conflictRows);
    setLastSyncAt(lastSync);
    setCursor(pullCursor);
  }, [storage]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function syncNow(): Promise<void> {
    setBusy(true);
    try {
      const run = await engine.syncNow();
      setLastRun(run);
      await refresh();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function resolveKeepServer(id: string): Promise<void> {
    // Sunucuyu tut: işlem rejected sayılır, taslak sunucu verisiyle eşitlenir.
    await storage.conflicts.resolve(id, 'resolved_keep_server');
    const op = await storage.outbox.get(id);
    if (op) {
      await storage.outbox.markStatus(id, 'rejected', {
        lastError: 'Çakışma çözüldü: sunucu versiyonu korundu',
      });
    }
    await refresh();
  }

  async function resolveKeepLocal(id: string): Promise<void> {
    // Yereli tut: motor sunucu sürümünü temel alarak işlemi yeniden kuyruğa alır.
    await storage.conflicts.resolve(id, 'resolved_keep_local');
    await storage.outbox.markStatus(id, 'queued', { lastError: null });
    await refresh();
  }

  const kpi = [
    { label: 'Kuyrukta', value: counts.queued, bg: STATUS.warningBg, fg: STATUS.warning },
    { label: 'Çakışma', value: counts.conflict, bg: STATUS.dangerBg, fg: STATUS.danger },
    { label: 'Reddedilen', value: counts.rejected, bg: STATUS.neutralBg, fg: STATUS.neutral },
    { label: 'Onaylı', value: counts.accepted, bg: STATUS.successBg, fg: STATUS.success },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.kpiRow}>
        {kpi.map((item) => (
          <View key={item.label} style={[styles.kpi, { backgroundColor: item.bg }]}>
            <Text style={[styles.kpiValue, { color: item.fg }]}>{item.value}</Text>
            <Text style={[styles.kpiLabel, { color: item.fg }]}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoLine}>
          Bağlantı: {isOnline ? 'Çevrimiçi' : 'Çevrimdışı (işlemler kuyrukta bekler)'}
        </Text>
        <Text style={styles.infoLine}>
          Son senkron: {lastSyncAt ? new Date(lastSyncAt).toLocaleString('tr-TR') : 'Henüz yapılmadı'}
        </Text>
        <Text style={styles.infoLine} numberOfLines={1}>
          Delta imleci: {cursor ? 'mevcut' : 'ilk yükleme bekleniyor'}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Şimdi senkronize et"
        accessibilityState={{ busy }}
        disabled={busy}
        onPress={() => void syncNow()}
        style={({ pressed }) => [styles.syncButton, pressed && styles.pressed, busy && styles.disabled]}
      >
        {busy ? (
          <ActivityIndicator color={COLORS.white} />
        ) : (
          <Text style={styles.syncButtonText}>Şimdi senkronize et</Text>
        )}
      </Pressable>

      {lastRun && (
        <View style={styles.resultCard} accessibilityRole="status">
          <Text style={styles.resultTitle}>Son tur</Text>
          <Text style={styles.resultLine}>
            Push: {lastRun.push.accepted} onay · {lastRun.push.duplicate} replay ·{' '}
            {lastRun.push.conflict} çakışma · {lastRun.push.rejected} red
            {lastRun.push.networkError ? ' · ağ hatası (kuyrukta)' : ''}
          </Text>
          <Text style={styles.resultLine}>
            Pull: {lastRun.pull.pulled} kayıt{lastRun.pull.hasMore ? ' (devam var)' : ''}
            {lastRun.pull.networkError ? ' · ağ hatası' : ''}
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle} accessibilityRole="header">
        Çakışmalar
      </Text>
      {conflicts.length === 0 && (
        <EmptyState title="Çakışma yok" description="Sürüm uyuşmazlığı oluştuğunda iki versiyon burada listelenir." />
      )}
      <ScrollView nestedScrollEnabled contentContainerStyle={styles.conflictList}>
        {conflicts.map((conflict) => (
          <View
            key={conflict.id}
            style={[
              styles.conflictCard,
              conflict.status !== 'open' && styles.conflictResolved,
            ]}
          >
            <Text style={styles.conflictKind}>
              {conflict.kind} · {conflict.entity}
            </Text>
            <Text style={styles.conflictStatus}>
              {conflict.status === 'open'
                ? 'Açık — iki versiyon korunuyor'
                : conflict.status === 'resolved_keep_server'
                  ? 'Çözüldü: sunucu korundu'
                  : 'Çözüldü: yerel korundu (yeniden gönderilecek)'}
            </Text>
            <View style={styles.versionsRow}>
              <View style={styles.versionBox}>
                <Text style={styles.versionTitle}>Cihaz (yerel) — v{conflict.localVersion}</Text>
                <Text style={styles.versionBody} numberOfLines={4}>
                  {JSON.stringify(conflict.localPayload)}
                </Text>
              </View>
              <View style={styles.versionBox}>
                <Text style={styles.versionTitle}>Sunucu — v{conflict.serverVersion}</Text>
                <Text style={styles.versionBody} numberOfLines={4}>
                  {JSON.stringify(conflict.serverSnapshot)}
                </Text>
              </View>
            </View>
            {conflict.status === 'open' && (
              <View style={styles.resolveRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sunucu versiyonunu koru"
                  onPress={() => void resolveKeepServer(conflict.id)}
                  style={[styles.resolveButton, styles.resolveServer]}
                >
                  <Text style={styles.resolveButtonText}>Sunucuyu koru</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Yerel versiyonu koru"
                  onPress={() => void resolveKeepLocal(conflict.id)}
                  style={[styles.resolveButton, styles.resolveLocal]}
                >
                  <Text style={styles.resolveButtonText}>Yereli koru ve gönder</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: SPACING.md },
  kpiRow: { flexDirection: 'row', gap: SPACING.xs },
  kpi: { flex: 1, borderRadius: RADIUS.md, padding: SPACING.sm, alignItems: 'center' },
  kpiValue: { fontSize: TYPO.h2, fontWeight: '700' },
  kpiLabel: { fontSize: TYPO.tiny },
  infoCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.neutral200,
    padding: SPACING.md,
    gap: 2,
  },
  infoLine: { fontSize: TYPO.tiny, color: COLORS.neutral600 },
  syncButton: {
    backgroundColor: COLORS.brand600,
    borderRadius: RADIUS.md,
    minHeight: TOUCH_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: COLORS.brand700 },
  disabled: { opacity: 0.6 },
  syncButtonText: { color: COLORS.white, fontWeight: '600' },
  resultCard: {
    backgroundColor: STATUS.infoBg,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: 2,
  },
  resultTitle: { fontSize: TYPO.tiny, fontWeight: '700', color: STATUS.info },
  resultLine: { fontSize: TYPO.tiny, color: STATUS.info },
  sectionTitle: { fontSize: TYPO.body, fontWeight: '700', color: COLORS.neutral950 },
  conflictList: { gap: SPACING.sm, paddingBottom: SPACING.xl },
  conflictCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: STATUS.danger,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  conflictResolved: { borderColor: COLORS.neutral200, opacity: 0.75 },
  conflictKind: { fontSize: TYPO.small, fontWeight: '700', color: COLORS.neutral950 },
  conflictStatus: { fontSize: TYPO.tiny, color: STATUS.danger },
  versionsRow: { flexDirection: 'row', gap: SPACING.xs },
  versionBox: {
    flex: 1,
    backgroundColor: COLORS.neutral50,
    borderRadius: RADIUS.sm,
    padding: SPACING.xs,
  },
  versionTitle: { fontSize: TYPO.tiny, fontWeight: '700', color: COLORS.neutral950 },
  versionBody: { fontSize: 9, color: COLORS.neutral600, fontFamily: undefined },
  resolveRow: { flexDirection: 'row', gap: SPACING.xs },
  resolveButton: {
    flex: 1,
    borderRadius: RADIUS.sm,
    minHeight: TOUCH_TARGET_MIN - 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resolveServer: { backgroundColor: STATUS.dangerBg },
  resolveLocal: { backgroundColor: STATUS.successBg },
  resolveButtonText: { fontSize: TYPO.tiny, fontWeight: '600', color: COLORS.neutral950 },
});
