import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { COLORS, RADIUS, SPACING, STATUS, TOUCH_TARGET_MIN, TYPO } from '../theme/tokens';
import { EmptyState } from '../components/StateViews';
import { StatusChip, type StatusTone } from '../components/StatusChip';
import {
  MobileApiError,
  timeShort,
  type MobileApi,
  type MobileProduct,
  type MobileReminder,
} from '../lib/api';
import type { StoragePorts, DraftRow } from '../lib/db/ports';
import type { SyncEngine } from '../lib/sync/engine';

/**
 * Faz 13 — aşı hatırlatmaları, görevler ve stok hızlı sorgu ekranları.
 * Veri gerçek API uçlarından gelir; çevrimdışıyken dürüst durum gösterilir
 * (sahte veri yok — agents.md kuralı).
 */

// -------------------------------------------------------------- hatırlatmalar

export function VaccineRemindersScreen({ api, isOnline }: { api: MobileApi; isOnline: boolean }) {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    items: MobileReminder[];
  }>({ loading: false, error: null, items: [] });

  const load = useCallback(async (): Promise<void> => {
    if (!isOnline) return;
    setState({ loading: true, error: null, items: [] });
    try {
      const res = await api.vaccineReminders('upcoming');
      const items = Array.isArray(res) ? res : (res.items ?? []);
      setState({ loading: false, error: null, items });
    } catch (e) {
      setState({
        loading: false,
        error: e instanceof MobileApiError ? e.message : 'Hatırlatmalar yüklenemedi',
        items: [],
      });
    }
  }, [api, isOnline]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isOnline) {
    return (
      <EmptyState
        title="Çevrimdışı"
        description="Aşı hatırlatmaları sunucu verisidir; bağlantı geldiğinde listelenir."
      />
    );
  }
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
        <EmptyState title="Yaklaşan hatırlatma yok" description="Önümüzdeki 30 günde planlı aşı görünmüyor." />
      )}
      <ScrollView nestedScrollEnabled contentContainerStyle={{ gap: SPACING.xs }}>
        {state.items.map((reminder) => (
          <View key={reminder.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {reminder.patient?.name ?? 'Hasta'} — {reminder.vaccineName ?? 'Aşı'}
              </Text>
              <Text style={styles.rowSub}>
                Plan: {new Date(reminder.dueAt).toLocaleDateString('tr-TR')}
                {reminder.owner ? ` · ${reminder.owner.firstName} ${reminder.owner.lastName}` : ''}
              </Text>
            </View>
            <StatusChip
              tone={reminder.status === 'scheduled' ? 'info' : reminder.status === 'sent' ? 'success' : 'neutral'}
              label={reminder.status === 'scheduled' ? 'Planlı' : reminder.status === 'sent' ? 'Gönderildi' : reminder.status}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// -------------------------------------------------------------------- görevler

/**
 * Görevler — bugünün randevuları ve çevrimdışı işlerden türetilir (sunucuda
 * ayrı bir Task modeli yoktur; bu ekran mevcut gerçek veriyi birleştirir):
 *  1. Check-in bekleyen planlı randevular
 *  2. Muayenede olan hastalar (tamamlama bekler)
 *  3. Cihazda bekleyen muayene taslakları (queued/local_only/conflict)
 */
export function TasksScreen({
  api,
  storage,
  isOnline,
  onOpenDraft,
}: {
  api: MobileApi;
  storage: StoragePorts;
  isOnline: boolean;
  onOpenDraft: (draft: DraftRow) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [appointments, setAppointments] = useState<
    { id: string; label: string; sub: string; time: string }[]
  >([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      if (isOnline) {
        const today = await api.todayAppointments();
        setAppointments(
          today
            .filter((a) => a.status === 'scheduled' || a.status === 'in_consultation')
            .map((a) => ({
              id: a.id,
              label:
                a.status === 'scheduled'
                  ? `Check-in: ${a.patient.name}`
                  : `Tamamlanmayı bekliyor: ${a.patient.name}`,
              sub: `${a.type.name} · ${a.staff.firstName} ${a.staff.lastName}`,
              time: timeShort(a.scheduledStart),
            })),
        );
      }
      setDrafts((await storage.drafts.list()).filter((d) => d.syncState !== 'synced'));
    } catch (e) {
      setError(e instanceof MobileApiError ? e.message : 'Görevler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [api, storage, isOnline]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.wrap}>
      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={COLORS.brand600} />
          <Text style={styles.loadingText}>Yükleniyor…</Text>
        </View>
      )}
      {error !== null && (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      <Text style={styles.sectionTitle}>Bugünün klinik görevleri</Text>
      {!isOnline && (
        <EmptyState
          title="Çevrimdışı"
          description="Bugünün randevu görevleri bağlantı geldiğinde listelenir."
        />
      )}
      {isOnline && appointments.length === 0 && !loading && (
        <EmptyState title="Bekleyen randevu görevi yok" description="Check-in ve muayene görevleri burada görünür." />
      )}
      {appointments.map((task) => (
        <View key={task.id} style={styles.row}>
          <Text style={styles.taskTime}>{task.time}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{task.label}</Text>
            <Text style={styles.rowSub}>{task.sub}</Text>
          </View>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Cihazda bekleyen taslaklar</Text>
      {drafts.length === 0 && (
        <EmptyState title="Bekleyen taslak yok" description="Çevrimdışı açılan muayene taslakları burada listelenir." />
      )}
      {drafts.map((draft) => (
        <Pressable
          key={draft.localId}
          accessibilityRole="button"
          accessibilityLabel={`${draft.patientName ?? 'hasta'} taslağını aç`}
          onPress={() => onOpenDraft(draft)}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{draft.patientName ?? 'Hasta'} — muayene taslağı</Text>
            <Text style={styles.rowSub}>
              {draft.syncState === 'conflict'
                ? 'Çakışma — iki versiyon korunuyor'
                : draft.syncState === 'queued'
                  ? 'Gönderim kuyruğunda'
                  : 'Cihazda — gönderilmedi'}
            </Text>
          </View>
          <StatusChip
            tone={draft.syncState === 'conflict' ? 'danger' : 'warning'}
            label={draft.syncState === 'conflict' ? 'Çakışma' : 'Bekliyor'}
          />
        </Pressable>
      ))}
    </View>
  );
}

// --------------------------------------------------------------- stok sorgusu

export function StockLookupScreen({ api, isOnline }: { api: MobileApi; isOnline: boolean }) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<MobileProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (term: string): Promise<void> => {
      if (!isOnline) return;
      setLoading(true);
      setError(null);
      try {
        setItems(await api.productLookup(term));
      } catch (e) {
        setError(e instanceof MobileApiError ? e.message : 'Ürün arama başarısız');
      } finally {
        setLoading(false);
      }
    },
    [api, isOnline],
  );

  if (!isOnline) {
    return (
      <EmptyState
        title="Çevrimdışı"
        description="Stok hızlı sorgusu sunucu verisidir — negatif stok/lot kararları asla önbellekten verilmez."
      />
    );
  }
  return (
    <View style={styles.wrap}>
      <TextInput
        accessibilityLabel="Ürün arama"
        style={styles.input}
        value={search}
        onChangeText={(t) => {
          setSearch(t);
          void load(t);
        }}
        placeholder="Ürün adı veya kodu"
        placeholderTextColor={COLORS.neutral600}
        autoCapitalize="none"
      />
      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={COLORS.brand600} />
          <Text style={styles.loadingText}>Aranıyor…</Text>
        </View>
      )}
      {error !== null && (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {!loading && items.length === 0 && !error && (
        <EmptyState title="Sonuç yok" description="Aramanızla eşleşen ürün bulunamadı." />
      )}
      {items.map((product) => (
        <View key={product.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{product.name}</Text>
            <Text style={styles.rowSub}>{product.code}</Text>
          </View>
        </View>
      ))}
      <Text style={styles.note}>
        Not: stok tüketim/kesinleşme kararları yalnız sunucu onaylı uçlarla yapılır —
        mobil hızlı sorgu salt görüntülemedir.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: SPACING.sm },
  sectionTitle: { fontSize: TYPO.body, fontWeight: '700', color: COLORS.neutral950 },
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
    minHeight: TOUCH_TARGET_MIN - 4,
  },
  rowPressed: { backgroundColor: COLORS.brand50 },
  rowTitle: { fontSize: TYPO.small, fontWeight: '600', color: COLORS.neutral950 },
  rowSub: { fontSize: TYPO.tiny, color: COLORS.neutral600, marginTop: 2 },
  taskTime: { fontSize: TYPO.small, fontWeight: '700', color: COLORS.brand600, width: 42 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.neutral200,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    minHeight: TOUCH_TARGET_MIN,
    fontSize: TYPO.body,
    color: COLORS.neutral950,
    backgroundColor: COLORS.white,
  },
  note: { fontSize: TYPO.tiny, color: COLORS.neutral600, lineHeight: 16 },
});
