import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING, STATUS, TYPO } from '../theme/tokens';
import { EmptyState } from '../components/StateViews';
import { StatusChip, type StatusTone } from '../components/StatusChip';
import { MobileApiError, type MobileApi, type MobileNotificationRow } from '../lib/api';

/**
 * Faz 13 — uygulama içi bildirim akışı. Faz 12'nin bildirim kuyruğunun
 * uygulama içi (push) kanal kayıtları listelenir; sağlayıcı hatasından bağımsız
 * dürüst durum gösterilir (sent/failed/dead_letter).
 */
export function NotificationsScreen({ api, isOnline }: { api: MobileApi; isOnline: boolean }) {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    items: MobileNotificationRow[];
  }>({ loading: false, error: null, items: [] });

  useEffect(() => {
    if (!isOnline) return;
    void (async () => {
      setState({ loading: true, error: null, items: [] });
      try {
        setState({ loading: false, error: null, items: await api.notificationsList() });
      } catch (e) {
        setState({
          loading: false,
          error: e instanceof MobileApiError ? e.message : 'Bildirimler yüklenemedi',
          items: [],
        });
      }
    })();
  }, [api, isOnline]);

  if (!isOnline) {
    return (
      <EmptyState
        title="Çevrimdışı"
        description="Bildirim akışı sunucudan gelir; bağlantı geldiğinde listelenir."
      />
    );
  }

  const toneFor = (status: string): StatusTone =>
    status === 'sent' ? 'success' : status === 'failed' || status === 'dead_letter' ? 'danger' : 'neutral';
  const labelFor = (status: string): string =>
    status === 'sent'
      ? 'Gönderildi'
      : status === 'queued'
        ? 'Kuyrukta'
        : status === 'processing'
          ? 'İşleniyor'
          : status === 'failed'
            ? 'Başarısız'
            : status === 'dead_letter'
              ? 'Kuyruk dışı'
              : status;

  return (
    <View style={styles.wrap}>
      {state.loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={COLORS.brand600} />
          <Text style={styles.loadingText}>Yükleniyor…</Text>
        </View>
      )}
      {state.error !== null && (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{state.error}</Text>
        </View>
      )}
      {!state.loading && state.error === null && state.items.length === 0 && (
        <EmptyState title="Bildirim yok" description="Uygulama içi bildirim kaydı bulunmuyor." />
      )}
      <ScrollView nestedScrollEnabled contentContainerStyle={{ gap: SPACING.xs }}>
        {state.items.map((notification) => (
          <View key={notification.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{notification.title ?? 'Bildirim'}</Text>
              <Text style={styles.rowSub}>
                {notification.body ?? ''} · {new Date(notification.createdAt).toLocaleString('tr-TR')}
              </Text>
            </View>
            <StatusChip tone={toneFor(notification.status)} label={labelFor(notification.status)} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: SPACING.sm },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  loadingText: { color: COLORS.neutral600, fontSize: TYPO.small },
  errorBox: { backgroundColor: STATUS.dangerBg, borderRadius: RADIUS.sm, padding: SPACING.sm },
  errorText: { color: STATUS.danger, fontSize: TYPO.tiny },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.neutral200,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  rowTitle: { fontSize: TYPO.small, fontWeight: '600', color: COLORS.neutral950 },
  rowSub: { fontSize: TYPO.tiny, color: COLORS.neutral600, marginTop: 2 },
});
