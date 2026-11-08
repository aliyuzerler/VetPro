import { useEffect, useState } from 'react';
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
import {
  MobileApiError,
  type MobileApi,
  type MobilePatientSummary,
} from '../lib/api';
import type { StoragePorts } from '../lib/db/ports';

/**
 * Faz 13 — hasta arama ve özet. Online'da gerçek API araması; sonuçlar cihaz
 * önbelleğine yazılır. Offline'da arama yalnız önbellekten yapılır ve dürüstçe
 * "çevrimdışı — önbellek sonuçları" etiketiyle sunulur (sahte veri yok).
 */
export function PatientSearchScreen({
  api,
  storage,
  isOnline,
  onOpenPatient,
}: {
  api: MobileApi;
  storage: StoragePorts;
  isOnline: boolean;
  onOpenPatient: (patient: MobilePatientSummary) => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<MobilePatientSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  async function run(term: string): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      let rows: MobilePatientSummary[];
      if (isOnline) {
        rows = await api.patientSearch(term);
        // Sonuçlar çevrimdışı arama için önbelleğe yazılır.
        await storage.cache.upsert(
          rows.map((r) => ({
            entity: 'patient',
            id: r.id,
            updatedAt: new Date().toISOString(),
            payload: r as unknown as Record<string, unknown>,
          })),
        );
        setFromCache(false);
      } else {
        const cached = await storage.cache.list('patient', (payload) => {
          const name = String(payload['name'] ?? '').toLocaleLowerCase('tr-TR');
          const code = String(payload['code'] ?? '').toLocaleLowerCase('tr-TR');
          const q = term.trim().toLocaleLowerCase('tr-TR');
          return q === '' || name.includes(q) || code.includes(q);
        });
        rows = cached.map((c) => c.payload as unknown as MobilePatientSummary);
        setFromCache(true);
      }
      setResults(rows);
    } catch (e) {
      setError(e instanceof MobileApiError ? e.message : 'Arama başarısız — bağlantı hatası');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  // Açılışta önbellekten son hastalar (çevrimdışı ilk bakış).
  useEffect(() => {
    void run('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.wrap}>
      <TextInput
        accessibilityLabel="Hasta arama"
        style={styles.input}
        value={search}
        onChangeText={(t) => {
          setSearch(t);
          void run(t);
        }}
        placeholder="Hasta adı veya kodu"
        placeholderTextColor={COLORS.neutral600}
        autoCapitalize="none"
      />
      {fromCache && (
        <View style={styles.cacheBadge}>
          <Text style={styles.cacheText}>Çevrimdışı — önbellek sonuçları</Text>
        </View>
      )}
      {loading && (
        <View style={styles.loadingRow} accessibilityLiveRegion="polite">
          <ActivityIndicator color={COLORS.brand600} />
          <Text style={styles.loadingText}>Aranıyor…</Text>
        </View>
      )}
      {error !== null && (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {!loading && results.length === 0 && error === null && (
        <EmptyState
          title="Kayıt bulunamadı"
          description={
            isOnline
              ? 'Aramanızla eşleşen hasta yok.'
              : 'Çevrimdışıyken yalnız daha önce görüntülenen hastalar aranabilir.'
          }
        />
      )}
      {results.length > 0 && (
        <ScrollView nestedScrollEnabled>
          {results.map((patient) => (
            <Pressable
              key={patient.id}
              accessibilityRole="button"
              accessibilityLabel={`${patient.name} hastasını aç`}
              onPress={() => onOpenPatient(patient)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {patient.name} ({patient.code})
                </Text>
                <Text style={styles.rowSub}>
                  {patient.species?.name ?? 'Tür belirtilmemiş'}
                  {patient.owner ? ` · ${patient.owner.firstName} ${patient.owner.lastName}` : ''}
                </Text>
              </View>
              {(patient.alerts?.length ?? 0) > 0 && (
                <View style={styles.alertBadge}>
                  <Text style={styles.alertText}>{patient.alerts!.length} uyarı</Text>
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** Hasta özeti — önbellekteki son veri + taslak açma eylemi App'te bağlanır. */
export function PatientSummaryScreen({
  patient,
  onOpenDraft,
  onBack,
}: {
  patient: MobilePatientSummary;
  onOpenDraft: () => void;
  onBack: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" accessibilityLabel="Aramaya dön" onPress={onBack}>
        <Text style={styles.back}>← Arama</Text>
      </Pressable>
      <View style={styles.card}>
        <Text style={styles.title}>{patient.name}</Text>
        <Text style={styles.code}>{patient.code}</Text>
        <Text style={styles.line}>
          {patient.species?.name ?? 'Tür belirtilmemiş'}
          {patient.breed?.name ? ` · ${patient.breed.name}` : ''}
        </Text>
        {patient.owner && (
          <Text style={styles.line}>
            Sahip: {patient.owner.firstName} {patient.owner.lastName}
          </Text>
        )}
        {(patient.alerts?.length ?? 0) > 0 && (
          <View style={styles.alertsBox}>
            {patient.alerts!.map((a) => (
              <Text key={`${a.kind}-${a.label}`} style={styles.alertLine}>
                • {a.label}
              </Text>
            ))}
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Muayene taslağı aç"
          onPress={onOpenDraft}
          style={styles.draftButton}
        >
          <Text style={styles.draftButtonText}>Muayene taslağı aç</Text>
        </Pressable>
      </View>
      <Text style={styles.note}>
        Muayene taslağı çevrimdışı çalışır: SOAP ve vital kayıtları cihazda saklanır,
        bağlantı geldiğinde sunucu onayıyla kalıcılaşır.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: SPACING.md },
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
  cacheBadge: {
    alignSelf: 'flex-start',
    backgroundColor: STATUS.warningBg,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  cacheText: { color: STATUS.warning, fontSize: TYPO.tiny },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  loadingText: { color: COLORS.neutral600, fontSize: TYPO.small },
  errorBox: {
    backgroundColor: STATUS.dangerBg,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
  },
  errorText: { color: STATUS.danger, fontSize: TYPO.tiny },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.neutral200,
    padding: SPACING.md,
    minHeight: TOUCH_TARGET_MIN,
    marginBottom: SPACING.xs,
  },
  rowPressed: { backgroundColor: COLORS.brand50 },
  rowTitle: { fontSize: TYPO.body, fontWeight: '600', color: COLORS.neutral950 },
  rowSub: { fontSize: TYPO.tiny, color: COLORS.neutral600, marginTop: 2 },
  alertBadge: {
    backgroundColor: STATUS.warningBg,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  alertText: { color: STATUS.warning, fontSize: TYPO.tiny },
  back: { color: COLORS.brand600, fontSize: TYPO.small, fontWeight: '600' },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.neutral200,
    padding: SPACING.lg,
    gap: SPACING.xs,
  },
  title: { fontSize: TYPO.h2, fontWeight: '700', color: COLORS.neutral950 },
  code: { fontSize: TYPO.tiny, color: COLORS.neutral600 },
  line: { fontSize: TYPO.small, color: COLORS.neutral600 },
  alertsBox: {
    backgroundColor: STATUS.warningBg,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    marginTop: SPACING.xs,
  },
  alertLine: { color: STATUS.warning, fontSize: TYPO.tiny },
  draftButton: {
    backgroundColor: COLORS.brand600,
    borderRadius: RADIUS.md,
    minHeight: TOUCH_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
  },
  draftButtonText: { color: COLORS.white, fontWeight: '600', fontSize: TYPO.body },
  note: { fontSize: TYPO.tiny, color: COLORS.neutral600, lineHeight: 16 },
});
